import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { money } from '../utils.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Reports() {
  const [status, setStatus] = useState([]);
  const [collection, setCollection] = useState([]);
  const [dues, setDues] = useState([]);
  const [peak, setPeak] = useState([]);

  useEffect(() => {
    api('/reports/members-status').then(setStatus).catch(() => {});
    api('/reports/monthly-collection').then(setCollection).catch(() => {});
    api('/reports/pending-dues').then(setDues).catch(() => {});
    api('/reports/peak-attendance').then(setPeak).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-header">
        <div><h2>Reports &amp; Insights</h2><p>Exportable summaries for club operations</p></div>
      </div>

      <div className="panel">
        <h3 className="mt-0">Active vs Inactive Members</h3>
        <table>
          <thead><tr><th>Status</th><th>Count</th></tr></thead>
          <tbody>
            {status.length === 0 && <tr><td colSpan={2} className="empty">No data</td></tr>}
            {status.map((s, i) => <tr key={i}><td><StatusBadge status={s.status} /></td><td>{s.count}</td></tr>)}
          </tbody>
        </table>
        <a className="btn btn-sm btn-ghost" href="/api/reports/members-status?format=csv" style={{ marginTop: 10, display: 'inline-block' }}>Export CSV</a>
      </div>

      <div className="panel">
        <h3 className="mt-0">Monthly Cash Collection (Fees + POS)</h3>
        <table>
          <thead><tr><th>Month</th><th>Fee Collection</th><th>POS Collection</th><th>Total</th></tr></thead>
          <tbody>
            {collection.length === 0 && <tr><td colSpan={4} className="empty">No data yet</td></tr>}
            {collection.map((c, i) => <tr key={i}><td>{c.month}</td><td>{money(c.fee_collection)}</td><td>{money(c.pos_collection)}</td><td>{money(c.total)}</td></tr>)}
          </tbody>
        </table>
        <a className="btn btn-sm btn-ghost" href="/api/reports/monthly-collection?format=csv" style={{ marginTop: 10, display: 'inline-block' }}>Export CSV</a>
      </div>

      <div className="panel">
        <h3 className="mt-0">Pending Dues List</h3>
        <table>
          <thead><tr><th>Member</th><th>Plan</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            {dues.length === 0 && <tr><td colSpan={6} className="empty">No pending dues 🎉</td></tr>}
            {dues.map((d, i) => (
              <tr key={i}>
                <td>{d.full_name}<div className="text-dim">{d.member_code}</div></td>
                <td>{d.plan_name}</td>
                <td>{money(d.total_fee)}</td>
                <td>{money(d.amount_paid)}</td>
                <td>{money(d.balance_due)}</td>
                <td><StatusBadge status={d.payment_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <a className="btn btn-sm btn-ghost" href="/api/reports/pending-dues?format=csv" style={{ marginTop: 10, display: 'inline-block' }}>Export CSV</a>
      </div>

      <div className="panel">
        <h3 className="mt-0">Peak Attendance Hours</h3>
        <table>
          <thead><tr><th>Hour</th><th>Check-ins</th></tr></thead>
          <tbody>
            {peak.length === 0 && <tr><td colSpan={2} className="empty">No attendance data yet</td></tr>}
            {peak.map((p, i) => <tr key={i}><td>{p.hour}:00</td><td>{p.check_ins}</td></tr>)}
          </tbody>
        </table>
        <a className="btn btn-sm btn-ghost" href="/api/reports/peak-attendance?format=csv" style={{ marginTop: 10, display: 'inline-block' }}>Export CSV</a>
      </div>
    </>
  );
}
