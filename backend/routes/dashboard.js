const express = require('express');
const router = express.Router();
const db = require('../database/db');
const dayjs = require('dayjs');

router.get('/', async (req, res) => {
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');
  const weekAhead = dayjs().add(7, 'day').format('YYYY-MM-DD');

  const totalActiveMembers = (await db.get(
    `SELECT COUNT(*) AS c FROM members WHERE status = 'active'`
  )).c;

  const dailyAttendance = (await db.get(
    `SELECT COUNT(*) AS c FROM attendance WHERE attendance_date = ?`, [today]
  )).c;

  const feeRevenueThisMonth = (await db.get(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE payment_date BETWEEN ? AND ?`, [monthStart, monthEnd]
  )).total;

  const posRevenueThisMonth = (await db.get(
    `SELECT COALESCE(SUM(total_amount), 0) AS total FROM pos_sales WHERE sale_date BETWEEN ? AND ?`, [monthStart, monthEnd]
  )).total;

  const totalPendingDues = (await db.get(
    `SELECT COALESCE(SUM(balance_due), 0) AS total FROM subscriptions WHERE payment_status != 'Paid'`
  )).total;

  const pendingDuesCount = (await db.get(
    `SELECT COUNT(*) AS c FROM subscriptions WHERE payment_status != 'Paid'`
  )).c;

  const upcomingExpirations = await db.all(`
    SELECT s.id, s.end_date, m.full_name, m.member_code, m.phone, p.name AS plan_name
    FROM subscriptions s
    JOIN members m ON m.id = s.member_id
    JOIN plans p ON p.id = s.plan_id
    WHERE s.end_date BETWEEN ? AND ? AND s.is_active = 1
    ORDER BY s.end_date ASC
  `, [today, weekAhead]);

  const paymentStatusBreakdown = await db.all(`
    SELECT payment_status, COUNT(*) AS count, COALESCE(SUM(balance_due),0) AS total_due
    FROM subscriptions GROUP BY payment_status
  `);

  const upcomingBirthdays = await db.all(`
    SELECT id, full_name, member_code, phone, dob
    FROM members
    WHERE dob IS NOT NULL
      AND DATE_FORMAT(dob, '%m-%d') BETWEEN ? AND ?
    ORDER BY DATE_FORMAT(dob, '%m-%d'), full_name
  `, [dayjs().format('MM-DD'), dayjs().add(7, 'day').format('MM-DD')]);

  res.json({
    total_active_members: totalActiveMembers,
    daily_attendance: dailyAttendance,
    monthly_revenue: {
      fees: feeRevenueThisMonth,
      pos: posRevenueThisMonth,
      total: Number(feeRevenueThisMonth) + Number(posRevenueThisMonth)
    },
    total_pending_dues: totalPendingDues,
    pending_dues_count: pendingDuesCount,
    upcoming_expirations: upcomingExpirations,
    payment_status_breakdown: paymentStatusBreakdown,
    upcoming_birthdays: upcomingBirthdays
  });
});

module.exports = router;
