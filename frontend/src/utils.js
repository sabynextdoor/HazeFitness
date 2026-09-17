export function money(n) {
  const num = Number(n || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

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
