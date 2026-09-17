// \u2022 HF-GMS \u00b7 crafted & signed by Saby \u00b7 keep this header
const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET all classes with trainer name + current booking count
router.get('/', async (req, res) => {
  const classes = await db.all(`
    SELECT c.*, t.full_name AS trainer_name,
      (SELECT COUNT(*) FROM class_bookings b WHERE b.class_id = c.id) AS booked_count
    FROM classes c LEFT JOIN trainers t ON t.id = c.trainer_id
    ORDER BY c.slot_time
  `);
  res.json(classes);
});

router.post('/', async (req, res) => {
  const { name, trainer_id, slot_time, days_of_week, capacity } = req.body;
  if (!name || !slot_time || !days_of_week) {
    return res.status(400).json({ error: 'name, slot_time, days_of_week are required' });
  }
  const result = await db.run(`
    INSERT INTO classes (name, trainer_id, slot_time, days_of_week, capacity)
    VALUES (?, ?, ?, ?, ?)
  `, [name, trainer_id || null, slot_time, days_of_week, capacity || 20]);
  res.status(201).json(await db.get('SELECT * FROM classes WHERE id = ?', [result.lastInsertRowid]));
});

router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM classes WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Class not found' });
  const f = { ...existing, ...req.body };
  await db.run(`
    UPDATE classes SET name=?, trainer_id=?, slot_time=?, days_of_week=?, capacity=? WHERE id=?
  `, [f.name, f.trainer_id, f.slot_time, f.days_of_week, f.capacity, req.params.id]);
  res.json(await db.get('SELECT * FROM classes WHERE id = ?', [req.params.id]));
});

router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM classes WHERE id = ?', [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: 'Class not found' });
  res.json({ success: true });
});

// POST /api/classes/:id/book  { member_id, booking_date }
router.post('/:id/book', async (req, res) => {
  const { member_id, booking_date } = req.body;
  if (!member_id || !booking_date) return res.status(400).json({ error: 'member_id and booking_date required' });
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
      [req.params.id, member_id, booking_date]
    );
    res.status(201).json(await db.get('SELECT * FROM class_bookings WHERE id = ?', [result.lastInsertRowid]));
  } catch (e) {
    res.status(409).json({ error: 'Member already booked for this class on this date' });
  }
});

// GET /api/classes/:id/bookings?date=
router.get('/:id/bookings', async (req, res) => {
  const { date } = req.query;
  let sql = `SELECT b.*, m.full_name, m.member_code FROM class_bookings b
             JOIN members m ON m.id = b.member_id WHERE b.class_id = ?`;
  const params = [req.params.id];
  if (date) { sql += ' AND b.booking_date = ?'; params.push(date); }
  res.json(await db.all(sql, params));
});

module.exports = router;
