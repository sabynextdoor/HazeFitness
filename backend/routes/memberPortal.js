// \u2022 HF-GMS \u00b7 crafted & signed by Saby \u00b7 keep this header
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { configured, client, verifyCheckoutSignature, finalizePayment } = require('../services/razorpayPayments');

// All routes here run behind requireMemberAuth (mounted in server.js),
// so req.member is always the logged-in member's own row — every query
// below is scoped to req.member.id so a member can only ever see their
// own data.

// GET /api/portal/announcements — gym-wide info posted by admin
router.get('/announcements', async (req, res) => {
  const rows = await db.all(`
    SELECT a.id, a.title, a.message, a.created_at, s.full_name AS created_by_name
    FROM announcements a LEFT JOIN staff_users s ON s.id = a.created_by
    ORDER BY a.created_at DESC LIMIT 50
  `);
  res.json(rows);
});

router.get('/me', (req, res) => {
  const m = req.member;
  res.json({
    id: m.id, member_code: m.member_code, full_name: m.full_name, phone: m.phone,
    email: m.email, fitness_goal: m.fitness_goal, join_date: m.join_date, status: m.status,
  });
});

// GET /api/portal/attendance — own attendance history
router.get('/attendance', async (req, res) => {
  const rows = await db.all(
    `SELECT attendance_date, check_in, check_out FROM attendance
     WHERE member_id = ? ORDER BY attendance_date DESC LIMIT 90`,
    [req.member.id]
  );
  res.json(rows);
});

// Current consecutive attendance-day streak. Multiple check-ins on one date
// count as one gym day.
router.get('/attendance-streak', async (req, res) => {
  const rows = await db.all(
    `SELECT DISTINCT attendance_date FROM attendance WHERE member_id = ? ORDER BY attendance_date DESC`,
    [req.member.id]
  );
  let streak = 0;
  let expected = new Date();
  expected.setHours(0, 0, 0, 0);
  for (const row of rows) {
    const date = new Date(`${row.attendance_date}T00:00:00`);
    const diff = Math.round((expected - date) / 86400000);
    if (diff === 0) { streak += 1; expected.setDate(expected.getDate() - 1); }
    else if (streak === 0 && diff === 1) { streak += 1; expected = date; expected.setDate(expected.getDate() - 1); }
    else break;
  }
  res.json({ streak });
});

// GET /api/portal/diet — own diet plans
router.get('/diet', async (req, res) => {
  const rows = await db.all(
    `SELECT id, title, details, created_at FROM diet_plans
     WHERE member_id = ? ORDER BY created_at DESC`,
    [req.member.id]
  );
  res.json(rows);
});

// GET /api/portal/workout — own workout plans
router.get('/workout', async (req, res) => {
  const rows = await db.all(
    `SELECT id, title, details, created_at FROM workout_plans
     WHERE member_id = ? ORDER BY created_at DESC`,
    [req.member.id]
  );
  res.json(rows);
});

// GET /api/portal/classes — all classes open for booking, with the member's
// own booking (if any) for each, so the UI can show "Book" vs "Booked"
router.get('/classes', async (req, res) => {
  const rows = await db.all(`
    SELECT c.*, t.full_name AS trainer_name,
      (SELECT COUNT(*) FROM class_bookings b WHERE b.class_id = c.id) AS booked_count
    FROM classes c LEFT JOIN trainers t ON t.id = c.trainer_id
    ORDER BY c.slot_time
  `);
  res.json(rows);
});

// GET /api/portal/bookings — own upcoming/past class bookings
router.get('/bookings', async (req, res) => {
  const rows = await db.all(`
    SELECT b.id, b.booking_date, c.name AS class_name, c.slot_time, c.days_of_week,
      t.full_name AS trainer_name
    FROM class_bookings b
    JOIN classes c ON c.id = b.class_id
    LEFT JOIN trainers t ON t.id = c.trainer_id
    WHERE b.member_id = ?
    ORDER BY b.booking_date DESC
  `, [req.member.id]);
  res.json(rows);
});

// POST /api/portal/classes/:id/book  { booking_date }
router.post('/classes/:id/book', async (req, res) => {
  const { booking_date } = req.body || {};
  if (!booking_date) return res.status(400).json({ error: 'booking_date is required' });
  const cls = await db.get('SELECT * FROM classes WHERE id = ?', [req.params.id]);
  if (!cls) return res.status(404).json({ error: 'Class not found' });

  const bookedCount = (await db.get(
    'SELECT COUNT(*) AS c FROM class_bookings WHERE class_id = ? AND booking_date = ?',
    [req.params.id, booking_date]
  )).c;
  if (bookedCount >= cls.capacity) return res.status(409).json({ error: 'Class is at full capacity for that date' });

  try {
    const result = await db.run(
      'INSERT INTO class_bookings (class_id, member_id, booking_date) VALUES (?, ?, ?)',
      [req.params.id, req.member.id, booking_date]
    );
    res.status(201).json(await db.get('SELECT * FROM class_bookings WHERE id = ?', [result.lastInsertRowid]));
  } catch (e) {
    res.status(409).json({ error: 'You already booked this class for that date' });
  }
});

// DELETE /api/portal/bookings/:id — cancel own booking
router.delete('/bookings/:id', async (req, res) => {
  const result = await db.run(
    'DELETE FROM class_bookings WHERE id = ? AND member_id = ?',
    [req.params.id, req.member.id]
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Booking not found' });
  res.json({ success: true });
});

// GET /api/portal/payments — own subscriptions + fee/payment history
router.get('/payments', async (req, res) => {
  const subscriptions = await db.all(`
    SELECT s.*, p.name AS plan_name
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id
    WHERE s.member_id = ? ORDER BY s.start_date DESC
  `, [req.member.id]);

  const payments = await db.all(`
    SELECT id, amount, payment_mode, payment_date, receipt_no, note
    FROM payments WHERE member_id = ? ORDER BY payment_date DESC
  `, [req.member.id]);

  res.json({ subscriptions, payments });
});

router.post('/payments/orders', async (req, res) => {
  const subscriptionId = Number(req.body?.subscription_id);
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(subscriptionId) || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'A subscription and positive payment amount are required' });
  }
  const subscription = await db.get('SELECT * FROM subscriptions WHERE id = ? AND member_id = ?', [subscriptionId, req.member.id]);
  if (!subscription) return res.status(404).json({ error: 'Subscription not found' });
  if (amount > Number(subscription.balance_due) + 0.001) return res.status(400).json({ error: 'Amount exceeds the balance due' });

  const roundedAmount = Math.round(amount * 100) / 100;
  const onlineEnabled = configured();

  // Without real Razorpay keys (and never in production), create a mock order so
  // the full subscription-payment flow stays usable for testing and demos.
  let order;
  if (onlineEnabled) {
    order = await client().orders.create({
      amount: Math.round(roundedAmount * 100), currency: 'INR',
      receipt: `sub_${subscription.id}_${Date.now()}`,
      notes: { subscription_id: String(subscription.id), member_id: String(req.member.id) },
    });
  } else {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'Online payments are not configured yet. Contact the front desk.' });
    }
    order = {
      id: `mock_${Date.now()}`,
      amount: Math.round(roundedAmount * 100),
      currency: 'INR',
      key_id: 'mock',
    };
  }
  await db.run(`INSERT INTO payment_orders (subscription_id, member_id, amount, razorpay_order_id)
    VALUES (?, ?, ?, ?)`, [subscription.id, req.member.id, roundedAmount, order.id]);
  res.status(201).json({
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: onlineEnabled ? process.env.RAZORPAY_KEY_ID : null,
    mock: !onlineEnabled,
  });
});

router.post('/payments/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, mock } = req.body || {};
  const order = await db.get('SELECT * FROM payment_orders WHERE razorpay_order_id = ? AND member_id = ?', [razorpay_order_id, req.member.id]);
  if (!order) return res.status(404).json({ error: 'Payment order not found' });
  const isMock = Boolean(mock) || String(order.razorpay_order_id).startsWith('mock_');
  if (!isMock && !verifyCheckoutSignature(order.razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }
  try {
    res.json(await finalizePayment({
      orderId: order.razorpay_order_id,
      paymentId: isMock ? (razorpay_payment_id || `mock_pay_${Date.now()}`) : razorpay_payment_id,
      mock: isMock,
    }));
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// A member may retrieve only their own receipt for browser printing/saving as PDF.
router.get('/receipt/:paymentId', async (req, res) => {
  const payment = await db.get(`
    SELECT pay.*, m.full_name, m.member_code, m.phone, p.name AS plan_name,
      s.total_fee, s.amount_paid, s.balance_due, s.payment_status
    FROM payments pay
    JOIN members m ON m.id = pay.member_id
    JOIN subscriptions s ON s.id = pay.subscription_id
    JOIN plans p ON p.id = s.plan_id
    WHERE pay.id = ? AND pay.member_id = ?
  `, [req.params.paymentId, req.member.id]);
  if (!payment) return res.status(404).json({ error: 'Receipt not found' });
  res.json(payment);
});

module.exports = router;
