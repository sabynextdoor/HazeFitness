const express = require('express');
const router = express.Router();
const db = require('../database/db');
const dayjs = require('dayjs');

// GET /api/members?search=&status=&trainer_id=&payment_status=
router.get('/', async (req, res) => {
  const { search, status, trainer_id, payment_status } = req.query;
  let sql = `
    SELECT m.*, t.full_name AS trainer_name,
      s.id AS subscription_id, p.name AS plan_name,
      s.start_date, s.end_date, s.total_fee, s.amount_paid, s.balance_due, s.payment_status
    FROM members m
    LEFT JOIN trainers t ON t.id = m.trainer_id
    LEFT JOIN (
      SELECT sub.*, ROW_NUMBER() OVER (PARTITION BY sub.member_id ORDER BY sub.start_date DESC, sub.id DESC) AS rn
      FROM subscriptions sub
    ) s ON s.member_id = m.id AND s.rn = 1
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ` AND (m.full_name LIKE ? OR m.member_code LIKE ? OR m.phone LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) { sql += ` AND m.status = ?`; params.push(status); }
  if (trainer_id) { sql += ` AND m.trainer_id = ?`; params.push(trainer_id); }
  if (payment_status) { sql += ` AND s.payment_status = ?`; params.push(payment_status); }
  sql += ` ORDER BY m.created_at DESC`;
  res.json(await db.all(sql, params));
});

// GET one member with full subscription/payment/attendance history
router.get('/:id', async (req, res) => {
  const member = await db.get(`
    SELECT m.*, t.full_name AS trainer_name FROM members m
    LEFT JOIN trainers t ON t.id = m.trainer_id WHERE m.id = ?`, [req.params.id]);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  member.subscriptions = await db.all(`
    SELECT s.*, p.name AS plan_name FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.member_id = ? ORDER BY s.start_date DESC`, [req.params.id]);

  member.payments = await db.all(`
    SELECT pay.* FROM payments pay WHERE pay.member_id = ? ORDER BY pay.payment_date DESC`,
    [req.params.id]
  );

  member.attendance = await db.all(`
    SELECT * FROM attendance WHERE member_id = ? ORDER BY attendance_date DESC LIMIT 30`,
    [req.params.id]
  );

  member.workout_plans = await db.all('SELECT * FROM workout_plans WHERE member_id = ? ORDER BY created_at DESC', [req.params.id]);
  member.diet_plans = await db.all('SELECT * FROM diet_plans WHERE member_id = ? ORDER BY created_at DESC', [req.params.id]);
  member.progress = await db.all('SELECT * FROM member_progress WHERE member_id = ? ORDER BY recorded_on DESC, id DESC', [req.params.id]);

  res.json(member);
});

// Full, export-friendly activity history used by the Member History page.
router.get('/:id/history', async (req, res) => {
  const member = await db.get(`SELECT m.id, m.member_code, m.full_name, m.phone, m.email,
    m.trainer_id, t.full_name AS trainer_name FROM members m
    LEFT JOIN trainers t ON t.id = m.trainer_id WHERE m.id = ?`, [req.params.id]);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const [attendance, payments, subscriptions, trainer_history] = await Promise.all([
    db.all('SELECT attendance_date, check_in, check_out FROM attendance WHERE member_id = ? ORDER BY attendance_date DESC, check_in DESC', [member.id]),
    db.all(`SELECT pay.payment_date, pay.receipt_no, pay.amount, pay.payment_mode, pay.note, p.name AS plan_name
      FROM payments pay LEFT JOIN subscriptions s ON s.id = pay.subscription_id
      LEFT JOIN plans p ON p.id = s.plan_id WHERE pay.member_id = ? ORDER BY pay.payment_date DESC, pay.id DESC`, [member.id]),
    db.all(`SELECT s.start_date, s.end_date, s.total_fee, s.trainer_fee, s.amount_paid, s.balance_due, s.payment_status, p.name AS plan_name
      FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.member_id = ? ORDER BY s.start_date DESC, s.id DESC`, [member.id]),
    db.all('SELECT assigned_at, trainer_name, trainer_fee FROM trainer_assignment_history WHERE member_id = ? ORDER BY assigned_at DESC, id DESC', [member.id]),
  ]);
  res.json({ member, attendance, payments, subscriptions, trainer_history });
});

router.post('/:id/progress', async (req, res) => {
  const member = await db.get('SELECT id FROM members WHERE id = ?', [req.params.id]);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const { recorded_on, weight_kg, height_cm, chest_cm, waist_cm, hips_cm, notes } = req.body;
  if (!recorded_on) return res.status(400).json({ error: 'Progress date is required' });
  const result = await db.run(`INSERT INTO member_progress
    (member_id, recorded_on, weight_kg, height_cm, chest_cm, waist_cm, hips_cm, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [member.id, recorded_on, weight_kg || null, height_cm || null, chest_cm || null, waist_cm || null, hips_cm || null, notes || null]);
  res.status(201).json(await db.get('SELECT * FROM member_progress WHERE id = ?', [result.lastInsertRowid]));
});

// Assign a trainer to a member's latest subscription. Trainer fees are kept
// separately and added to the subscription total so the payment balance stays accurate.
router.post('/:id/trainer-assignment', async (req, res) => {
  const member = await db.get('SELECT * FROM members WHERE id = ?', [req.params.id]);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const subscription = await db.get(
    'SELECT * FROM subscriptions WHERE member_id = ? ORDER BY start_date DESC, id DESC LIMIT 1',
    [member.id]
  );
  if (!subscription) return res.status(409).json({ error: 'Assign a subscription before assigning a trainer' });

  const { trainer_id, trainer_fee } = req.body;
  const fee = Number(trainer_fee || 0);
  if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ error: 'Trainer fee must be a positive number or zero' });

  let trainerId = trainer_id || null;
  if (trainerId) {
    const trainer = await db.get("SELECT id FROM trainers WHERE id = ? AND status = 'active'", [trainerId]);
    if (!trainer) return res.status(400).json({ error: 'Select an active trainer' });
  }
  if (!trainerId) trainerId = null;

  const currentTrainerFee = Number(subscription.trainer_fee || 0);
  const updatedTotal = Number(subscription.total_fee) - currentTrainerFee + (trainerId ? fee : 0);
  if (updatedTotal < Number(subscription.amount_paid)) {
    return res.status(400).json({ error: 'Trainer fee cannot reduce the total below the amount already paid' });
  }

  await db.transaction(async (tx) => {
    await tx.run('UPDATE members SET trainer_id = ? WHERE id = ?', [trainerId, member.id]);
    await tx.run('UPDATE subscriptions SET trainer_fee = ?, total_fee = ? WHERE id = ?', [trainerId ? fee : 0, updatedTotal, subscription.id]);
    const trainer = trainerId ? await tx.get('SELECT full_name FROM trainers WHERE id = ?', [trainerId]) : null;
    await tx.run('INSERT INTO trainer_assignment_history (member_id, trainer_id, trainer_name, trainer_fee) VALUES (?, ?, ?, ?)',
      [member.id, trainerId, trainer ? trainer.full_name : 'Unassigned', trainerId ? fee : 0]);
  });
  res.json({
    member: await db.get('SELECT * FROM members WHERE id = ?', [member.id]),
    subscription: await db.get('SELECT * FROM subscriptions WHERE id = ?', [subscription.id]),
  });
});

// POST /api/members  — create member, optionally with an initial plan+fee (creates a subscription)
router.post('/', async (req, res) => {
  const {
    full_name, gender, dob, phone, email, address, fitness_goal,
    emergency_contact_name, emergency_contact_phone, join_date,
    trainer_id, status,
    // optional initial subscription
    plan_id, total_fee, amount_paid, start_date
  } = req.body;

  if (!full_name || !phone || !join_date || !email) {
    return res.status(400).json({ error: 'full_name, phone, email, join_date are required (email + phone let the member log in to their portal)' });
  }

  try {
    const { memberId } = await db.transaction(async (tx) => {
      const result = await tx.run(`
        INSERT INTO members (member_code, full_name, gender, dob, phone, email, address,
          fitness_goal, emergency_contact_name, emergency_contact_phone, join_date, trainer_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'TEMP', full_name, gender || null, dob || null, phone, email, address || null,
        fitness_goal || null, emergency_contact_name || null, emergency_contact_phone || null,
        join_date, trainer_id || null, status || 'active'
      ]);
      const memberId = result.lastInsertRowid;
      const memberCode = 'SFC' + String(memberId).padStart(4, '0');
      await tx.run('UPDATE members SET member_code = ? WHERE id = ?', [memberCode, memberId]);

      let subscription = null;
      if (plan_id) {
        const plan = await tx.get('SELECT * FROM plans WHERE id = ?', [plan_id]);
        if (!plan) throw new Error('Invalid plan_id');
        const sd = start_date || join_date;
        const ed = dayjs(sd).add(plan.duration_days, 'day').format('YYYY-MM-DD');
        const fee = total_fee != null ? total_fee : plan.price;
        const paid = amount_paid != null ? amount_paid : 0;
        const subResult = await tx.run(`
          INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, total_fee, amount_paid)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [memberId, plan_id, sd, ed, fee, paid]);
        if (paid > 0) {
          await tx.run(`
            INSERT INTO payments (subscription_id, member_id, amount, payment_mode, payment_date, receipt_no, note)
            VALUES (?, ?, ?, 'cash', ?, ?, 'Initial payment at signup')
          `, [subResult.lastInsertRowid, memberId, paid, sd, 'RCPT' + Date.now()]);
        }
        subscription = await tx.get('SELECT * FROM subscriptions WHERE id = ?', [subResult.lastInsertRowid]);
      }
      return { memberId, subscription };
    });

    const member = await db.get('SELECT * FROM members WHERE id = ?', [memberId]);
    res.status(201).json(member);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM members WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Member not found' });
  const f = { ...existing, ...req.body };
  await db.run(`
    UPDATE members SET full_name=?, gender=?, dob=?, phone=?, email=?, address=?,
      fitness_goal=?, emergency_contact_name=?, emergency_contact_phone=?, join_date=?,
      trainer_id=?, status=?, photo_data=? WHERE id=?
  `, [
    f.full_name, f.gender, f.dob, f.phone, f.email, f.address, f.fitness_goal,
    f.emergency_contact_name, f.emergency_contact_phone, f.join_date, f.trainer_id,
    f.status, f.photo_data || null, req.params.id
  ]);
  res.json(await db.get('SELECT * FROM members WHERE id = ?', [req.params.id]));
});

router.delete('/:id', async (req, res) => {
  const member = await db.get('SELECT id FROM members WHERE id = ?', [req.params.id]);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  // Payments point directly to both members and subscriptions. Delete them
  // explicitly before subscriptions so MySQL foreign-key rules cannot block
  // removal of a member with payment history.
  await db.transaction(async (tx) => {
    await tx.run("DELETE FROM sessions WHERE user_type = 'member' AND user_id = ?", [member.id]);
    await tx.run('DELETE FROM payments WHERE member_id = ?', [member.id]);
    await tx.run('DELETE FROM subscriptions WHERE member_id = ?', [member.id]);
    await tx.run('DELETE FROM members WHERE id = ?', [member.id]);
  });
  res.json({ success: true });
});

module.exports = router;
