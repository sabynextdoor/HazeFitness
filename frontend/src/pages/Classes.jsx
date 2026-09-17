import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.js';
import Modal from '../components/Modal.jsx';

export default function Classes() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trainers, setTrainers] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [bookClassId, setBookClassId] = useState(null);

  async function loadClasses() {
    setLoading(true);
    setError('');
    try {
      const rows = await api('/classes');
      setClasses(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api('/trainers').then(setTrainers).catch(() => {});
    loadClasses();
  }, []);

  function openBook(classId) {
    setBookClassId(classId);
    setBookOpen(true);
  }

  async function deleteClass(id) {
    if (!confirm('Delete this class?')) return;
    try {
      await api(`/classes/${id}`, { method: 'DELETE' });
      toast('Class deleted');
      loadClasses();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleBook(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    try {
      const matches = await api('/members?search=' + encodeURIComponent(fd.member_identifier));
      let memberId = matches.find((m) => m.member_code === fd.member_identifier)?.id;
      if (!memberId && matches.length === 1) memberId = matches[0].id;
      if (!memberId) throw new Error('Member not found — check the ID/code');
      await api(`/classes/${bookClassId}/book`, {
        method: 'POST',
        body: JSON.stringify({ member_id: memberId, booking_date: new Date().toISOString().slice(0, 10) }),
      });
      toast('Member booked into class');
      setBookOpen(false);
      e.target.reset();
      loadClasses();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleAddClass(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/classes', { method: 'POST', body: JSON.stringify(payload) });
      toast('Class added');
      setAddOpen(false);
      e.target.reset();
      loadClasses();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <div className="page-header">
        <div><h2>Classes &amp; Slots</h2><p>Manage class capacity and workout time slots</p></div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>+ Add Class</button>
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>Class</th><th>Trainer</th><th>Slot</th><th>Days</th><th>Capacity</th><th>Book (today)</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={7} className="empty">{error}</td></tr>}
            {!loading && !error && classes.length === 0 && <tr><td colSpan={7} className="empty">No classes yet</td></tr>}
            {!loading && !error && classes.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.trainer_name || '—'}</td>
                <td>{c.slot_time}</td>
                <td>{c.days_of_week}</td>
                <td>{c.capacity}</td>
                <td>{c.booked_count} / {c.capacity}</td>
                <td>
                  <button className="btn btn-sm btn-primary" onClick={() => openBook(c.id)}>Book</button>{' '}
                  <button className="btn btn-sm btn-danger" onClick={() => deleteClass(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={addOpen} title="Add Class">
        <form onSubmit={handleAddClass}>
          <div className="field"><label>Class Name *</label><input name="name" required placeholder="e.g. Morning Yoga" /></div>
          <div className="form-grid">
            <div className="field">
              <label>Trainer</label>
              <select name="trainer_id">
                <option value="">— None —</option>
                {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div className="field"><label>Capacity</label><input type="number" name="capacity" defaultValue={20} /></div>
            <div className="field"><label>Slot Time *</label><input name="slot_time" required placeholder="e.g. 06:00-07:00" /></div>
            <div className="field"><label>Days *</label><input name="days_of_week" required placeholder="e.g. Mon,Wed,Fri" /></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </Modal>

      <Modal open={bookOpen} title="Book Member into Class">
        <form onSubmit={handleBook}>
          <div className="field"><label>Member ID or Code *</label><input name="member_identifier" required placeholder="e.g. SFC0004" /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setBookOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Book</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
