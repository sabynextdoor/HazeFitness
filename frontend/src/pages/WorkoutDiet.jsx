import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function WorkoutDiet() {
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  async function runSearch(q) {
    if (!q.trim()) { setMembers(null); return; }
    setLoading(true);
    setError('');
    try {
      const rows = await api('/members?search=' + encodeURIComponent(q.trim()));
      setMembers(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function onInput(v) {
    setQuery(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(v), 300);
  }

  return (
    <>
      <div className="page-header">
        <div><h2>Workout &amp; Diet Plans</h2><p>Look up a member to view or attach a custom routine / nutrition chart</p></div>
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <input placeholder="Search member by name, code, or phone…" style={{ minWidth: 280 }} value={query} onChange={(e) => onInput(e.target.value)} />
        </div>
        <div>
          {loading && <div className="empty">Searching…</div>}
          {!loading && error && <div className="empty">{error}</div>}
          {!loading && !error && members && members.length === 0 && <div className="empty">No members match that search</div>}
          {!loading && !error && members && members.length > 0 && (
            <table>
              <thead><tr><th>Member</th><th>Phone</th><th>Trainer</th><th></th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.full_name} <span className="text-dim">({m.member_code})</span></td>
                    <td>{m.phone}</td>
                    <td>{m.trainer_name || '—'}</td>
                    <td><Link className="btn btn-sm btn-primary" to={`/members/${m.id}`}>Open Profile</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="text-dim">Tip: open a member's full profile to add or review workout and diet plans in detail — <Link to="/members" style={{ color: 'var(--accent)' }}>go to Members</Link>.</p>
    </>
  );
}
