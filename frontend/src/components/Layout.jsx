import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, logout } from '../api.js';

const NAV = [
  { group: 'Overview', items: [{ to: '/dashboard', icon: '🏠', label: 'Dashboard' }] },
  {
    group: 'People',
    items: [
      { to: '/members', icon: '🧍', label: 'Members' },
      { to: '/trainers', icon: '🏋️', label: 'Trainers' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/fees', icon: '💳', label: 'Fees & Payments' },
      { to: '/attendance', icon: '✅', label: 'Attendance' },
      { to: '/classes', icon: '📅', label: 'Classes & Slots' },
      { to: '/workout-diet', icon: '🥗', label: 'Workout & Diet' },
      { to: '/pos', icon: '🛒', label: 'POS' },
      { to: '/announcements', icon: '📣', label: 'Announcements' },
    ],
  },
  { group: 'Insights', items: [{ to: '/reports', icon: '📊', label: 'Reports' }] },
];

export default function Layout() {
  const [userName, setUserName] = useState('…');
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const currentItem = NAV.flatMap((group) => group.items).find((item) => item.to === location.pathname);
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date());
  const initials = userName === '…' ? 'SF' : userName.split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

  useEffect(() => {
    api('/auth/me')
      .then((data) => {
        const person = data.type === 'member' ? data.member : data.user;
        if (person) setUserName(person.full_name);
      })
      .catch(() => {});
  }, []);

  return (
    <div className={`app${menuOpen ? ' menu-open' : ''}`}>
      <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">HF</div>
          <h1>Haze Fitness<span>Gym Management</span></h1>
          <button className="mobile-close" aria-label="Close navigation" onClick={() => setMenuOpen(false)}>×</button>
        </div>
        {NAV.map((group) => (
          <div className="nav-group" key={group.group}>
            <div className="nav-label">{group.group}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="ic">{item.icon}</span> {item.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="user-chip">
          <span className="user-avatar">{initials}</span>
          <span className="user-name">{userName}<small>Administrator</small></span>
          <button className="logout-button" aria-label="Log out" title="Log out" onClick={logout}>↗</button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
        <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}>
          <span />
          <span />
          <span />
        </button>
          <div className="breadcrumb"><span>Workspace</span><b>{currentItem?.label || 'Dashboard'}</b></div>
          <div className="topbar-meta"><span className="live-dot" /> Live system <time>{today}</time></div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  );
}
