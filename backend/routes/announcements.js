const express = require('express');
const router = express.Router();
const db = require('../database/db');

// GET /api/announcements — admin list, newest first
router.get('/', async (req, res) => {
  const rows = await db.all(`
    SELECT a.*, s.full_name AS created_by_name
    FROM announcements a LEFT JOIN staff_users s ON s.id = a.created_by
    ORDER BY a.created_at DESC
  `);
  res.json(rows);
});

// POST /api/announcements  { title, message }
router.post('/', async (req, res) => {
  const { title, message } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'title and message are required' });
  const result = await db.run(
    'INSERT INTO announcements (title, message, created_by) VALUES (?, ?, ?)',
    [title, message, req.user.id]
  );
  res.status(201).json(await db.get('SELECT * FROM announcements WHERE id = ?', [result.lastInsertRowid]));
});

router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM announcements WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Announcement not found' });
  const f = { ...existing, ...req.body };
  await db.run('UPDATE announcements SET title=?, message=? WHERE id=?', [f.title, f.message, req.params.id]);
  res.json(await db.get('SELECT * FROM announcements WHERE id = ?', [req.params.id]));
});

router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM announcements WHERE id = ?', [req.params.id]);
  if (result.changes === 0) return res.status(404).json({ error: 'Announcement not found' });
  res.json({ success: true });
});

module.exports = router;