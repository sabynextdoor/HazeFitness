import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Signup() {
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(e.target);
    const endpoint = role === 'staff' ? '/api/auth/signup' : '/api/auth/member-signup';
    const payload = {
      full_name: form.get('full_name'),
      email: form.get('email'),
      phone: form.get('phone'),
      ...(role === 'staff' ? { password: form.get('password') } : {}),
    };
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign up failed');
      window.location.href = data.redirect || '/dashboard';
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <div className="logo">HF</div>
          <h1>Haze Fitness<span>Gym Management</span></h1>
        </div>
        <h2>Create your account</h2>
        <p className="sub">Welcome to Haze Fitness.</p>

        <div className="auth-tabs">
          <button type="button" className={`tab-btn${role === 'member' ? ' active' : ''}`} onClick={() => { setRole('member'); setError(''); }}>Member</button>
          <button type="button" className={`tab-btn${role === 'staff' ? ' active' : ''}`} onClick={() => { setRole('staff'); setError(''); }}>Staff</button>
        </div>

        {error && <div className="error-box show">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field"><label>Full Name</label><input type="text" name="full_name" required autoComplete="name" /></div>
          <div className="field"><label>Email</label><input type="email" name="email" required autoComplete="email" /></div>
          <div className="field"><label>Phone Number</label><input type="tel" name="phone" required autoComplete="tel" /></div>
          {role === 'staff' && (
            <div className="field"><label>Password (min 8 characters)</label><input type="password" name="password" required minLength={8} autoComplete="new-password" /></div>
          )}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Creating account…' : role === 'staff' ? 'Create staff account' : 'Create member account'}
          </button>
        </form>

        <div className="switch-link">
          {role === 'member'
            ? <>Already a member? <Link to="/login">Log in</Link></>
            : <>Already have a staff account? <Link to="/login">Log in</Link></>}
        </div>
      </div>
    </div>
  );
}