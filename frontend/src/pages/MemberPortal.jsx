import { useEffect, useState } from 'react';
import { api, logout } from '../api.js';
import QRCode from 'qrcode';
import { money, fmtDate, fmtTime } from '../utils.js';
import { toast } from '../toast.js';
import StatusBadge from '../components/StatusBadge.jsx';

const TABS = [
  { id: 'qr', label: 'My QR Code' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'diet', label: 'Diet & Workout Plan' },
  { id: 'classes', label: 'Trainer & Class Booking' },
  { id: 'payments', label: 'My Payments' },
  { id: 'info', label: 'Information' },
];

export default function MemberPortal() {
  const [tab, setTab] = useState('attendance');
  const [memberLabel, setMemberLabel] = useState('Loading…');
  const [member, setMember] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [diet, setDiet] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [classes, setClasses] = useState(null);
  const [bookings, setBookings] = useState(null);
  const [subscriptions, setSubscriptions] = useState(null);
  const [payments, setPayments] = useState(null);
  const [announcements, setAnnouncements] = useState(null);
  const [streak, setStreak] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [payingSubscriptionId, setPayingSubscriptionId] = useState(null);

  async function loadHeader() {
    try {
      const member = await api('/portal/me');
      setMember(member);
      setMemberLabel(`${member.full_name} (${member.member_code})`);
    } catch (e) { /* redirected on 401 */ }
  }

  async function loadAttendance() {
    try { setAttendance(await api('/portal/attendance')); } catch (err) { setAttendance([]); }
  }
  async function loadStreak() {
    try { setStreak((await api('/portal/attendance-streak')).streak); } catch (err) { setStreak(0); }
  }
  async function loadDietWorkout() {
    try { setDiet(await api('/portal/diet')); } catch (err) { setDiet([]); }
    try { setWorkout(await api('/portal/workout')); } catch (err) { setWorkout([]); }
  }
  async function loadClasses() {
    try { setClasses(await api('/portal/classes')); } catch (err) { setClasses([]); }
  }
  async function loadBookings() {
    try { setBookings(await api('/portal/bookings')); } catch (err) { setBookings([]); }
  }
  async function loadPayments() {
    try {
      const { subscriptions: subs, payments: pays } = await api('/portal/payments');
      setSubscriptions(subs);
      setPayments(pays);
    } catch (err) { setSubscriptions([]); setPayments([]); }
  }
  async function loadAnnouncements() {
    try { setAnnouncements(await api('/portal/announcements')); } catch (err) { setAnnouncements([]); }
  }

  useEffect(() => {
    loadHeader();
    loadAttendance();
    loadStreak();
    loadDietWorkout();
    loadClasses();
    loadBookings();
    loadPayments();
    loadAnnouncements();
  }, []);

  async function bookClass(classId) {
    const date = prompt('Book for which date? (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!date) return;
    try {
      await api(`/portal/classes/${classId}/book`, { method: 'POST', body: JSON.stringify({ booking_date: date }) });
      toast('Class booked');
      loadClasses();
      loadBookings();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function cancelBooking(bookingId) {
    if (!confirm('Cancel this booking?')) return;
    try {
      await api(`/portal/bookings/${bookingId}`, { method: 'DELETE' });
      toast('Booking cancelled');
      loadClasses();
      loadBookings();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function showReceipt(paymentId) {
    try {
      setReceipt(await api(`/portal/receipt/${paymentId}`));
      setReceiptOpen(true);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function payWithRazorpay(subscription) {
    const amountText = prompt('Enter the amount to pay (up to the balance due)', String(subscription.balance_due));
    if (amountText === null) return;
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(subscription.balance_due) + 0.001) {
      toast('Enter a valid amount up to the balance due', 'error');
      return;
    }
    setPayingSubscriptionId(subscription.id);
    try {
      const order = await api('/portal/payments/orders', {
        method: 'POST', body: JSON.stringify({ subscription_id: subscription.id, amount }),
      });
      // Demo mode (no Razorpay keys configured): confirm locally and record the payment.
      if (order.mock) {
        if (confirm('Online payments are not configured on this server yet.\n\nThis is a DEMO: confirm to record the payment as a trial transaction?\n\nAmount: ' + money(amount))) {
          const result = await api('/portal/payments/verify', {
            method: 'POST',
            body: JSON.stringify({
              razorpay_order_id: order.order_id,
              razorpay_payment_id: 'mock_pay_' + Date.now(),
              mock: true,
            }),
          });
          toast(result.alreadyPaid ? 'This payment was already recorded' : 'Payment received (demo mode)');
          loadPayments();
        } else {
          toast('Payment cancelled', 'error');
        }
        setPayingSubscriptionId(null);
        return;
      }
      if (!window.Razorpay) { toast('Razorpay Checkout could not be loaded', 'error'); setPayingSubscriptionId(null); return; }
      const checkout = new window.Razorpay({
        key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id,
        name: 'Haze Fitness', description: `${subscription.plan_name} membership payment`,
        prefill: { name: member?.full_name, email: member?.email, contact: member?.phone },
        theme: { color: '#6ae4ff' },
        handler: async (response) => {
          try {
            const result = await api('/portal/payments/verify', { method: 'POST', body: JSON.stringify(response) });
            toast(result.alreadyPaid ? 'This payment was already recorded' : 'Payment received');
            loadPayments();
          } catch (err) { toast(err.message, 'error'); }
          finally { setPayingSubscriptionId(null); }
        },
        modal: { ondismiss: () => setPayingSubscriptionId(null) },
      });
      checkout.open();
    } catch (err) { toast(err.message, 'error'); setPayingSubscriptionId(null); }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">HF</div>
          <h1>Haze Fitness<span>My Account</span></h1>
        </div>
        <div className="nav-group">
          <div className="nav-label">Welcome</div>
          <div style={{ padding: '8px 10px', fontSize: 13 }}>{memberLabel}</div>
        </div>
        <div className="user-chip">
          <span></span>
          <button className="btn btn-sm btn-ghost" onClick={logout}>Log Out</button>
        </div>
      </aside>

      <main className="main">
        <div className="page-header">
          <div>
            <h2>My Account</h2>
            <p>Attendance, diet plan, class bookings and payments</p>
          </div>
        </div>

        <div className="portal-tabs" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`portal-tab${tab === t.id ? ' active' : ''}`}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                background: tab === t.id ? 'var(--panel-2)' : 'var(--panel)',
                color: tab === t.id ? 'var(--text)' : 'var(--text-dim)',
                borderColor: tab === t.id ? 'var(--accent)' : 'var(--border)',
                cursor: 'pointer', fontSize: 13,
              }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'attendance' && (
          <div className="panel">
            <div className="page-header"><h3>Attendance History</h3><div className="streak-card">🔥 <strong>{streak ?? '—'}-day streak</strong><span>Keep moving!</span></div></div>
            <table>
              <thead><tr><th>Date</th><th>Check In</th><th>Check Out</th></tr></thead>
              <tbody>
                {!attendance && <tr><td colSpan={3} className="empty">Loading…</td></tr>}
                {attendance && attendance.length === 0 && <tr><td colSpan={3} className="empty">No attendance recorded yet</td></tr>}
                {attendance && attendance.map((r, i) => (
                  <tr key={i}>
                    <td>{fmtDate(r.attendance_date)}</td>
                    <td>{fmtTime(r.check_in)}</td>
                    <td>{fmtTime(r.check_out)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'qr' && <PortalQrCode member={member} />}

        {tab === 'diet' && (
          <>
            <div className="panel">
              <h3>Diet Plan</h3>
              {!diet && <div className="empty">Loading…</div>}
              {diet && diet.length === 0 && <div className="empty">No diet plan assigned yet — ask your trainer.</div>}
              {diet && diet.map((p) => (
                <div key={p.id} className="plan-card">
                  <h4>{p.title}</h4>
                  <p>{p.details}</p>
                  <div className="date">Added {fmtDate(p.created_at)}</div>
                </div>
              ))}
            </div>
            <div className="panel">
              <h3>Workout Plan</h3>
              {!workout && <div className="empty">Loading…</div>}
              {workout && workout.length === 0 && <div className="empty">No workout plan assigned yet — ask your trainer.</div>}
              {workout && workout.map((p) => (
                <div key={p.id} className="plan-card">
                  <h4>{p.title}</h4>
                  <p>{p.details}</p>
                  <div className="date">Added {fmtDate(p.created_at)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'classes' && (
          <>
            <div className="panel">
              <h3>Available Classes</h3>
              <table>
                <thead><tr><th>Class</th><th>Trainer</th><th>Slot</th><th>Days</th><th>Capacity</th><th>Book</th></tr></thead>
                <tbody>
                  {!classes && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
                  {classes && classes.length === 0 && <tr><td colSpan={6} className="empty">No classes scheduled</td></tr>}
                  {classes && classes.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.trainer_name || '—'}</td>
                      <td>{c.slot_time}</td>
                      <td>{c.days_of_week}</td>
                      <td>{c.booked_count}/{c.capacity}</td>
                      <td><button className="btn btn-sm btn-primary" onClick={() => bookClass(c.id)}>Book</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel">
              <h3>My Bookings</h3>
              <table>
                <thead><tr><th>Class</th><th>Trainer</th><th>Date</th><th></th></tr></thead>
                <tbody>
                  {!bookings && <tr><td colSpan={4} className="empty">Loading…</td></tr>}
                  {bookings && bookings.length === 0 && <tr><td colSpan={4} className="empty">No bookings yet</td></tr>}
                  {bookings && bookings.map((b) => (
                    <tr key={b.id}>
                      <td>{b.class_name}</td>
                      <td>{b.trainer_name || '—'}</td>
                      <td>{fmtDate(b.booking_date)}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => cancelBooking(b.id)}>Cancel</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'payments' && (
          <>
            <div className="panel">
              <h3>Plan &amp; Fee Status</h3>
              <table>
                <thead><tr><th>Plan</th><th>Period</th><th>Total Fee</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {!subscriptions && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
                  {subscriptions && subscriptions.length === 0 && <tr><td colSpan={6} className="empty">No plan assigned yet</td></tr>}
                  {subscriptions && subscriptions.map((s, i) => (
                    <tr key={i}>
                      <td>{s.plan_name}</td>
                      <td>{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</td>
                      <td>{money(s.total_fee)}</td>
                      <td>{money(s.amount_paid)}</td>
                      <td>{money(s.balance_due)}</td>
                      <td><StatusBadge status={s.payment_status} /></td>
                      <td>{Number(s.balance_due) > 0 && <button className="btn btn-sm btn-primary" disabled={payingSubscriptionId === s.id} onClick={() => payWithRazorpay(s)}>{payingSubscriptionId === s.id ? 'Opening...' : 'Pay Online'}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel">
              <h3>Payment History</h3>
              <table>
                <thead><tr><th>Date</th><th>Amount</th><th>Mode</th><th>Receipt No.</th><th></th></tr></thead>
                <tbody>
                  {!payments && <tr><td colSpan={5} className="empty">Loading…</td></tr>}
                  {payments && payments.length === 0 && <tr><td colSpan={5} className="empty">No payments recorded yet</td></tr>}
                  {payments && payments.map((p, i) => (
                    <tr key={i}><td>{fmtDate(p.payment_date)}</td><td>{money(p.amount)}</td><td>{p.payment_mode}</td><td>{p.receipt_no}</td><td><button className="btn btn-sm btn-ghost" onClick={() => showReceipt(p.id)}>Receipt</button></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'info' && (
          <div className="panel">
            <h3>Gym Announcements</h3>
            {!announcements && <div className="empty">Loading…</div>}
            {announcements && announcements.length === 0 && <div className="empty">No announcements yet</div>}
            {announcements && announcements.map((a) => (
              <div key={a.id} className="plan-card">
                <h4>{a.title}</h4>
                <p>{a.message}</p>
                <div className="date">Posted {fmtDate(a.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </main>
      <div className={`modal-backdrop receipt-backdrop${receiptOpen ? ' open' : ''}`}>
        <div className="modal">{receipt && <><div id="printableReceipt"><h3>Haze Fitness</h3><p className="text-dim">Payment Receipt</p><p><strong>Receipt No:</strong> {receipt.receipt_no}<br /><strong>Date:</strong> {receipt.payment_date}<br /><strong>Member:</strong> {receipt.full_name} ({receipt.member_code})<br /><strong>Plan:</strong> {receipt.plan_name}</p><table><tbody><tr><td>This payment</td><td>{money(receipt.amount)}</td></tr><tr><td>Total paid</td><td>{money(receipt.amount_paid)}</td></tr><tr><td>Balance due</td><td>{money(receipt.balance_due)}</td></tr></tbody></table></div><div className="modal-actions"><button className="btn btn-ghost" onClick={() => setReceiptOpen(false)}>Close</button><button className="btn btn-primary" onClick={() => window.print()}>Print / Download</button></div></>}</div>
      </div>
    </div>
  );
}

function PortalQrCode({ member }) {
  const [image, setImage] = useState('');

  useEffect(() => {
    if (!member?.member_code) return undefined;
    let active = true;
    QRCode.toDataURL(member.member_code, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#101828', light: '#ffffff' },
    }).then((dataUrl) => {
      if (active) setImage(dataUrl);
    }).catch(() => {
      if (active) setImage('');
    });
    return () => { active = false; };
  }, [member?.member_code]);

  return (
    <div className="panel member-qr-card">
      <div>
        <h3 className="mt-0">My Attendance QR Code</h3>
        <p className="text-dim">Show this code to gym staff at check-in. They can scan it from the Attendance screen.</p>
        <strong>{member?.member_code || 'Loading…'}</strong>
      </div>
      {image && <img className="member-qr-image" src={image} alt="My attendance QR code" />}
    </div>
  );
}
