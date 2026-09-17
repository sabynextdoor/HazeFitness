export default function StatusBadge({ status }) {
  const map = {
    Paid: 'badge-paid',
    'Partially Paid': 'badge-partial',
    Unpaid: 'badge-unpaid',
    active: 'badge-active',
    inactive: 'badge-inactive',
  };
  const cls = map[status] || 'badge-inactive';
  return <span className={`badge ${cls}`}>{status}</span>;
}
