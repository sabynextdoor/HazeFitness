import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';

export default function Trainers() {
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  async function loadTrainers() {
    setLoading(true);
    setError('');
    try {
      const rows = await api('/trainers' + (search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''));
      setTrainers(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTrainers(); }, [search]);

  async function deleteTrainer(id) {
    if (!confirm('Remove this trainer? Assigned members will become unassigned.')) return;
    try {
      await api(`/trainers/${id}`, { method: 'DELETE' });
      toast('Trainer removed');
      loadTrainers();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/trainers', { method: 'POST', body: JSON.stringify(payload) });
      toast('Trainer added');
      setModalOpen(false);
      e.target.reset();
      loadTrainers();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <div className="page-header">
        <div><h2>Trainers</h2><p>Manage staff and their assigned members</p></div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ Add Trainer</button>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input placeholder="Search trainers…" style={{ minWidth: 240 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Specialization</th><th>Schedule</th><th>Active Members</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={7} className="empty">{error}</td></tr>}
            {!loading && !error && trainers.length === 0 && <tr><td colSpan={7} className="empty">No trainers yet</td></tr>}
            {!loading && !error && trainers.map((t) => (
              <tr key={t.id}>
                <td>{t.full_name}</td>
                <td>{t.phone}</td>
                <td>{t.specialization || '—'}</td>
                <td>{t.schedule_notes || '—'}</td>
                <td>{t.active_members}</td>
                <td><StatusBadge status={t.status} /></td>
                <td><button className="btn btn-sm btn-danger" onClick={() => deleteTrainer(t.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} title="Add Trainer">
        <form onSubmit={handleAdd}>
          <div className="form-grid">
            <div className="field"><label>Full Name *</label><input name="full_name" required /></div>
            <div className="field"><label>Phone *</label><input name="phone" required /></div>
            <div className="field"><label>Email</label><input type="email" name="email" /></div>
            <div className="field"><label>Specialization</label><input name="specialization" placeholder="e.g. Strength & Conditioning" /></div>
          </div>
          <div className="field"><label>Schedule Notes</label><input name="schedule_notes" placeholder="e.g. Mon–Sat, 6AM–2PM" /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
