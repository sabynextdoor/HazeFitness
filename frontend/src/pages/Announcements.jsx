import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDate } from '../utils.js';
import { toast } from '../toast.js';

export default function Announcements() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  async function loadAnnouncements() {
    try {
      const data = await api('/announcements');
      setRows(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { loadAnnouncements(); }, []);

  async function createAnnouncement(e) {
    e.preventDefault();
    try {
      await api('/announcements', { method: 'POST', body: JSON.stringify({ title: title.trim(), message: message.trim() }) });
      toast('Announcement posted');
      setTitle('');
      setMessage('');
      loadAnnouncements();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function deleteAnnouncement(id) {
    if (!confirm('Delete this announcement?')) return;
    try {
      await api(`/announcements/${id}`, { method: 'DELETE' });
      toast('Deleted');
      loadAnnouncements();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <div className="page-header">
        <div><h2>Announcements</h2><p>Post information for all members to see in their portal</p></div>
      </div>

      <div className="panel">
        <h3>New Announcement</h3>
        <form onSubmit={createAnnouncement}>
          <div className="field">
            <label>Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="e.g. Holiday hours this weekend" />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="Write the full announcement here…" />
          </div>
          <button type="submit" className="btn btn-primary">Post Announcement</button>
        </form>
      </div>

      <div className="panel">
        <h3>Posted Announcements</h3>
        {!rows && !error && <div className="empty">Loading…</div>}
        {error && <div className="empty">{error}</div>}
        {rows && rows.length === 0 && <div className="empty">No announcements posted yet</div>}
        {rows && rows.map((a) => (
          <div key={a.id} className="plan-card" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
              <div>
                <h4 style={{ margin: '0 0 6px' }}>{a.title}</h4>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-dim)' }}>{a.message}</p>
                <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 8 }}>
                  Posted {fmtDate(a.created_at)} {a.created_by_name ? `by ${a.created_by_name}` : ''}
                </div>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => deleteAnnouncement(a.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
