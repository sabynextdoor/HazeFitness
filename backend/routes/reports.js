// \u2022 HF-GMS \u00b7 crafted & signed by Saby \u00b7 keep this header
const express = require('express');
const router = express.Router();
const db = require('../database/db');
const dayjs = require('dayjs');

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = row[h] == null ? '' : String(row[h]).replace(/"/g, '""');
      return /[,"\n]/.test(v) ? `"${v}"` : v;
    }).join(','));
  }
  return lines.join('\n');
}

function respondWithFormat(req, res, rows, filename) {
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(toCSV(rows));
  }
  res.json(rows);
}

// Active vs inactive members
router.get('/members-status', async (req, res) => {
  const rows = await db.all(`
    SELECT status, COUNT(*) AS count FROM members GROUP BY status
  `);
  respondWithFormat(req, res, rows, 'members-status');
});

// Monthly cash collection (fees + POS), grouped by month
// NOTE: strftime('%Y-%m', col) (SQLite) -> DATE_FORMAT(col, '%Y-%m') (MySQL)
router.get('/monthly-collection', async (req, res) => {
  const fees = await db.all(`
    SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, SUM(amount) AS fee_collection
    FROM payments GROUP BY month
  `);
  const pos = await db.all(`
    SELECT DATE_FORMAT(sale_date, '%Y-%m') AS month, SUM(total_amount) AS pos_collection
    FROM pos_sales GROUP BY month
  `);
  const map = {};
  fees.forEach(f => { map[f.month] = { month: f.month, fee_collection: f.fee_collection, pos_collection: 0 }; });
  pos.forEach(p => {
    if (!map[p.month]) map[p.month] = { month: p.month, fee_collection: 0, pos_collection: 0 };
    map[p.month].pos_collection = p.pos_collection;
  });
  const rows = Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).map(r => ({
    ...r, total: Number(r.fee_collection || 0) + Number(r.pos_collection || 0)
  }));
  respondWithFormat(req, res, rows, 'monthly-collection');
});

// Pending dues list
router.get('/pending-dues', async (req, res) => {
  const rows = await db.all(`
    SELECT m.member_code, m.full_name, m.phone, p.name AS plan_name,
      s.total_fee, s.amount_paid, s.balance_due, s.payment_status, s.end_date
    FROM subscriptions s
    JOIN members m ON m.id = s.member_id
    JOIN plans p ON p.id = s.plan_id
    WHERE s.payment_status != 'Paid'
    ORDER BY s.balance_due DESC
  `);
  respondWithFormat(req, res, rows, 'pending-dues');
});

// Peak attendance hours (by hour of check_in)
// NOTE: strftime('%H', col) (SQLite) -> DATE_FORMAT(col, '%H') (MySQL)
router.get('/peak-attendance', async (req, res) => {
  const rows = await db.all(`
    SELECT DATE_FORMAT(check_in, '%H') AS hour, COUNT(*) AS check_ins
    FROM attendance WHERE check_in IS NOT NULL
    GROUP BY hour ORDER BY hour
  `);
  respondWithFormat(req, res, rows, 'peak-attendance');
});

// Daily attendance trend (last 30 days)
router.get('/attendance-trend', async (req, res) => {
  const from = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const rows = await db.all(`
    SELECT attendance_date, COUNT(*) AS visits
    FROM attendance WHERE attendance_date >= ?
    GROUP BY attendance_date ORDER BY attendance_date
  `, [from]);
  respondWithFormat(req, res, rows, 'attendance-trend');
});

module.exports = router;
