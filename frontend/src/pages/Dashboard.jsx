import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { money } from '../utils.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState([]);
  const [attendanceTrend, setAttendanceTrend] = useState([]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [d, monthlyData, attendanceData] = await Promise.all([
        api('/dashboard'), api('/reports/monthly-collection'), api('/reports/attendance-trend'),
      ]);
      setData(d);
      setMonthly(monthlyData);
      setAttendanceTrend(attendanceData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Live overview of Haze Fitness</p>
        </div>
        <button className="btn btn-ghost" onClick={load}>↻ Refresh</button>
      </div>

      {data && (
        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {[0, 1].map((dup) => (
              <span className="ticker-group" key={dup}>
                <span className="ticker-item">Active Members<b>{data.total_active_members}</b><span className="tick-sep">◆</span></span>
                <span className="ticker-item">Today's Attendance<b>{data.daily_attendance}</b><span className="tick-sep">◆</span></span>
                <span className="ticker-item">Monthly Revenue<b>{money(data.monthly_revenue.total)}</b><span className="tick-sep">◆</span></span>
                <span className="ticker-item">Pending Dues<b className="tick-down">{money(data.total_pending_dues)}</b><span className="tick-sep">◆</span></span>
                <span className="ticker-item">Expiring<b>{data.upcoming_expirations.length} plan</b><span className="tick-sep">◆</span></span>
                <span className="ticker-item">Birthdays<b>{data.upcoming_birthdays.length}</b><span className="tick-sep">◆</span></span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="stat-grid">
        {loading && <div className="empty">Loading…</div>}
        {error && <div className="empty">{error}</div>}
        {data && (
          <>
            <div className="stat-card accent">
              <div className="label">Active Members</div>
              <div className="value">{data.total_active_members}</div>
            </div>
            <div className="stat-card">
              <div className="label">Today's Attendance</div>
              <div className="value">{data.daily_attendance}</div>
            </div>
            <div className="stat-card">
              <div className="label">Monthly Revenue</div>
              <div className="value">{money(data.monthly_revenue.total)}</div>
              <div className="sub">Fees {money(data.monthly_revenue.fees)} · POS {money(data.monthly_revenue.pos)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Pending Dues</div>
              <div className="value">{money(data.total_pending_dues)}</div>
              <div className="sub">{data.pending_dues_count} subscription(s)</div>
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h3>Upcoming Plan Expirations (next 7 days)</h3>
        <table>
          <thead><tr><th>Member</th><th>Phone</th><th>Plan</th><th>Expires On</th></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={4} className="empty">Loading…</td></tr>}
            {data && data.upcoming_expirations.length === 0 && (
              <tr><td colSpan={4} className="empty">No plans expiring in the next 7 days</td></tr>
            )}
            {data && data.upcoming_expirations.map((e, i) => (
              <tr key={i}>
                <td>{e.full_name} <span className="text-dim">({e.member_code})</span></td>
                <td>{e.phone}</td>
                <td>{e.plan_name}</td>
                <td>{e.end_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="chart-grid">
        <RevenueChart rows={monthly} />
        <AttendanceChart rows={attendanceTrend} />
      </div>

      <div className="panel">
        <h3>Upcoming Birthdays (next 7 days)</h3>
        <table>
          <thead><tr><th>Member</th><th>Phone</th><th>Date of Birth</th></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={3} className="empty">Loading…</td></tr>}
            {data && data.upcoming_birthdays.length === 0 && <tr><td colSpan={3} className="empty">No birthdays in the next 7 days</td></tr>}
            {data && data.upcoming_birthdays.map((b) => <tr key={b.id}><td>{b.full_name} <span className="text-dim">({b.member_code})</span></td><td>{b.phone}</td><td>{b.dob}</td></tr>)}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Payment Status Breakdown</h3>
        <table>
          <thead><tr><th>Status</th><th>Subscriptions</th><th>Total Outstanding</th></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={3} className="empty">Loading…</td></tr>}
            {data && data.payment_status_breakdown.length === 0 && (
              <tr><td colSpan={3} className="empty">No data yet</td></tr>
            )}
            {data && data.payment_status_breakdown.map((s, i) => (
              <tr key={i}>
                <td><StatusBadge status={s.payment_status} /></td>
                <td>{s.count}</td>
                <td>{money(s.total_due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function monthKey(year, month) { return `${year}-${String(month + 1).padStart(2, '0')}`; }

function recentMonths(rows) {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const month = monthKey(date.getFullYear(), date.getMonth());
    return byMonth.get(month) || { month, fee_collection: 0, pos_collection: 0 };
  });
}

function recentDays(rows) {
  const byDate = new Map(rows.map((row) => [row.attendance_date, row]));
  const today = new Date();
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29 + index);
    const attendance_date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return byDate.get(attendance_date) || { attendance_date, visits: 0 };
  });
}

function RevenueChart({ rows }) {
  const [visibleSeries, setVisibleSeries] = useState({ fees: true, pos: true });
  const chartRows = recentMonths(rows);
  const width = 620;
  const height = 310;
  const pad = { top: 58, right: 34, bottom: 42, left: 54 };
  const values = chartRows.flatMap((r) => [Number(r.fee_collection) || 0, Number(r.pos_collection) || 0]);
  const rawMax = Math.max(...values, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const max = Math.ceil(rawMax / magnitude) * magnitude;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (chartRows.length <= 1 ? plotWidth / 2 : (i * plotWidth) / (chartRows.length - 1));
  const y = (value) => pad.top + plotHeight - ((Number(value) || 0) / max) * plotHeight;
  const pathFor = (field) => chartRows.map((r, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(r[field])}`).join(' ');
  const areaFor = (field) => chartRows.length ? `${pathFor(field)} L ${x(chartRows.length - 1)} ${pad.top + plotHeight} L ${x(0)} ${pad.top + plotHeight} Z` : '';
  const label = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const toggleSeries = (series) => setVisibleSeries((current) => ({ ...current, [series]: !current[series] }));

  return <div className="panel revenue-panel">
    <h3>Revenue over time</h3><p className="chart-subtitle">Monthly fees and POS collections</p>
    <div className="revenue-chart-wrap"><svg className="revenue-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly fees and POS revenue chart">
      {[0, 1, 2, 3, 4, 5].map((step) => { const value = (max / 5) * step; const py = y(value); return <g key={step}><line x1={pad.left} y1={py} x2={width - pad.right} y2={py} className="chart-gridline" /><text x={pad.left - 10} y={py + 4} textAnchor="end" className="chart-axis-label">{Math.round(value).toLocaleString('en-IN')}</text></g>; })}
      <g className={`chart-legend-item${visibleSeries.fees ? '' : ' inactive'}`} role="button" tabIndex="0" aria-label="Toggle Fees revenue" onClick={() => toggleSeries('fees')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleSeries('fees'); }}><circle cx={width / 2 - 72} cy="27" r="8" className="fees-dot" /><text x={width / 2 - 59} y="32">Fees</text></g>
      <g className={`chart-legend-item${visibleSeries.pos ? '' : ' inactive'}`} role="button" tabIndex="0" aria-label="Toggle POS revenue" onClick={() => toggleSeries('pos')} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleSeries('pos'); }}><circle cx={width / 2 + 10} cy="27" r="8" className="pos-dot" /><text x={width / 2 + 23} y="32">POS</text></g>
      {visibleSeries.fees && <><path d={areaFor('fee_collection')} className="fees-area" /><path d={pathFor('fee_collection')} className="fees-line" /></>}
      {visibleSeries.pos && <path d={pathFor('pos_collection')} className="pos-line" />}
      {chartRows.map((r, i) => <g key={r.month}>{visibleSeries.fees && <circle cx={x(i)} cy={y(r.fee_collection)} r="3.5" className="fees-point"><title>{`${label(r.month)} Fees: ${money(r.fee_collection)}`}</title></circle>}{visibleSeries.pos && <circle cx={x(i)} cy={y(r.pos_collection)} r="3.5" className="pos-point"><title>{`${label(r.month)} POS: ${money(r.pos_collection)}`}</title></circle>}<text x={x(i)} y={height - 14} textAnchor="middle" className="chart-axis-label">{label(r.month)}</text></g>)}
    </svg></div>
  </div>;
}

function AttendanceChart({ rows }) {
  const chartRows = recentDays(rows);
  const width = 620;
  const height = 310;
  const pad = { top: 58, right: 34, bottom: 42, left: 54 };
  const values = chartRows.map((row) => Number(row.visits) || 0);
  const rawMax = Math.max(...values, 1);
  const max = Math.ceil(rawMax / 5) * 5 || 5;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (chartRows.length <= 1 ? plotWidth / 2 : (i * plotWidth) / (chartRows.length - 1));
  const y = (value) => pad.top + plotHeight - ((Number(value) || 0) / max) * plotHeight;
  const path = chartRows.map((row, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(row.visits)}`).join(' ');
  const area = chartRows.length ? `${path} L ${x(chartRows.length - 1)} ${pad.top + plotHeight} L ${x(0)} ${pad.top + plotHeight} Z` : '';
  const label = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const labelIndexes = new Set([0, 6, 12, 18, 24, 29]);
  return <div className="panel chart-panel attendance-panel"><h3>Attendance trend</h3><p className="chart-subtitle">Member visits during the last 30 days</p>
    <div className="revenue-chart-wrap"><svg className="revenue-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily attendance trend chart">
      {[0, 1, 2, 3, 4, 5].map((step) => { const value = (max / 5) * step; const py = y(value); return <g key={step}><line x1={pad.left} y1={py} x2={width - pad.right} y2={py} className="chart-gridline" /><text x={pad.left - 10} y={py + 4} textAnchor="end" className="chart-axis-label">{Math.round(value)}</text></g>; })}
      <g className="chart-legend"><circle cx={width / 2 - 54} cy="27" r="8" className="attendance-dot" /><text x={width / 2 - 41} y="32">Visits</text></g>
      <path d={area} className="attendance-area" /><path d={path} className="attendance-line" />
      {chartRows.map((row, i) => <g key={row.attendance_date}><circle cx={x(i)} cy={y(row.visits)} r="3.5" className="attendance-point"><title>{`${label(row.attendance_date)}: ${row.visits} visits`}</title></circle>{labelIndexes.has(i) && <text x={x(i)} y={height - 14} textAnchor="middle" className="chart-axis-label">{label(row.attendance_date)}</text>}</g>)}
    </svg></div>
  </div>;
}

function MiniChart({ title, rows, label, value, format }) {
  const values = rows.map((row) => Number(row[value]) || 0);
  const max = Math.max(...values, 1);
  return <div className="panel chart-panel"><h3>{title}</h3>
    {rows.length === 0 ? <p className="empty">No data yet</p> : <div className="mini-chart">
      {rows.map((row) => <div className="mini-bar-wrap" key={row[label]} title={`${row[label]}: ${format(Number(row[value]) || 0)}`}>
        <div className="mini-bar" style={{ height: `${Math.max(8, (Number(row[value]) || 0) / max * 100)}%` }} />
        <span>{String(row[label]).slice(5)}</span>
      </div>)}
    </div>}
  </div>;
}
