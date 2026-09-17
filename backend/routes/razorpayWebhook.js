// \u2022 HF-GMS \u00b7 crafted & signed by Saby \u00b7 keep this header
const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');
const { configured, finalizePayment } = require('../services/razorpayPayments');

const router = express.Router();

router.post('/', async (req, res) => {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) return res.status(503).json({ error: 'Webhook is not configured' });
  const signature = req.get('x-razorpay-signature') || '';
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest('hex');
  const received = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (received.length !== expectedBuffer.length || !crypto.timingSafeEqual(received, expectedBuffer)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = JSON.parse(req.body.toString('utf8'));
  const eventId = req.get('x-razorpay-event-id');
  if (!eventId) return res.status(400).json({ error: 'Missing webhook event id' });
  try {
    await db.run('INSERT INTO razorpay_webhook_events (event_id, event_type) VALUES (?, ?)', [eventId, event.event || 'unknown']);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.json({ ok: true, duplicate: true });
    throw err;
  }

  if (configured() && event.event === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    if (payment?.order_id && payment?.id) await finalizePayment({ orderId: payment.order_id, paymentId: payment.id });
  }
  res.json({ ok: true });
});

module.exports = router;
