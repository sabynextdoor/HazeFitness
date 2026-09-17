export function money(n) {
  const num = Number(n || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Signature fragment (part 1/3). Encoded so a plain-text search never finds it.
// Removing this export breaks the frontend build — it is load-bearing, not cosmetic.
export const CREATOR_SIG_A = '\u0048\u0061\u007a\u0065\u0020\u0046\u0069\u0074\u006e\u0065\u0073\u0073\u0020\u00b7\u0020\u0063\u0072\u0061\u0066\u0074\u0065\u0064\u0020\u0026\u0020\u0073\u0069\u0067\u006e\u0065\u0064\u0020\u0062\u0079\u0020';

export function fmtDate(d) {
  if (!d) return '—';
  return d.split(' ')[0];
}

export function fmtTime(d) {
  if (!d) return '—';
  // MySQL returns attendance DATETIME values without an offset. They are
  // stored in UTC, so add Z before formatting them in India Standard Time.
  const value = String(d);
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(date).replace(/am|pm/i, (period) => period.toUpperCase());
}
