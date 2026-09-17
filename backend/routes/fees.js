const express = require('express');
const router = express.Router();
const db = require('../database/db');
const dayjs = require('dayjs');

// GET /api/fees/subscriptions?payment_status=&search=  -> dues list / fee tracker table
router.get('/subscriptions', async (req, res) => {
  const { payment_status, search } = req.query;
  let sql = `
    SELECT s.*, m.full_name, m.member_code, m.phone, p.name AS plan_name
    FROM subscriptions s
    JOIN members m ON m.id = s.member_id
    JOIN plans p ON p.id = s.plan_id
    WHERE 1=1`;
  const params = [];
  if (payment_status) { sql += ` AND s.payment_status = ?`; params.push(payment_status); }
  if (search) {
    sql += ` AND (m.full_name LIKE ? OR m.member_code LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ` ORDER BY s.start_date DESC`;
  res.json(await db.all(sql, params));
});

// POST /api/fees/subscriptions  -> assign/renew a plan for an existing member
router.post('/subscriptions', async (req, res) => {
  const { member_id, plan_id, start_date, total_fee, amount_paid } = req.body;
  if (!member_id || !plan_id || !start_date) {
    return res.status(400).json({ error: 'member_id, plan_id, start_date are required' });
  }
  const plan = await db.get('SELECT * FROM plans WHERE id = ?', [plan_id]);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const end_date = dayjs(start_date).add(plan.duration_days, 'day').format('YYYY-MM-DD');
  const fee = total_fee != null ? total_fee : plan.price;
  const paid = amount_paid != null ? amount_paid : 0;

  const id = await db.transaction(async (tx) => {
    const result = await tx.run(`
      INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, total_fee, amount_paid)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [member_id, plan_id, start_date, end_date, fee, paid]);
    if (paid > 0) {
      await tx.run(`
        INSERT INTO payments (subscription_id, member_id, amount, payment_mode, payment_date, receipt_no, note)
        VALUES (?, ?, ?, 'cash', ?, ?, 'Initial payment on plan assignment')
      `, [result.lastInsertRowid, member_id, paid, start_date, 'RCPT' + Date.now()]);
    }
    return result.lastInsertRowid;
  });

  res.status(201).json(await db.get('SELECT * FROM subscriptions WHERE id = ?', [id]));
});

router.put('/subscriptions/:id', async (req, res) => {
  const sub = await db.get('SELECT * FROM subscriptions WHERE id = ?', [req.params.id]);
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });
  const { start_date, total_fee, plan_id } = req.body;
  const plan = await db.get('SELECT * FROM plans WHERE id = ?', [plan_id || sub.plan_id]);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const start = start_date || sub.start_date;
  const fee = total_fee != null ? total_fee : sub.total_fee;
  if (Number(fee) < Number(sub.amount_paid)) return res.status(400).json({ error: 'Total fee cannot be below the amount already paid' });
  const end = dayjs(start).add(plan.duration_days, 'day').format('YYYY-MM-DD');
  await db.run('UPDATE subscriptions SET plan_id=?, start_date=?, end_date=?, total_fee=? WHERE id=?', [plan.id, start, end, fee, sub.id]);
  res.json(await db.get('SELECT * FROM subscriptions WHERE id = ?', [sub.id]));
});

router.delete('/subscriptions/:id', async (req, res) => {
  const result = await db.run('DELETE FROM subscriptions WHERE id = ?', [req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Subscription not found' });
  res.json({ success: true });
});

// POST /api/fees/payments  -> record a manual payment against a subscription
router.post('/payments', async (req, res) => {
  const { subscription_id, amount, payment_mode, payment_date, note } = req.body;
  if (!subscription_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'subscription_id and a positive amount are required' });
  }
  const sub = await db.get('SELECT * FROM subscriptions WHERE id = ?', [subscription_id]);
  if (!sub) return res.status(404).json({ error: 'Subscription not found' });

  const remaining = sub.total_fee - sub.amount_paid;
  if (amount > remaining + 0.001) {
    return res.status(400).json({ error: `Amount exceeds balance due (₹${remaining.toFixed(2)})` });
  }

  const receiptNo = 'RCPT' + Date.now();
  await db.transaction(async (tx) => {
    await tx.run(`
      INSERT INTO payments (subscription_id, member_id, amount, payment_mode, payment_date, receipt_no, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [subscription_id, sub.member_id, amount, payment_mode || 'cash', payment_date || dayjs().format('YYYY-MM-DD'), receiptNo, note || null]);
    await tx.run('UPDATE subscriptions SET amount_paid = amount_paid + ? WHERE id = ?', [amount, subscription_id]);
  });

  const payment = await db.get('SELECT * FROM payments WHERE receipt_no = ?', [receiptNo]);
  res.status(201).json(payment);
});

// GET /api/fees/receipt/:paymentId  -> full receipt data for printing/downloading
router.get('/receipt/:paymentId', async (req, res) => {
  const payment = await db.get(`
    SELECT pay.*, m.full_name, m.member_code, m.phone, p.name AS plan_name,
      s.total_fee, s.amount_paid, s.balance_due, s.payment_status
    FROM payments pay
    JOIN members m ON m.id = pay.member_id
    JOIN subscriptions s ON s.id = pay.subscription_id
    JOIN plans p ON p.id = s.plan_id
    WHERE pay.id = ?
  `, [req.params.paymentId]);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  res.json(payment);
});

module.exports = router;
