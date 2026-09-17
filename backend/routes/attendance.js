const express = require('express');
const router = express.Router();
const db = require('../database/db');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const INDIA_TIME_ZONE = 'Asia/Kolkata';
function attendanceDate() { return dayjs().tz(INDIA_TIME_ZONE).format('YYYY-MM-DD'); }
function utcTimestamp() { return dayjs.utc().format('YYYY-MM-DD HH:mm:ss'); }

function resolveMember(identifier) {
  // Accept numeric member_id, or member_code (used for QR scans / ID search)
  if (/^\d+$/.test(String(identifier))) {
    return db.get('SELECT * FROM members WHERE id = ?', [identifier]);
  }
  return db.get('SELECT * FROM members WHERE member_code = ?', [identifier]);
}

// GET /api/attendance?date=YYYY-MM-DD&member_id=
router.get('/', async (req, res) => {
  const { date, member_id } = req.query;
  let sql = `
    SELECT a.*, m.full_name, m.member_code FROM attendance a
    JOIN members m ON m.id = a.member_id WHERE 1=1`;
  const params = [];
  if (date) { sql += ` AND a.attendance_date = ?`; params.push(date); }
  if (member_id) { sql += ` AND a.member_id = ?`; params.push(member_id); }
  sql += ` ORDER BY a.check_in DESC`;
  res.json(await db.all(sql, params));
});

// POST /api/attendance/toggle  { identifier }  — one tap: checks in if absent, checks out if present
router.post('/toggle', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return res.status(400).json({ error: 'identifier (member id, code, or QR value) is required' });
  const member = await resolveMember(identifier);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const today = attendanceDate();
  const now = utcTimestamp();
  const openRow = await db.get(
    `SELECT * FROM attendance WHERE member_id = ? AND attendance_date = ? AND check_out IS NULL`,
    [member.id, today]
  );

  if (openRow) {
    await db.run('UPDATE attendance SET check_out = ? WHERE id = ?', [now, openRow.id]);
    return res.json({ action: 'check_out', member, record: await db.get('SELECT * FROM attendance WHERE id = ?', [openRow.id]) });
  } else {
    const result = await db.run(
      `INSERT INTO attendance (member_id, attendance_date, check_in) VALUES (?, ?, ?)`,
      [member.id, today, now]
    );
    return res.status(201).json({ action: 'check_in', member, record: await db.get('SELECT * FROM attendance WHERE id = ?', [result.lastInsertRowid]) });
  }
});

// POST /api/attendance/checkin  { identifier }
router.post('/checkin', async (req, res) => {
  const member = await resolveMember(req.body.identifier);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const today = attendanceDate();
  const existing = await db.get(
    'SELECT * FROM attendance WHERE member_id = ? AND attendance_date = ? AND check_out IS NULL',
    [member.id, today]
  );
  if (existing) return res.status(409).json({ error: 'Member already checked in today' });
  const result = await db.run(
    'INSERT INTO attendance (member_id, attendance_date, check_in) VALUES (?, ?, ?)',
    [member.id, today, utcTimestamp()]
  );
  res.status(201).json({
    action: 'check_in',
    member,
    record: await db.get('SELECT * FROM attendance WHERE id = ?', [result.lastInsertRowid]),
  });
});

// POST /api/attendance/checkout { identifier }
router.post('/checkout', async (req, res) => {
  const member = await resolveMember(req.body.identifier);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  const today = attendanceDate();
  const openRow = await db.get(
    'SELECT * FROM attendance WHERE member_id = ? AND attendance_date = ? AND check_out IS NULL',
    [member.id, today]
  );
  if (!openRow) return res.status(409).json({ error: 'No open check-in found for today' });
  await db.run('UPDATE attendance SET check_out = ? WHERE id = ?', [utcTimestamp(), openRow.id]);
  res.json({
    action: 'check_out',
    member,
    record: await db.get('SELECT * FROM attendance WHERE id = ?', [openRow.id]),
  });
});

module.exports = router;
