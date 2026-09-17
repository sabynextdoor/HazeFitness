const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET all trainers (with live member count + upcoming class count)
router.get('/', async (req, res) => {
  const { search } = req.query;
  let sql = `
    SELECT t.*,
      (SELECT COUNT(*) FROM members m WHERE m.trainer_id = t.id AND m.status='active') AS active_members,
      (SELECT COUNT(*) FROM classes c WHERE c.trainer_id = t.id) AS class_count
    FROM trainers t`;
  const params = [];
  if (search) {
    sql += ` WHERE t.full_name LIKE ? OR t.phone LIKE ? OR t.specialization LIKE ?`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY t.full_name';
  res.json(await db.all(sql, params));
});

// GET one trainer, plus their schedule (classes) and assigned members
router.get('/:id', async (req, res) => {
  const trainer = await db.get('SELECT * FROM trainers WHERE id = ?', [req.params.id]);
  if (!trainer) return res.status(404).json({ error: 'Trainer not found' });
  trainer.classes = await db.all('SELECT * FROM classes WHERE trainer_id = ?', [req.params.id]);
  trainer.members = await db.all(
    'SELECT id, member_code, full_name, phone, status FROM members WHERE trainer_id = ?',
    [req.params.id]
  );
  res.json(trainer);
});

router.post('/', async (req, res) => {
  const { full_name, phone, email, specialization, schedule_notes, status } = req.body;
  if (!full_name || !phone) return res.status(400).json({ error: 'full_name and phone are required' });
  const result = await db.run(
    `INSERT INTO trainers (full_name, phone, email, specialization, schedule_notes, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [full_name, phone, email || null, specialization || null, schedule_notes || null, status || 'active']
  );
  res.status(201).json(await db.get('SELECT * FROM trainers WHERE id = ?', [result.lastInsertRowid]));
});

router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM trainers WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Trainer not found' });
  const f = { ...existing, ...req.body };
  await db.run(
    `UPDATE trainers SET full_name=?, phone=?, email=?, specialization=?, schedule_notes=?, status=? WHERE id=?`,
    [f.full_name, f.phone, f.email, f.specialization, f.schedule_notes, f.status, req.params.id]
  );
  res.json(await db.get('SELECT * FROM trainers WHERE id = ?', [req.params.id]));
});

router.delete('/:id', async (req, res) => {
  await db.run('UPDATE members SET trainer_id = NULL WHERE trainer_id = ?', [req.params.id]);
  const result = await db.run('DELETE FROM trainers WHERE id = ?', [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: 'Trainer not found' });
  res.json({ success: true });
});

module.exports = router;
