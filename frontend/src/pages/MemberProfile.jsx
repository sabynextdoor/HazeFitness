import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { money, fmtTime } from '../utils.js';
import { toast } from '../toast.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import RazorpayCheckout from '../components/RazorpayCheckout.jsx';

export default function MemberProfile() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [plans, setPlans] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [totalFee, setTotalFee] = useState('');
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [trainerFee, setTrainerFee] = useState('0');

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [trainerModalOpen, setTrainerModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [activeSub, setActiveSub] = useState(null);
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [dietModalOpen, setDietModalOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [onlinePay, setOnlinePay] = useState(null);

  async function loadPlans() {
    const p = await api('/plans');
    setPlans(p);
    if (p.length) {
      setSelectedPlanId(String(p[0].id));
      setTotalFee(p[0].price);
    }
  }

  async function loadMember() {
    const m = await api(`/members/${id}`);
    setMember(m);
    setSelectedTrainerId(m.trainer_id ? String(m.trainer_id) : '');
    setTrainerFee(String(m.subscriptions?.[0]?.trainer_fee || 0));
  }

  async function loadTrainers() {
    const rows = await api('/trainers');
    setTrainers(rows.filter((trainer) => trainer.status === 'active'));
  }

  useEffect(() => { loadPlans(); loadMember(); loadTrainers(); }, [id]);

  function fillPlan(planId) {
    setSelectedPlanId(planId);
    const plan = plans.find((p) => String(p.id) === planId);
    setTotalFee(plan ? plan.price : '');
  }

  function openPaymentModal(sub) {
    setActiveSub(sub);
    setPayModalOpen(true);
  }

  async function handleNewPlan(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    payload.member_id = id;
    try {
      await api('/fees/subscriptions', { method: 'POST', body: JSON.stringify(payload) });
      toast('Plan assigned');
      setPlanModalOpen(false);
      e.target.reset();
      loadMember();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handlePayment(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (payload.payment_mode === 'online') {
        setOnlinePay({ subscription: activeSub, amount: Number(payload.amount) });
        return;
      }
      const payment = await api('/fees/payments', { method: 'POST', body: JSON.stringify(payload) });
      toast('Payment recorded');
      setPayModalOpen(false);
      e.target.reset();
      loadMember();
      showReceipt(payment.id);
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleWorkout(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    payload.member_id = id;
    try {
      await api('/fitness-plans/workout', { method: 'POST', body: JSON.stringify(payload) });
      toast('Workout plan added');
      setWorkoutModalOpen(false);
      e.target.reset();
      loadMember();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleDiet(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    payload.member_id = id;
    try {
      await api('/fitness-plans/diet', { method: 'POST', body: JSON.stringify(payload) });
      toast('Diet plan added');
      setDietModalOpen(false);
      e.target.reset();
      loadMember();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function showReceipt(paymentId) {
    const r = await api(`/fees/receipt/${paymentId}`);
    setReceipt(r);
    setReceiptOpen(true);
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Please choose an image file', 'error');
    if (file.size > 2 * 1024 * 1024) return toast('Photo must be 2 MB or smaller', 'error');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const updated = await api(`/members/${id}`, { method: 'PUT', body: JSON.stringify({ photo_data: reader.result }) });
        setMember((current) => ({ ...current, photo_data: updated.photo_data }));
        toast('Profile photo updated');
      } catch (err) { toast(err.message, 'error'); }
    };
    reader.readAsDataURL(file);
  }

  async function handleProgress(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try { await api(`/members/${id}/progress`, { method: 'POST', body: JSON.stringify(payload) }); toast('Progress recorded'); setProgressOpen(false); e.target.reset(); loadMember(); } catch (err) { toast(err.message, 'error'); }
  }

  async function handleTrainerAssignment(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api(`/members/${id}/trainer-assignment`, { method: 'POST', body: JSON.stringify(payload) });
      toast(payload.trainer_id ? 'Trainer assigned and fee updated' : 'Trainer removed');
      setTrainerModalOpen(false);
      loadMember();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleProfileUpdate(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api(`/members/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('Member profile updated');
      setProfileModalOpen(false);
      loadMember();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (!member) {
    return (
      <div className="page-header"><div><h2>Loading…</h2></div></div>
    );
  }
  const currentSubscription = member.subscriptions[0];

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{member.full_name}</h2>
          <p>{member.member_code} · {member.phone} · Trainer: {member.trainer_name || 'Unassigned'}</p>
        </div>
        <div className="pill-row">
          <Link className="btn btn-ghost" to="/members">← Back to Members</Link>
          <button className="btn btn-primary" onClick={() => setPlanModalOpen(true)}>+ Assign / Renew Plan</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title-row"><h3>Profile</h3><button className="btn btn-sm btn-ghost" onClick={() => setProfileModalOpen(true)}>Edit Profile</button></div>
        <div className="profile-photo-row">
          {member.photo_data ? <img className="profile-avatar" src={member.photo_data} alt={`${member.full_name}'s profile`} /> : <div className="profile-avatar member-avatar-fallback">{member.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>}
          <div><strong>Member photo</strong><div className="text-dim">Upload an image up to 2 MB.</div><label className="btn btn-sm btn-ghost photo-upload-button">Upload photo<input type="file" accept="image/*" onChange={uploadPhoto} /></label></div>
        </div>
        <div className="form-grid">
          <div><label>Gender</label><div>{member.gender || '—'}</div></div>
          <div><label>Date of Birth</label><div>{member.dob || '—'}</div></div>
          <div><label>Email</label><div>{member.email || '—'}</div></div>
          <div><label>Join Date</label><div>{member.join_date}</div></div>
          <div><label>Fitness Goal</label><div>{member.fitness_goal || '—'}</div></div>
          <div><label>Status</label><div><StatusBadge status={member.status} /></div></div>
          <div>
            <label>Assigned Trainer</label>
            <div className="pill-row" style={{ alignItems: 'center' }}>
              <span>{member.trainer_name || 'Unassigned'}</span>
              {currentSubscription ? <button className="btn btn-sm btn-ghost" onClick={() => setTrainerModalOpen(true)}>{member.trainer_name ? 'Change' : '+ Assign Trainer'}</button> : <span className="text-dim">Assign a plan first</span>}
            </div>
            {currentSubscription && <small className="text-dim">Trainer fee: {money(currentSubscription.trainer_fee || 0)}</small>}
          </div>
          <div><label>Emergency Contact</label><div>{member.emergency_contact_name || '—'} {member.emergency_contact_phone ? `(${member.emergency_contact_phone})` : ''}</div></div>
          <div><label>Address</label><div>{member.address || '—'}</div></div>
        </div>
      </div>

      <MemberQrCode member={member} />

      <div className="panel">
        <h3>Fee Tracker — Subscriptions</h3>
        <table>
          <thead><tr><th>Plan</th><th>Period</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {member.subscriptions.length === 0 && <tr><td colSpan={7} className="empty">No subscriptions yet — assign a plan above</td></tr>}
            {member.subscriptions.map((s) => (
              <tr key={s.id}>
                <td>{s.plan_name}</td>
                <td>{s.start_date} → {s.end_date}</td>
                <td>{money(s.total_fee)}</td>
                <td>{money(s.amount_paid)}</td>
                <td>{money(s.balance_due)}</td>
                <td><StatusBadge status={s.payment_status} /></td>
                <td>{s.balance_due > 0 && <button className="btn btn-sm btn-primary" onClick={() => openPaymentModal(s)}>Record Payment</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Payment History</h3>
        <table>
          <thead><tr><th>Date</th><th>Receipt</th><th>Amount</th><th>Mode</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {member.payments.length === 0 && <tr><td colSpan={6} className="empty">No payments recorded yet</td></tr>}
            {member.payments.map((p) => (
              <tr key={p.id}>
                <td>{p.payment_date}</td>
                <td>{p.receipt_no}</td>
                <td>{money(p.amount)}</td>
                <td>{p.payment_mode.toUpperCase()}</td>
                <td>{p.note || '—'}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => showReceipt(p.id)}>Receipt</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Recent Attendance</h3>
        <table>
          <thead><tr><th>Date</th><th>Check-in</th><th>Check-out</th></tr></thead>
          <tbody>
            {member.attendance.length === 0 && <tr><td colSpan={3} className="empty">No attendance recorded yet</td></tr>}
            {member.attendance.map((a, i) => (
              <tr key={i}><td>{a.attendance_date}</td><td>{fmtTime(a.check_in)}</td><td>{fmtTime(a.check_out)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-title-row"><h3>Progress Tracker</h3><button className="btn btn-sm btn-primary" onClick={() => setProgressOpen(true)}>+ Record Progress</button></div>
        {member.progress.length === 0 && <p className="empty">No progress measurements recorded yet</p>}
        {member.progress.length > 0 && <table><thead><tr><th>Date</th><th>Weight</th><th>BMI</th><th>Chest</th><th>Waist</th><th>Hips</th><th>Notes</th></tr></thead><tbody>{member.progress.map((p) => { const bmi = p.weight_kg && p.height_cm ? Number(p.weight_kg / ((p.height_cm / 100) ** 2)).toFixed(1) : '—'; return <tr key={p.id}><td>{p.recorded_on}</td><td>{p.weight_kg ? `${p.weight_kg} kg` : '—'}</td><td>{bmi}</td><td>{p.chest_cm ? `${p.chest_cm} cm` : '—'}</td><td>{p.waist_cm ? `${p.waist_cm} cm` : '—'}</td><td>{p.hips_cm ? `${p.hips_cm} cm` : '—'}</td><td>{p.notes || '—'}</td></tr>; })}</tbody></table>}
      </div>

      <div className="panel">
        <h3>Workout Plans</h3>
        {member.workout_plans.length === 0 && <p className="empty">No workout plans yet</p>}
        {member.workout_plans.map((w) => (
          <div key={w.id} className="panel" style={{ background: 'var(--panel-2)', marginBottom: 10 }}>
            <strong>{w.title}</strong> <span className="text-dim" style={{ float: 'right' }}>{w.created_at.split(' ')[0]}</span>
            <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{w.details}</p>
          </div>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={() => setWorkoutModalOpen(true)} style={{ marginTop: 10 }}>+ Add Workout Plan</button>
      </div>

      <div className="panel">
        <h3>Diet Plans</h3>
        {member.diet_plans.length === 0 && <p className="empty">No diet plans yet</p>}
        {member.diet_plans.map((d) => (
          <div key={d.id} className="panel" style={{ background: 'var(--panel-2)', marginBottom: 10 }}>
            <strong>{d.title}</strong> <span className="text-dim" style={{ float: 'right' }}>{d.created_at.split(' ')[0]}</span>
            <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{d.details}</p>
          </div>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={() => setDietModalOpen(true)} style={{ marginTop: 10 }}>+ Add Diet Plan</button>
      </div>

      <Modal open={profileModalOpen} title="Edit Member Profile">
        <form onSubmit={handleProfileUpdate}>
          <div className="form-grid">
            <div className="field"><label>Full Name *</label><input name="full_name" defaultValue={member.full_name} required /></div>
            <div className="field"><label>Phone *</label><input name="phone" defaultValue={member.phone} required /></div>
            <div className="field"><label>Email *</label><input type="email" name="email" defaultValue={member.email} required /></div>
            <div className="field"><label>Gender</label><select name="gender" defaultValue={member.gender || ''}><option value="">Not specified</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
            <div className="field"><label>Date of Birth</label><input type="date" name="dob" defaultValue={member.dob || ''} /></div>
            <div className="field"><label>Join Date *</label><input type="date" name="join_date" defaultValue={member.join_date} required /></div>
            <div className="field"><label>Emergency Contact Name</label><input name="emergency_contact_name" defaultValue={member.emergency_contact_name || ''} /></div>
            <div className="field"><label>Emergency Contact Phone</label><input name="emergency_contact_phone" defaultValue={member.emergency_contact_phone || ''} /></div>
            <div className="field"><label>Status</label><select name="status" defaultValue={member.status}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          </div>
          <div className="field"><label>Fitness Goal</label><input name="fitness_goal" defaultValue={member.fitness_goal || ''} placeholder="e.g. Weight loss, strength" /></div>
          <div className="field"><label>Address</label><textarea name="address" rows={3} defaultValue={member.address || ''} /></div>
          <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setProfileModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save Changes</button></div>
        </form>
      </Modal>

      <Modal open={trainerModalOpen} title="Assign Trainer">
        <form onSubmit={handleTrainerAssignment}>
          <div className="field">
            <label>Trainer</label>
            <select name="trainer_id" value={selectedTrainerId} onChange={(e) => setSelectedTrainerId(e.target.value)}>
              <option value="">Unassigned</option>
              {trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.full_name}{trainer.specialization ? ` — ${trainer.specialization}` : ''}</option>)}
            </select>
            {trainers.length === 0 && <p className="text-dim">No active trainers available. Add a trainer from the Trainers page first.</p>}
          </div>
          <div className="field">
            <label>Trainer Fee (₹)</label>
            <input type="number" name="trainer_fee" min="0" step="0.01" value={trainerFee} onChange={(e) => setTrainerFee(e.target.value)} required />
            <small className="text-dim">This amount is added to the latest subscription total and balance.</small>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setTrainerModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={trainers.length === 0 && !selectedTrainerId}>Save Trainer</button>
          </div>
        </form>
      </Modal>

      <Modal open={planModalOpen} title="Assign / Renew Plan">
        <form onSubmit={handleNewPlan}>
          <div className="form-grid">
            <div className="field">
              <label>Plan</label>
              <select name="plan_id" value={selectedPlanId} onChange={(e) => fillPlan(e.target.value)} required>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}{p.includes_trainer ? ' (+ trainer)' : ''}</option>)}
              </select>
            </div>
            <div className="field"><label>Start Date *</label><input type="date" name="start_date" required /></div>
            <div className="field"><label>Total Fee (₹)</label><input type="number" step="0.01" name="total_fee" value={totalFee} onChange={(e) => setTotalFee(e.target.value)} /></div>
            <div className="field"><label>Amount Paid Now (₹)</label><input type="number" step="0.01" name="amount_paid" defaultValue={0} /></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setPlanModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </Modal>

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

      <Modal open={workoutModalOpen} title="Add Workout Plan">
        <form onSubmit={handleWorkout}>
          <div className="field"><label>Title *</label><input name="title" required placeholder="e.g. Strength Split - Week 1" /></div>
          <div className="field"><label>Details *</label><textarea name="details" rows={5} required placeholder="Exercise routine, sets/reps, etc." /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setWorkoutModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </Modal>

      <Modal open={dietModalOpen} title="Add Diet Plan">
        <form onSubmit={handleDiet}>
          <div className="field"><label>Title *</label><input name="title" required placeholder="e.g. High-Protein Cutting Plan" /></div>
          <div className="field"><label>Details *</label><textarea name="details" rows={5} required placeholder="Meal breakdown, macros, etc." /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setDietModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </Modal>

      <Modal open={progressOpen} title="Record Member Progress">
        <form onSubmit={handleProgress}><div className="form-grid"><div className="field"><label>Date *</label><input type="date" name="recorded_on" required defaultValue={new Date().toISOString().slice(0, 10)} /></div><div className="field"><label>Weight (kg)</label><input type="number" name="weight_kg" step="0.1" min="0" /></div><div className="field"><label>Height (cm)</label><input type="number" name="height_cm" step="0.1" min="0" /></div><div className="field"><label>Chest (cm)</label><input type="number" name="chest_cm" step="0.1" min="0" /></div><div className="field"><label>Waist (cm)</label><input type="number" name="waist_cm" step="0.1" min="0" /></div><div className="field"><label>Hips (cm)</label><input type="number" name="hips_cm" step="0.1" min="0" /></div></div><div className="field"><label>Notes</label><textarea name="notes" rows={3} placeholder="Goals, achievements, trainer notes…" /></div><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setProgressOpen(false)}>Cancel</button><button className="btn btn-primary">Save Progress</button></div></form>
      </Modal>

      <div className={`modal-backdrop receipt-backdrop${receiptOpen ? ' open' : ''}`}>
        <div className="modal">
          {receipt && (
            <>
              <div id="printableReceipt">
                <h3>Haze Fitness</h3>
                <p className="text-dim">Payment Receipt</p>
                <hr style={{ borderColor: 'var(--border)' }} />
                <p>
                  <strong>Receipt No:</strong> {receipt.receipt_no}<br />
                  <strong>Date:</strong> {receipt.payment_date}<br />
                  <strong>Member:</strong> {receipt.full_name} ({receipt.member_code})<br />
                  <strong>Phone:</strong> {receipt.phone}<br />
                  <strong>Plan:</strong> {receipt.plan_name}
                </p>
                <table>
                  <tbody>
                    <tr><td>Total Fee</td><td>{money(receipt.total_fee)}</td></tr>
                    <tr><td>This Payment</td><td>{money(receipt.amount)}</td></tr>
                    <tr><td>Total Paid Till Date</td><td>{money(receipt.amount_paid)}</td></tr>
                    <tr><td>Remaining Balance</td><td>{money(receipt.balance_due)}</td></tr>
                    <tr><td>Status</td><td>{receipt.payment_status}</td></tr>
                    <tr><td>Mode</td><td>{receipt.payment_mode.toUpperCase()}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setReceiptOpen(false)}>Close</button>
                <button className="btn btn-primary" onClick={() => window.print()}>Print / Download</button>
              </div>
            </>
          )}
        </div>
      </div>

      {onlinePay && (
        <RazorpayCheckout
          subscription={activeSub}
          amount={onlinePay.amount}
          memberName={member?.full_name}
          memberEmail={member?.email || ''}
          memberPhone={member?.phone || ''}
          onDone={() => { setOnlinePay(null); setPayModalOpen(false); loadMember(); }}
          onClose={() => setOnlinePay(null)}
        />
      )}
    </>
  );
}

function MemberQrCode({ member }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setImage('');
    setError('');
    QRCode.toDataURL(member.member_code, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#101828', light: '#ffffff' },
    }).then((dataUrl) => {
      if (active) setImage(dataUrl);
    }).catch(() => {
      if (active) setError('Could not generate this member QR code.');
    });
    return () => { active = false; };
  }, [member.member_code]);

  return (
    <div className="panel member-qr-card">
      <div>
        <h3 className="mt-0">Attendance QR Code</h3>
        <p className="text-dim">Scan this code from Attendance to check {member.full_name} in or out.</p>
        <strong>{member.member_code}</strong>
      </div>
      {image && <img className="member-qr-image" src={image} alt={`QR code for ${member.member_code}`} />}
      {error && <p className="text-dim">{error}</p>}
    </div>
  );
}
