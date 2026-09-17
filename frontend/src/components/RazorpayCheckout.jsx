import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { money } from '../utils.js';
import { toast } from '../toast.js';

const METHODS = [
  { id: 'upi', label: 'UPI', icon: 'UPI', hint: 'GPay, PhonePe, Paytm' },
  { id: 'card', label: 'Card', icon: '💳', hint: 'Credit / Debit' },
  { id: 'netbanking', label: 'NetBanking', icon: '🏦', hint: 'All major banks' },
  { id: 'wallet', label: 'Wallet', icon: '👛', hint: 'Paytm, Amazon Pay' },
];

export default function RazorpayCheckout({ subscription, amount, memberName, memberEmail, memberPhone, onDone, onClose }) {
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState('creating');
  const [method, setMethod] = useState('upi');
  const [paymentId, setPaymentId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api('/fees/payments/orders', {
      method: 'POST',
      body: JSON.stringify({ subscription_id: subscription.id, amount }),
    })
      .then((o) => {
        if (cancelled) return;
        setOrder(o);
        if (!o.mock) {
          if (!window.Razorpay) { setError('Razorpay Checkout could not be loaded'); setStatus('error'); return; }
          const checkout = new window.Razorpay({
            key: o.key_id,
            amount: o.amount,
            currency: o.currency,
            order_id: o.order_id,
            name: 'Haze Fitness',
            description: `${subscription.plan_name || 'Membership'} payment`,
            prefill: { name: memberName, email: memberEmail, phone: memberPhone },
            theme: { color: '#6ae4ff' },
            handler: (response) => verify(response),
            modal: { ondismiss: onClose },
          });
          checkout.open();
        } else {
          setStatus('pay');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, []);

  async function verify(res) {
    setStatus('processing');
    try {
      const result = await api('/fees/payments/verify', { method: 'POST', body: JSON.stringify(res) });
      if (result.alreadyPaid) toast('This payment was already recorded');
      setStatus('done');
      setTimeout(() => onDone(result), 1200);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  async function payDemo() {
    const demoPaymentId = 'mock_pay_' + Date.now();
    setPaymentId(demoPaymentId);
    await verify({ razorpay_order_id: order.order_id, razorpay_payment_id: demoPaymentId, mock: true });
  }

  const amountText = money(order?.amount ? order.amount / 100 : amount);

  return (
    <div className="modal-backdrop open" style={{ zIndex: 80 }}>
      <div className="rzp-checkout" onClick={(e) => e.stopPropagation()}>
        {status === 'creating' && (
          <div className="rzp-screen">
            <div className="rzp-brand"><span>Razorpay</span><em>Secure</em></div>
            <p className="text-dim" style={{ textAlign: 'center', padding: '24px 0' }}>Creating secure payment session…</p>
          </div>
        )}

        {(status === 'pay') && (
          <div className="rzp-screen">
            <div className="rzp-brand"><span>Razorpay</span><em>Secure</em></div>
            <div className="rzp-merchant">
              <div className="rzp-merchant-logo">HF</div>
              <div><strong>Haze Fitness</strong><span>{subscription.plan_name || 'Membership'}</span></div>
            </div>
            <div className="rzp-amount">Pay {money((order?.amount || amount) / 100)}</div>
            <div className="rzp-methods">
              {METHODS.map((m) => (
                <button key={m.id} type="button" className={`rzp-method${method === m.id ? ' active' : ''}`} onClick={() => setMethod(m.id)}>
                  <span className="rzp-method-icon">{m.icon}</span><span className="rzp-method-name">{m.label}<em>{m.hint}</em></span>
                  <span className="rzp-method-dot" />
                </button>
              ))}
            </div>
            <div className="rzp-demo-note">Demo mode — no Razorpay keys configured yet. Click Pay to simulate.</div>
            <button type="button" className="rzp-pay-btn" onClick={payDemo}>Pay {money((order?.amount || amount) / 100)}</button>
            <div className="rzp-sec"><span>🔒</span> Secured by <strong>Razorpay</strong></div>
          </div>
        )}

        {status === 'processing' && (
          <div className="rzp-screen">
            <div className="rzp-brand"><span>Razorpay</span><em>Secure</em></div>
            <div className="rzp-spinner" />
            <p style={{ textAlign: 'center', marginTop: 18 }}>Processing your payment…</p>
            {paymentId && <p className="text-dim" style={{ textAlign: 'center', fontSize: 12, marginTop: 6 }}>{paymentId}</p>}
          </div>
        )}

        {status === 'done' && (
          <div className="rzp-screen">
            <div className="rzp-brand"><span>Razorpay</span><em>Secure</em></div>
            <div className="rzp-tick">✓</div>
            <p style={{ textAlign: 'center', fontWeight: 600 }}>Payment successful</p>
            <p className="text-dim" style={{ textAlign: 'center' }}>{amountText} · {subscription.plan_name || 'Membership'}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="rzp-screen">
            <div className="rzp-brand"><span>Razorpay</span><em>Secure</em></div>
            <p style={{ textAlign: 'center', color: 'var(--red)', padding: '20px 0' }}>{error}</p>
            <button type="button" className="btn btn-ghost" style={{ margin: '0 auto', display: 'block' }} onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}