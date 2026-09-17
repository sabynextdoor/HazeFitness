// Note: named plansFitness.js to avoid clashing with routes/plans.js (membership plans)
const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ---- Workout plans ----
router.get('/workout/:memberId', async (req, res) => {
  res.json(await db.all('SELECT * FROM workout_plans WHERE member_id = ? ORDER BY created_at DESC', [req.params.memberId]));
});

router.post('/workout', async (req, res) => {
  const { member_id, trainer_id, title, details } = req.body;
  if (!member_id || !title || !details) return res.status(400).json({ error: 'member_id, title, details are required' });
  const result = await db.run(
    'INSERT INTO workout_plans (member_id, trainer_id, title, details) VALUES (?, ?, ?, ?)',
    [member_id, trainer_id || null, title, details]
  );
  res.status(201).json(await db.get('SELECT * FROM workout_plans WHERE id = ?', [result.lastInsertRowid]));
});

router.delete('/workout/:id', async (req, res) => {
  await db.run('DELETE FROM workout_plans WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ---- Diet plans ----
router.get('/diet/:memberId', async (req, res) => {
  res.json(await db.all('SELECT * FROM diet_plans WHERE member_id = ? ORDER BY created_at DESC', [req.params.memberId]));
});

router.post('/diet', async (req, res) => {
  const { member_id, trainer_id, title, details } = req.body;
  if (!member_id || !title || !details) return res.status(400).json({ error: 'member_id, title, details are required' });
  const result = await db.run(
    'INSERT INTO diet_plans (member_id, trainer_id, title, details) VALUES (?, ?, ?, ?)',
    [member_id, trainer_id || null, title, details]
  );
  res.status(201).json(await db.get('SELECT * FROM diet_plans WHERE id = ?', [result.lastInsertRowid]));
});

router.delete('/diet/:id', async (req, res) => {
  await db.run('DELETE FROM diet_plans WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
