const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  res.json(await db.all('SELECT * FROM plans ORDER BY price'));
});

router.post('/', async (req, res) => {
  const { name, duration_days, price, includes_trainer, description } = req.body;
  if (!name || !duration_days || price == null)
    return res.status(400).json({ error: 'name, duration_days, price are required' });
  const result = await db.run(
    `INSERT INTO plans (name, duration_days, price, includes_trainer, description)
     VALUES (?, ?, ?, ?, ?)`,
    [name, duration_days, price, includes_trainer ? 1 : 0, description || null]
  );
  res.status(201).json(await db.get('SELECT * FROM plans WHERE id = ?', [result.lastInsertRowid]));
});

router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM plans WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Plan not found' });
  const f = { ...existing, ...req.body };
  await db.run(
    `UPDATE plans SET name=?, duration_days=?, price=?, includes_trainer=?, description=? WHERE id=?`,
    [f.name, f.duration_days, f.price, f.includes_trainer ? 1 : 0, f.description, req.params.id]
  );
  res.json(await db.get('SELECT * FROM plans WHERE id = ?', [req.params.id]));
});

router.delete('/:id', async (req, res) => {
  const usage = await db.get('SELECT COUNT(*) AS c FROM subscriptions WHERE plan_id = ?', [req.params.id]);
  if (usage.c > 0) return res.status(409).json({ error: 'This offer is already assigned to members and cannot be deleted' });
  const result = await db.run('DELETE FROM plans WHERE id = ?', [req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'Offer not found' });
  res.json({ success: true });
});

module.exports = router;
