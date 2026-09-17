import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { money } from '../utils.js';
import { toast } from '../toast.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';

export default function Members() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [trainers, setTrainers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [totalFee, setTotalFee] = useState('');
  const formRef = useRef(null);
  const searchTimer = useRef(null);

  async function loadMembers() {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (status) params.set('status', status);
    if (paymentStatus) params.set('payment_status', paymentStatus);
    try {
      const rows = await api('/members?' + params.toString());
      setMembers(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadFormOptions() {
    const t = await api('/trainers');
    setTrainers(t);
    const p = await api('/plans');
    setPlans(p);
  }

  useEffect(() => { loadFormOptions(); loadMembers(); }, []);
  useEffect(() => { loadMembers(); }, [status, paymentStatus]);

  function onSearchInput(v) {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(loadMembers, 300);
  }

  function fillPlanDefaults(planId) {
    setSelectedPlanId(planId);
    const plan = plans.find((p) => String(p.id) === planId);
    setTotalFee(plan ? plan.price : '');
  }

  function initials(name = '') {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
  }

  function whatsappReminder(member) {
    const phone = String(member.phone || '').replace(/\D/g, '');
    if (!phone) return toast('This member does not have a phone number', 'error');
    const number = phone.length === 10 ? `91${phone}` : phone;
    const message = `Hello ${member.full_name}, this is Haze Fitness. Your ${member.plan_name || 'membership'} fee balance is ${money(member.balance_due)}. Please contact us to complete payment. Thank you!`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  async function removeMember(id, name) {
    if (!confirm(`Remove ${name}? This deletes their record, subscriptions, payments, and attendance history permanently.`)) return;
    try {
      await api(`/members/${id}`, { method: 'DELETE' });
      toast('Member removed');
      loadMembers();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
    try {
      await api('/members', { method: 'POST', body: JSON.stringify(payload) });
      toast('Member added successfully');
      setModalOpen(false);
      e.target.reset();
      setTotalFee('');
      setSelectedPlanId('');
      loadMembers();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Members</h2>
          <p>Add, search, and manage member profiles</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ Add Member</button>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input
            placeholder="Search by name, code, or phone…"
            style={{ minWidth: 240 }}
            value={search}
            onChange={(e) => onSearchInput(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option value="">All payment statuses</option>
            <option value="Paid">Paid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Member</th><th>Phone</th><th>Trainer</th><th>Plan</th>
              <th>Balance Due</th><th>Payment</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={8} className="empty">{error}</td></tr>}
            {!loading && !error && members.length === 0 && (
              <tr><td colSpan={8} className="empty">No members found</td></tr>
            )}
            {!loading && !error && members.map((m) => (
              <tr key={m.id}>
                <td><div className="member-cell">{m.photo_data ? <img className="member-avatar" src={m.photo_data} alt="" /> : <div className="member-avatar member-avatar-fallback">{initials(m.full_name)}</div>}<div><Link to={`/members/${m.id}`}>{m.full_name}</Link><div className="text-dim">{m.member_code}</div></div></div></td>
                <td>{m.phone}</td>
                <td>{m.trainer_name || '—'}</td>
                <td>{m.plan_name || <span className="text-dim">No active plan</span>}</td>
                <td>{m.balance_due != null ? money(m.balance_due) : '—'}</td>
                <td>{m.payment_status ? <StatusBadge status={m.payment_status} /> : '—'}</td>
                <td><StatusBadge status={m.status} /></td>
                <td>
                  <Link className="btn btn-sm btn-ghost" to={`/members/${m.id}`}>View</Link>{' '}
                  {Number(m.balance_due) > 0 && <button className="btn btn-sm btn-whatsapp" onClick={() => whatsappReminder(m)}>WhatsApp</button>}{' '}
                  <button className="btn btn-sm btn-danger" onClick={() => removeMember(m.id, m.full_name)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} title="Add New Member">
        <form ref={formRef} onSubmit={handleAddMember}>
          <div className="form-grid">
            <div className="field"><label>Full Name *</label><input name="full_name" required /></div>
            <div className="field"><label>Phone *</label><input name="phone" required /></div>
            <div className="field">
              <label>Gender</label>
              <select name="gender"><option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select>
            </div>
            <div className="field"><label>Date of Birth</label><input type="date" name="dob" /></div>
            <div className="field"><label>Email *</label><input type="email" name="email" required /></div>
            <div className="field"><label>Join Date *</label><input type="date" name="join_date" required /></div>
            <div className="field"><label>Fitness Goal</label><input name="fitness_goal" placeholder="e.g. Weight loss" /></div>
            <div className="field">
              <label>Assigned Trainer</label>
              <select name="trainer_id">
                <option value="">— None —</option>
                {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div className="field"><label>Emergency Contact Name</label><input name="emergency_contact_name" /></div>
            <div className="field"><label>Emergency Contact Phone</label><input name="emergency_contact_phone" /></div>
          </div>
          <div className="field"><label>Address</label><input name="address" /></div>

          <hr style={{ borderColor: 'var(--border)', margin: '16px 0' }} />
          <label style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>Membership Plan (optional — sets up fee tracking)</label>
          <div className="form-grid" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Plan</label>
              <select name="plan_id" value={selectedPlanId} onChange={(e) => fillPlanDefaults(e.target.value)}>
                <option value="">— Assign later —</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}{p.includes_trainer ? ' (+ trainer)' : ''}</option>)}
              </select>
            </div>
            <div className="field"><label>Start Date</label><input type="date" name="start_date" defaultValue={selectedPlanId ? new Date().toISOString().slice(0, 10) : ''} /></div>
            <div className="field"><label>Total Fee (₹)</label><input type="number" name="total_fee" step="0.01" value={totalFee} onChange={(e) => setTotalFee(e.target.value)} /></div>
            <div className="field"><label>Amount Paid Now (₹)</label><input type="number" name="amount_paid" step="0.01" defaultValue="0" /></div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Member</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
