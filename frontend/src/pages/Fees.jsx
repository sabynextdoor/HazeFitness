import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { money } from '../utils.js';
import { toast } from '../toast.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import RazorpayCheckout from '../components/RazorpayCheckout.jsx';

export default function Fees() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [activeSub, setActiveSub] = useState(null);
  const [members, setMembers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [totalFee, setTotalFee] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [editSub, setEditSub] = useState(null);
  const [onlinePay, setOnlinePay] = useState(null);

  async function loadSubs() {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter) params.set('payment_status', statusFilter);
    try {
      const rows = await api('/fees/subscriptions?' + params.toString());
      setSubs(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSubs(); }, [search, statusFilter]);
  useEffect(() => {
    Promise.all([api('/members'), api('/plans')]).then(([m, p]) => {
      setMembers(m); setPlans(p);
      if (p.length) { setSelectedPlanId(String(p[0].id)); setTotalFee(p[0].price); }
    }).catch(() => {});
  }, []);

  function openPaymentModal(sub) {
    setActiveSub(sub);
    setPayModalOpen(true);
  }

  async function handlePayment(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (payload.payment_mode === 'online') {
        setOnlinePay({ subscription: activeSub, amount: Number(payload.amount) });
        return;
      }
      await api('/fees/payments', { method: 'POST', body: JSON.stringify(payload) });
      toast('Payment recorded');
      setPayModalOpen(false);
      e.target.reset();
      loadSubs();
    } catch (err) { toast(err.message, 'error'); }
  }

  function choosePlan(planId) {
    setSelectedPlanId(planId);
    setTotalFee(plans.find((p) => String(p.id) === planId)?.price || '');
  }

  async function refreshPlans() {
    const p = await api('/plans');
    setPlans(p);
    return p;
  }

  async function saveOffer(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    payload.includes_trainer = payload.includes_trainer === 'on';
    try {
      await api(editingOffer ? `/plans/${editingOffer.id}` : '/plans', { method: editingOffer ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      await refreshPlans(); setOfferOpen(false); setEditingOffer(null); toast(editingOffer ? 'Offer updated' : 'Offer created');
    } catch (err) { toast(err.message, 'error'); }
  }

  async function deleteOffer(plan) {
    if (!confirm(`Delete ${plan.name}?`)) return;
    try { await api(`/plans/${plan.id}`, { method: 'DELETE' }); await refreshPlans(); toast('Offer deleted'); } catch (err) { toast(err.message, 'error'); }
  }

  async function saveSubscriptionEdit(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try { await api(`/fees/subscriptions/${editSub.id}`, { method: 'PUT', body: JSON.stringify(payload) }); setEditSub(null); loadSubs(); toast('Fee plan updated'); } catch (err) { toast(err.message, 'error'); }
  }

  async function deleteSubscription(sub) {
    if (!confirm(`Delete ${sub.full_name}'s ${sub.plan_name} subscription and its payment history?`)) return;
    try { await api(`/fees/subscriptions/${sub.id}`, { method: 'DELETE' }); loadSubs(); toast('Subscription deleted'); } catch (err) { toast(err.message, 'error'); }
  }

  async function handleSubscription(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/fees/subscriptions', { method: 'POST', body: JSON.stringify(payload) });
      toast('Subscription added'); setAddOpen(false); e.target.reset(); loadSubs();
    } catch (err) { toast(err.message, 'error'); }
  }

  function whatsappReminder(s) {
    const phone = String(s.phone || '').replace(/\D/g, '');
    const number = phone.length === 10 ? `91${phone}` : phone;
    const message = `Hello ${s.full_name}, this is Haze Fitness. Your ${s.plan_name} fee balance is ${money(s.balance_due)}. Please contact us to complete payment. Thank you!`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      <div className="page-header">
        <div><h2>Fees &amp; Payments</h2><p>Manual fee tracker — Paid / Unpaid / Partially Paid</p></div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>+ Add Fee Plan</button>
      </div>

      <div className="panel">
        <div className="panel-title-row"><h3>Membership Offers</h3><button className="btn btn-sm btn-ghost" onClick={() => { setEditingOffer(null); setOfferOpen(true); }}>+ New Offer</button></div>
        <table><thead><tr><th>Offer</th><th>Duration</th><th>Price</th><th>Trainer</th><th>Actions</th></tr></thead><tbody>
          {plans.map((p) => <tr key={p.id}><td><strong>{p.name}</strong><div className="text-dim">{p.description || 'No description'}</div></td><td>{p.duration_days} days</td><td>{money(p.price)}</td><td>{p.includes_trainer ? 'Included' : 'No'}</td><td className="action-cell"><button className="btn btn-sm btn-ghost" onClick={() => { setEditingOffer(p); setOfferOpen(true); }}>Edit</button><button className="btn btn-sm btn-danger" onClick={() => deleteOffer(p)}>Delete</button></td></tr>)}
          {plans.length === 0 && <tr><td colSpan={5} className="empty">No membership offers yet</td></tr>}
        </tbody></table>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input placeholder="Search member name or code…" style={{ minWidth: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All payment statuses</option>
            <option value="Paid">Paid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </div>
        <table>
          <thead><tr><th>Member</th><th>Plan</th><th>Period</th><th>Total Fee</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={8} className="empty">{error}</td></tr>}
            {!loading && !error && subs.length === 0 && <tr><td colSpan={8} className="empty">No subscriptions found</td></tr>}
            {!loading && !error && subs.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/members/${s.member_id}`}>{s.full_name}</Link><div className="text-dim">{s.member_code}</div></td>
                <td>{s.plan_name}</td>
                <td>{s.start_date} → {s.end_date}</td>
                <td>{money(s.total_fee)}</td>
                <td>{money(s.amount_paid)}</td>
                <td>{money(s.balance_due)}</td>
                <td><StatusBadge status={s.payment_status} /></td>
                <td><div className="pill-row">{s.balance_due > 0 ? <><button className="btn btn-sm btn-primary" onClick={() => openPaymentModal(s)}>Record Payment</button><button className="btn btn-sm btn-whatsapp" onClick={() => whatsappReminder(s)}>WhatsApp</button></> : <span className="text-dim">Settled</span>}<button className="btn btn-sm btn-ghost" onClick={() => setEditSub(s)}>Edit</button><button className="btn btn-sm btn-danger" onClick={() => deleteSubscription(s)}>Delete</button></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={payModalOpen} title="Record Payment">
        <form onSubmit={handlePayment}>
          <input type="hidden" name="subscription_id" value={activeSub?.id || ''} />
          <p className="text-dim">{activeSub ? `Balance due: ${money(activeSub.balance_due)}` : ''}</p>
          <div className="field"><label>Amount (₹) *</label><input type="number" step="0.01" name="amount" max={activeSub?.balance_due} required /></div>
          <div className="field">
            <label>Payment Mode</label>
            <select name="payment_mode"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="online">Online (Razorpay)</option><option value="other">Other</option></select>
          </div>
          <div className="field"><label>Payment Date</label><input type="date" name="payment_date" /></div>
          <div className="field"><label>Note</label><input name="note" placeholder="Optional" /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setPayModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Record Payment</button>
          </div>
        </form>
      </Modal>

      <Modal open={addOpen} title="Add Fee Subscription">
        <form onSubmit={handleSubscription}>
          <div className="field"><label>Member *</label><select name="member_id" required><option value="">Select a member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name} ({m.member_code})</option>)}</select></div>
          <div className="form-grid">
            <div className="field"><label>Plan *</label><select name="plan_id" value={selectedPlanId} onChange={(e) => choosePlan(e.target.value)} required>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}</select></div>
            <div className="field"><label>Start Date *</label><input type="date" name="start_date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div className="field"><label>Total Fee (₹)</label><input type="number" step="0.01" name="total_fee" value={totalFee} onChange={(e) => setTotalFee(e.target.value)} /></div>
            <div className="field"><label>Amount Paid Now (₹)</label><input type="number" step="0.01" min="0" name="amount_paid" defaultValue="0" /></div>
          </div>
          <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button><button className="btn btn-primary" type="submit">Save Subscription</button></div>
        </form>
      </Modal>

      <Modal open={offerOpen} title={editingOffer ? 'Edit Membership Offer' : 'New Membership Offer'}>
        <form onSubmit={saveOffer}>
          <div className="field"><label>Offer Name *</label><input name="name" required defaultValue={editingOffer?.name || ''} /></div>
          <div className="form-grid"><div className="field"><label>Duration (days) *</label><input type="number" min="1" name="duration_days" required defaultValue={editingOffer?.duration_days || ''} /></div><div className="field"><label>Price (₹) *</label><input type="number" min="0" step="0.01" name="price" required defaultValue={editingOffer?.price || ''} /></div></div>
          <div className="field"><label>Description</label><input name="description" defaultValue={editingOffer?.description || ''} /></div><label className="checkbox-label"><input type="checkbox" name="includes_trainer" defaultChecked={Boolean(editingOffer?.includes_trainer)} /> Includes personal trainer</label>
          <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setOfferOpen(false)}>Cancel</button><button className="btn btn-primary">Save Offer</button></div>
        </form>
      </Modal>

      <Modal open={Boolean(editSub)} title="Edit Fee Plan">
        <form onSubmit={saveSubscriptionEdit}>
          <div className="field"><label>Plan *</label><select name="plan_id" defaultValue={editSub?.plan_id || ''}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="form-grid"><div className="field"><label>Start Date *</label><input type="date" name="start_date" required defaultValue={editSub?.start_date || ''} /></div><div className="field"><label>Total Fee (₹) *</label><input type="number" name="total_fee" step="0.01" min={editSub?.amount_paid || 0} required defaultValue={editSub?.total_fee || ''} /></div></div>
          <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setEditSub(null)}>Cancel</button><button className="btn btn-primary">Save Changes</button></div>
        </form>
      </Modal>

      {onlinePay && (
        <RazorpayCheckout
          subscription={activeSub}
          amount={onlinePay.amount}
          onDone={() => { setOnlinePay(null); setPayModalOpen(false); loadSubs(); }}
          onClose={() => setOnlinePay(null)}
        />
      )}
    </>
  );
}
