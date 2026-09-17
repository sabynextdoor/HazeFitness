// \u2022 HF-GMS \u00b7 crafted & signed by Saby \u00b7 keep this header
const crypto = require('crypto');
const Razorpay = require('razorpay');
const dayjs = require('dayjs');
const db = require('../database/db');

function configured() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!keyId || !secret) return false;
  // Placeholder values from .env.example should not enable live mode.
  if (keyId.includes('your_key') || secret.includes('your_') || secret.includes('xxx')) return false;
  return true;
}

function client() {
  if (!configured()) throw new Error('Razorpay is not configured');
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

function verifyCheckoutSignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`).digest('hex');
  const actual = Buffer.from(String(signature || ''), 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function paymentMode(method) {
  if (method === 'upi') return 'upi';
  if (method === 'card') return 'card';
  return 'other';
}

async function finalizePayment({ orderId, paymentId, mock = false, mode = null }) {
  let gatewayPayment = null;
  // Real gateway: fetch the payment from Razorpay and verify capture + amount.
  if (!mock) {
    gatewayPayment = await client().payments.fetch(paymentId);
    if (gatewayPayment.order_id !== orderId || gatewayPayment.status !== 'captured') {
      throw new Error('Razorpay payment has not been captured');
    }
  }

  return db.transaction(async (tx) => {
    const order = await tx.get('SELECT * FROM payment_orders WHERE razorpay_order_id = ? FOR UPDATE', [orderId]);
    if (!order) throw new Error('Payment order not found');
    if (order.status === 'paid') {
      return { alreadyPaid: true, payment: await tx.get('SELECT * FROM payments WHERE receipt_no = ?', [`RZP${order.razorpay_payment_id}`]) };
    }
    if (!mock && Number(gatewayPayment.amount) !== Math.round(Number(order.amount) * 100)) {
      throw new Error('Razorpay payment amount does not match this order');
    }

    const subscription = await tx.get('SELECT * FROM subscriptions WHERE id = ? FOR UPDATE', [order.subscription_id]);
    if (!subscription || subscription.member_id !== order.member_id) throw new Error('Subscription not found');
    if (Number(order.amount) > Number(subscription.balance_due) + 0.001) {
      throw new Error('Payment amount exceeds the current balance');
    }

    const receiptNo = `RZP${paymentId}`;
    const recordMode = mode || (mock ? 'other' : paymentMode(gatewayPayment.method));
    const result = await tx.run(`
      INSERT INTO payments (subscription_id, member_id, amount, payment_mode, payment_date, receipt_no, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [order.subscription_id, order.member_id, order.amount, recordMode,
      dayjs().format('YYYY-MM-DD'), receiptNo, mock ? 'Mock payment (no Razorpay key configured)' : `Razorpay payment ${paymentId}`]);
    await tx.run('UPDATE subscriptions SET amount_paid = amount_paid + ? WHERE id = ?', [order.amount, order.subscription_id]);
    await tx.run("UPDATE payment_orders SET status = 'paid', razorpay_payment_id = ? WHERE id = ?", [paymentId, order.id]);
    return { alreadyPaid: false, mock: mock || undefined, payment: await tx.get('SELECT * FROM payments WHERE id = ?', [result.lastInsertRowid]) };
  });
}

module.exports = { configured, client, verifyCheckoutSignature, finalizePayment };
