import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from '../toast.js';
import ClerkGoogleButton from '../components/ClerkGoogleButton.jsx';

const RESEND_WAIT = 30;
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

export default function Login() {
  const [role, setRole] = useState('admin');
  const [method, setMethod] = useState('password');
  const [params, setParams] = useSearchParams();

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [googleOn, setGoogleOn] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [wait, setWait] = useState(0);
  const [googleLoading, setGoogleLoading] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    fetch('/api/auth/google/config', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setGoogleOn(Boolean(d.configured)))
      .catch(() => setGoogleOn(false));
  }, []);

  useEffect(() => {
    const msg = params.get('google');
    if (!msg) return;
    const map = {
      noaccount: "That Google account isn't linked to any Haze Fitness account yet.",
      inactive: 'Your membership is not active. Contact the front desk.',
      declined: 'Google sign-in was cancelled.',
      invalid: 'Google sign-in failed (state mismatch). Try again.',
      failed: 'Google sign-in failed. Try again or use email login.',
    };
    if (map[msg]) toast(map[msg], 'error');
    setParams({}, { replace: true });
  }, [params, setParams]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  function switchRole(r) { setRole(r); setError(''); setNotice(''); }
  function switchMethod(m) { setMethod(m); setError(''); setNotice(''); }

  async function post(path, payload) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }

  async function handlePasswordLogin(e) {
    e.preventDefault();
    setError(''); setNotice('');
    setBusy(true);
    const fd = new FormData(e.target);
    try {
      if (role === 'admin') {
        await post('/api/auth/login', { email: fd.get('email'), password: fd.get('password') });
        window.location.href = '/dashboard';
      } else {
        await post('/api/auth/member-login', {
          email: fd.get('email'),
          password: fd.get('password'),
        });
        window.location.href = '/member-portal';
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function requestOtp(e) {
    e.preventDefault();
    setError(''); setNotice('');
    setBusy(true);
    const email = String(e.target.email.value || '').trim().toLowerCase();
    try {
      const data = await post('/api/auth/request-otp', { email });
      setOtpEmail(email);
      setOtpSent(true);
      setDevOtp(data.dev_otp || '');
      setNotice(
        data.dev_otp
          ? `A demo code has been generated for you (check the box below).`
          : 'A 6-digit code was sent — if no email server is configured, check the server console for [OTP].',
      );
      startResendTimer(data.resend_after || RESEND_WAIT);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function startResendTimer(seconds) {
    clearInterval(timerRef.current);
    setWait(seconds);
    timerRef.current = setInterval(() => {
      setWait((w) => {
        if (w <= 1) { clearInterval(timerRef.current); return 0; }
        return w - 1;
      });
    }, 1000);
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setError(''); setNotice('');
    setBusy(true);
    const otp = String(e.target.otp.value || '').trim();
    try {
      const data = await post('/api/auth/verify-otp', { email: otpEmail, otp });
      window.location.href = data.redirect || '/dashboard';
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function restartOtp() {
    setOtpSent(false);
    setDevOtp('');
    setWait(0);
    setError('');
    setNotice('');
  }

  async function resendOtp() {
    setError(''); setNotice('');
    setBusy(true);
    try {
      const data = await post('/api/auth/request-otp', { email: otpEmail });
      setDevOtp(data.dev_otp || '');
      setNotice(data.dev_otp ? 'A fresh demo code has been generated (see box below).' : 'A fresh code has been sent.');
      startResendTimer(data.resend_after || RESEND_WAIT);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function startGoogle() {
    if (googleLoading) return;
    if (!googleOn) {
      setError('');
      setNotice('Google sign-in is not configured on this server yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL to the backend .env file to enable "Continue with Google" and "Sign up with Google".');
      return;
    }
    setGoogleLoading(true);
    try {
      const res = await fetch('/api/auth/google', { credentials: 'include', redirect: 'follow' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data.error) { setError(data.error); setGoogleLoading(false); return; }
      // Server responded 3xx normally; fetch follows it. If we end up here with a
      // JSON body, show the message; otherwise hard-reload to the consent screen.
      if (res.url && res.url.includes('accounts.google.com')) { window.location.assign(res.url); return; }
      window.location.href = window.location.origin + '/api/auth/google';
    } catch {
      window.location.href = window.location.origin + '/api/auth/google';
    }
  }

  return (
    <div className="login-stage">
      <div className="lx-grid" aria-hidden="true" />
      <div className="lx-spotlight" aria-hidden="true" />
      <div className="lx-orb lx-orb-1" aria-hidden="true" />
      <div className="lx-orb lx-orb-2" aria-hidden="true" />
      <div className="lx-orb lx-orb-3" aria-hidden="true" />

      <aside className="lx-glow-card lx-glow-1" aria-hidden="true">
        <span className="lx-glow-label">MEMBERS ACTIVE</span>
        <strong>12,480</strong>
        <em>sessions logged this month</em>
      </aside>
      <aside className="lx-glow-card lx-glow-2" aria-hidden="true">
        <span className="lx-glow-label">PAYMENTS PROCESSED</span>
        <strong>₹4.2L</strong>
        <em>in recurring fee collections</em>
      </aside>

      <main className="lx-card">
        <div className="lx-brand" style={{ '--i': 1 }}>
          <div className="lx-logo"><span>HF</span></div>
          <div className="lx-eyebrow">HAZE FITNESS CLUB</div>
        </div>

        <h1 className="lx-title" style={{ '--i': 2 }}>
          Welcome<span className="lx-accent"> back</span>
        </h1>
        <p className="lx-sub" style={{ '--i': 3 }}>Sign in to manage your membership — or your club.</p>

        <div className="lx-tabs" role="tablist" style={{ '--i': 4 }}>
          {['admin', 'member'].map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={role === r}
              className={`lx-tab ${role === r ? 'active' : ''}`}
              onClick={() => switchRole(r)}
            >
              <span className="lx-tab-dot" />
              {r === 'admin' ? 'Staff / Admin' : 'Member'}
            </button>
          ))}
        </div>

        {(error || notice) && (
          <div className={`lx-msg ${error ? 'lx-error' : 'lx-notice'}`} style={{ '--i': 5 }}>
            {error || notice}
          </div>
        )}

        {method !== 'google' && (
          <div className="lx-methods" style={{ '--i': 6 }}>
            <button type="button" className={`lx-method ${method === 'password' ? 'active' : ''}`} onClick={() => switchMethod('password')}>Password</button>
            <button type="button" className={`lx-method ${method === 'otp' ? 'active' : ''}`} onClick={() => switchMethod('otp')}>Email OTP</button>
          </div>
        )}

        <div className="lx-form-wrap" style={{ '--i': 7 }}>
          {method === 'password' && role === 'admin' && (
            <form className="lx-form" onSubmit={handlePasswordLogin}>
              <div className="field lx-field">
                <label>Username or email</label>
                <input type="text" name="email" placeholder="hazeadmin or you@example.com" required autoComplete="username" />
              </div>
              <div className="field lx-field">
                <label>Password</label>
                <input type="password" name="password" placeholder="••••••••" required autoComplete="current-password" />
              </div>
              <button className="lx-cta" type="submit" disabled={busy}>
                <span>{busy ? 'Logging in…' : 'Log in for staff'} </span>
                <span className="lx-cta-arrow">→</span>
              </button>
            </form>
          )}

          {method === 'password' && role === 'member' && (
            <form className="lx-form" onSubmit={handlePasswordLogin}>
              <div className="field lx-field">
                <label>Username or email</label>
                <input type="text" name="email" placeholder="hazeadmin or you@example.com" required autoComplete="username" />
              </div>
              <div className="field lx-field">
                <label>Password</label>
                <input type="password" name="password" placeholder="••••••••" required autoComplete="current-password" />
              </div>
              <button className="lx-cta" type="submit" disabled={busy}>
                <span>{busy ? 'Logging in…' : 'Log in as member'} </span>
                <span className="lx-cta-arrow">→</span>
              </button>
              <p className="lx-hint">
                Members can log in with their phone, email or username and password. No Member ID needed.
              </p>
            </form>
          )}

          {method === 'otp' && !otpSent && (
            <form className="lx-form" onSubmit={requestOtp}>
              <div className="field lx-field">
                <label>Email address</label>
                <input type="email" name="email" placeholder="you@example.com" required autoComplete="email" />
              </div>
              <button className="lx-cta" type="submit" disabled={busy}>
                <span>{busy ? 'Sending code…' : 'Send me a one-time code'} </span>
                <span className="lx-cta-arrow">→</span>
              </button>
              <p className="lx-hint">
                We'll email a 6-digit code. It works for both staff and member accounts that use this email.
              </p>
            </form>
          )}

          {method === 'otp' && otpSent && (
            <form className="lx-form" onSubmit={verifyOtp}>
              <div className="field lx-field">
                <label>Code sent to</label>
                <input className="lx-readonly" value={otpEmail} readOnly />
              </div>
              {devOtp && (
                <div className="lx-devcode">
                  <span className="lx-devcode-label">DEV CODE</span>
                  <span className="lx-devcode-value">{devOtp}</span>
                </div>
              )}
              <div className="field lx-field">
                <label>6-digit code</label>
                <input
                  type="text" name="otp" inputMode="numeric" maxLength={6} pattern="[0-9]{6}"
                  placeholder="••••••" required autoComplete="one-time-code"
                />
              </div>
              <button className="lx-cta" type="submit" disabled={busy}>
                <span>{busy ? 'Verifying…' : 'Verify & sign in'} </span>
                <span className="lx-cta-arrow">→</span>
              </button>
              <div className="lx-row">
                <button type="button" className="lx-linkbtn" onClick={restartOtp}>Use a different email</button>
                <button type="button" className="lx-linkbtn" disabled={wait > 0 || busy} onClick={resendOtp}>
                  {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {method !== 'google' && (
            <div className="lx-divider" style={{ '--i': 8 }}><span>or continue with</span></div>
          )}

          {CLERK_KEY ? (
            <ClerkGoogleButton onNotice={setNotice} />
          ) : (
            <button
              type="button"
              className="lx-google lx-gbtn"
              style={{ '--i': 9 }}
              onClick={startGoogle}
              disabled={googleLoading}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.59-5.17 3.59-8.81z" />
                <path fill="#34A853" d="M12 24c3.25 0 5.98-1.07 7.97-2.91l-3.88-3a7.06 7.06 0 0 1-4.09 1.2c-2.7 0-4.99-1.82-5.8-4.28H3.2v3.11A11.99 11.99 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M6.2 14.01a7.2 7.2 0 0 1 0-4.61V6.29H3.2a11.96 11.96 0 0 0 0 10.83l3-2.11z" />
                <path fill="#EA4335" d="M12 4.62c1.77 0 3.36.61 4.61 1.8l3.45-3.44A11.96 11.96 0 0 0 3.2 6.29l3 3.11C7.01 6.44 9.3 4.62 12 4.62z" />
              </svg>
              <span>{googleLoading ? 'Connecting to Google…' : 'Continue with Google'}</span>
            </button>
          )}

          {method === 'google' && !googleOn && !CLERK_KEY && (
            <p className="lx-hint">Google login is not configured on this server yet.</p>
          )}
        </div>

        <div className="lx-footer" style={{ '--i': 10 }}>
          {role === 'admin'
            ? <>New staff member? <Link to="/signup">Create a staff account</Link></>
            : <>New to the gym? <Link to="/signup">Create a member account</Link> · <span className="text-dim">don't know your Member ID? Ask the front desk.</span></>}
        </div>
      </main>
    </div>
  );
}