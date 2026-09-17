// \u2022 HF-GMS \u00b7 crafted & signed by Saby \u00b7 keep this header
const express = require('express');
const crypto = require('crypto');
const dayjs = require('dayjs');
const db = require('../database/db');

const router = express.Router();

const SESSION_DAYS = 7;
const COOKIE_NAME = 'sfc_session';
const isProduction = process.env.NODE_ENV === 'production';

// ---- Password hashing (scrypt, no extra dependency needed) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) {
    return false;
  }
  try {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;

    const check = crypto.scryptSync(password, salt, 64).toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const checkBuf = Buffer.from(check, 'hex');

    if (hashBuf.length !== checkBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, checkBuf);
  } catch (err) {
    return false;
  }
}

async function createSession(userType, userId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = dayjs().add(SESSION_DAYS, 'day').format('YYYY-MM-DD HH:mm:ss');
  await db.run('INSERT INTO sessions (token, user_type, user_id, expires_at) VALUES (?, ?, ?, ?)',
    [token, userType, userId, expiresAt]);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', secure: isProduction, expires: new Date(expiresAt), path: '/',
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// =========================================================================
// STAFF (admin) auth — full access to the whole management app
// =========================================================================

// POST /api/auth/signup — for creating additional staff accounts
router.post('/signup', async (req, res) => {
  if (process.env.ALLOW_PUBLIC_STAFF_SIGNUP !== 'true') {
    return res.status(403).json({ error: 'Public staff signup is disabled. Ask an administrator to create your account.' });
  }
  const { full_name, email, phone, password } = req.body || {};
  if (!full_name || !email || !phone || !password) {
    return res.status(400).json({ error: 'Name, email, phone and password are all required' });
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await db.get('SELECT id FROM staff_users WHERE email = ?', [normalizedEmail]);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const password_hash = hashPassword(password);
  const info = await db.run(
    `INSERT INTO staff_users (full_name, username, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)`,
    [String(full_name).trim(), normalizedEmail, normalizedEmail, String(phone).trim(), password_hash]
  );

  await createSession('staff', info.lastInsertRowid, res);
  res.status(201).json({ user: { id: info.lastInsertRowid, full_name, email: normalizedEmail, phone } });
});

// POST /api/auth/login — admin/staff login (username or email + password)
router.post('/login', async (req, res) => {
  const { identifier, email, password } = req.body || {};
  const loginId = String(identifier || email || '').trim();
  if (!loginId || !password) {
    return res.status(400).json({ error: 'Email/username and password are required' });
  }
  const user = await db.get(
    'SELECT * FROM staff_users WHERE email = ? OR username = ?',
    [loginId, loginId]
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  await createSession('staff', user.id, res);
  res.json({ user: { id: user.id, full_name: user.full_name, email: user.email, phone: user.phone } });
});

// =========================================================================
// MEMBER auth
// =========================================================================

// POST /api/auth/member-login  — two accepted shapes:
//   { identifier, password }    username or email + password
//   { member_code, email, phone }  legacy portal login (no password)
router.post('/member-login', async (req, res) => {
  const { member_code, email, phone, identifier, password } = req.body || {};

  let member;
  if (password && (identifier || email)) {
    const loginId = String(identifier || email || '').trim();
    if (!loginId) {
      return res.status(400).json({ error: 'Username or email and password are required' });
    }
    member = await db.get(
      `SELECT * FROM members WHERE email = ? OR username = ?`,
      [loginId, loginId]
    );
    if (!member || !verifyPassword(password, member.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
  } else {
    if (!member_code || !email || !phone) {
      return res.status(400).json({ error: 'Member ID, email and phone number are all required' });
    }
    member = await db.get(
      `SELECT * FROM members WHERE member_code = ? AND email = ? AND phone = ?`,
      [String(member_code).trim(), String(email).trim(), String(phone).trim()]
    );
    if (!member) {
      return res.status(401).json({ error: 'No member found matching that ID, email and phone number' });
    }
  }
  if (member.status !== 'active') {
    return res.status(403).json({ error: 'This membership is not active. Contact the front desk.' });
  }

  await createSession('member', member.id, res);
  res.json({
    member: { id: member.id, member_code: member.member_code, full_name: member.full_name, email: member.email, phone: member.phone },
  });
});

// POST /api/auth/member-signup  { full_name, email, phone }  -> self-service member account
router.post('/member-signup', async (req, res) => {
  const { full_name, email, phone } = req.body || {};
  if (!full_name || !email || !phone) {
    return res.status(400).json({ error: 'Name, email and phone number are all required' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  const existing = await db.get(
    `SELECT 'member' AS role FROM members WHERE email = ?
     UNION ALL SELECT 'staff' AS role FROM staff_users WHERE email = ? LIMIT 1`,
    [normalizedEmail, normalizedEmail]
  );
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const maxId = await db.get('SELECT COALESCE(MAX(id), 0) AS max_id FROM members');
  const memberCode = `SFC${String(maxId.max_id + 1).padStart(4, '0')}`;
  const info = await db.run(
    `INSERT INTO members (member_code, full_name, username, phone, email, join_date, status)
     VALUES (?, ?, ?, ?, ?, CURDATE(), 'active')`,
    [memberCode, String(full_name).trim(), normalizedEmail, String(phone).trim(), normalizedEmail]
  );

  await createSession('member', info.lastInsertRowid, res);
  res.status(201).json({
    member: {
      id: info.lastInsertRowid, member_code: memberCode,
      full_name: String(full_name).trim(), email: normalizedEmail, phone: String(phone).trim(),
    },
    redirect: '/member-portal',
  });
});

// =========================================================================
// EMAIL OTP (one-time-password) login
// =========================================================================

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_SECONDS = 30;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/auth/request-otp  { email }  -> sends a 6-digit code
router.post('/request-otp', async (req, res) => {
  const rawEmail = String((req.body || {}).email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(rawEmail)) return res.status(400).json({ error: 'Enter a valid email address' });

  const [staff, member] = await Promise.all([
    db.get('SELECT * FROM staff_users WHERE email = ?', [rawEmail]),
    db.get('SELECT * FROM members WHERE email = ?', [rawEmail]),
  ]);
  if (!staff && !member) {
    return res.status(404).json({ error: 'No account found with that email. Ask the front desk or an administrator to create one.' });
  }

  const userType = staff ? 'staff' : 'member';
  const userId = staff ? staff.id : member.id;
  const otp = generateOtp();
  const expiresAt = dayjs().add(OTP_TTL_MINUTES, 'minute').format('YYYY-MM-DD HH:mm:ss');

  // Rate-limit resends: at least 30s between fresh codes for the same email.
  // Only UNUSED codes count, so a completed login doesn't block the next one.
  const recent = await db.get('SELECT created_at FROM otp_codes WHERE email = ? AND used = 0 ORDER BY id DESC LIMIT 1', [rawEmail]);
  if (recent) {
    const elapsed = dayjs().diff(dayjs(recent.created_at), 'second');
    if (elapsed < OTP_RESEND_SECONDS) {
      return res.status(429).json({ error: `Please wait ${Math.ceil(OTP_RESEND_SECONDS - elapsed)}s before requesting another code` });
    }
  }

  await db.run('UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0', [rawEmail]);
  await db.run('INSERT INTO otp_codes (email, user_type, user_id, otp, expires_at) VALUES (?, ?, ?, ?, ?)',
    [rawEmail, userType, userId, otp, expiresAt]);

  // No SMTP is bundled with this demo, so the code is printed to the server
  // console. In development it is also returned to the client so the whole
  // flow is testable without an email server.
  console.log(`[OTP] ${userType} ${rawEmail} -> ${otp} (expires in ${OTP_TTL_MINUTES} min)`);
  res.json({
    sent: true, email: rawEmail, resend_after: OTP_RESEND_SECONDS,
    dev_otp: process.env.NODE_ENV !== 'production' ? otp : undefined,
  });
});

// POST /api/auth/verify-otp  { email, otp }  -> logs in the matching account
router.post('/verify-otp', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const otp = String((req.body || {}).otp || '').trim();
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

  const row = await db.get(`
    SELECT * FROM otp_codes
    WHERE email = ? AND otp = ? AND used = 0 ORDER BY id DESC LIMIT 1`, [email, otp]);
  if (!row) return res.status(401).json({ error: 'Invalid or expired OTP. Request a new code.' });
  if (dayjs(row.expires_at).isBefore(dayjs())) return res.status(401).json({ error: 'This OTP has expired. Request a new code.' });

  await db.run('UPDATE otp_codes SET used = 1 WHERE id = ?', [row.id]);

  if (row.user_type === 'staff') {
    const user = await db.get('SELECT * FROM staff_users WHERE id = ?', [row.user_id]);
    if (!user) return res.status(404).json({ error: 'Account no longer exists' });
    await createSession('staff', user.id, res);
    return res.json({ user: { id: user.id, full_name: user.full_name, email: user.email, phone: user.phone }, redirect: '/dashboard' });
  }

  const member = await db.get('SELECT * FROM members WHERE id = ?', [row.user_id]);
  if (!member) return res.status(404).json({ error: 'Account no longer exists' });
  if (member.status !== 'active') return res.status(403).json({ error: 'This membership is not active. Contact the front desk.' });
  await createSession('member', member.id, res);
  res.json({
    member: { id: member.id, member_code: member.member_code, full_name: member.full_name, email: member.email, phone: member.phone },
    redirect: '/member-portal',
  });
});

// =========================================================================
// GOOGLE OAuth 2.0 login
// =========================================================================

const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_STATE_COOKIE = 'sfc_google_state';

function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL);
}

// GET /api/auth/google/config — lets the login screen show/enable the button
router.get('/google/config', (req, res) => {
  res.json({ configured: googleConfigured(), client_id: googleConfigured() ? process.env.GOOGLE_CLIENT_ID : undefined });
});

// GET /api/auth/google — starts the Google consent flow
router.get('/google', (req, res) => {
  if (!googleConfigured()) return res.status(503).json({ error: 'Google login is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL in the backend .env file.' });
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(GOOGLE_STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`${GOOGLE_OAUTH_URL}?${params.toString()}`);
});

// GET /api/auth/google/callback — exchanges the code and logs the user in
router.get('/google/callback', async (req, res) => {
  if (!googleConfigured()) return res.status(503).json({ error: 'Google login is not configured' });
  const { code, state, error: oauthError } = req.query;
  const cookieState = req.cookies && req.cookies[GOOGLE_STATE_COOKIE];
  res.clearCookie(GOOGLE_STATE_COOKIE);
  if (oauthError || !code) return res.redirect('/login?google=declined');
  if (!state || state !== cookieState) return res.redirect('/login?google=invalid');

  let tokenBody;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });
    tokenBody = await tokenRes.json();
    if (!tokenRes.ok || !tokenBody.access_token) throw new Error(tokenBody.error_description || `token error ${tokenRes.status}`);
  } catch (err) {
    console.error('Google token exchange failed:', err.message);
    return res.redirect('/login?google=failed');
  }

  let googleUser;
  try {
    const infoRes = await fetch(`${GOOGLE_USERINFO_URL}?alt=json`, { headers: { Authorization: `Bearer ${tokenBody.access_token}` } });
    googleUser = await infoRes.json();
    if (!infoRes.ok || !googleUser.email) throw new Error(`userinfo error ${infoRes.status}`);
  } catch (err) {
    console.error('Google userinfo failed:', err.message);
    return res.redirect('/login?google=failed');
  }

  const email = String(googleUser.email || '').trim().toLowerCase();
  const [staff, member] = await Promise.all([
    email ? db.get('SELECT * FROM staff_users WHERE email = ?', [email]) : Promise.resolve(null),
    email ? db.get('SELECT * FROM members WHERE email = ?', [email]) : Promise.resolve(null),
  ]);
  if (!staff && !member) {
    // "Sign up with Google": no existing account, so create a member account
    // from the Google profile and log them straight into their portal.
    const googleName = String(googleUser.name || googleUser.given_name || 'Gym Member').trim();
    const maxId = await db.get('SELECT COALESCE(MAX(id), 0) AS max_id FROM members');
    const memberCode = `SFC${String(maxId.max_id + 1).padStart(4, '0')}`;
    const info = await db.run(
      `INSERT INTO members (member_code, full_name, username, phone, email, join_date, status)
       VALUES (?, ?, ?, ?, ?, CURDATE(), 'active')`,
      [memberCode, googleName, email, '', email]
    );
    console.log(`[Google] Created member account ${memberCode} (${email}) via Google sign-up`);
    await createSession('member', info.lastInsertRowid, res);
    return res.redirect('/member-portal');
  }
  if (staff) {
    await createSession('staff', staff.id, res);
    return res.redirect('/dashboard');
  }
  if (member && member.status !== 'active') return res.redirect('/login?google=inactive');
  await createSession('member', member.id, res);
  res.redirect('/member-portal');
});

// =========================================================================
// Shared: logout, session check, middleware
// =========================================================================

router.post('/logout', async (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// GET /api/auth/me — used by pages to check who's logged in (staff or member)
router.get('/me', async (req, res) => {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Not logged in' });
  if (session.type === 'staff') {
    const u = session.record;
    return res.json({ type: 'staff', user: { id: u.id, full_name: u.full_name, email: u.email, phone: u.phone } });
  }
  const m = session.record;
  res.json({ type: 'member', member: { id: m.id, member_code: m.member_code, full_name: m.full_name, email: m.email, phone: m.phone } });
});

// ---- Resolve the logged-in session (staff or member) from the cookie ----
async function getSession(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  const session = await db.get('SELECT * FROM sessions WHERE token = ?', [token]);
  if (!session) return null;
  if (dayjs(session.expires_at).isBefore(dayjs())) {
    await db.run('DELETE FROM sessions WHERE token = ?', [token]);
    return null;
  }
  const table = session.user_type === 'staff' ? 'staff_users' : 'members';
  const record = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [session.user_id]);
  if (!record) return null;
  return { type: session.user_type, record };
}

// ---- Middleware: require a staff (admin) session ----
async function requireAuth(req, res, next) {
  const session = await getSession(req);
  if (!session || session.type !== 'staff') return res.status(401).json({ error: 'Login required' });
  req.user = session.record;
  next();
}

// ---- Middleware: require a member session ----
async function requireMemberAuth(req, res, next) {
  const session = await getSession(req);
  if (!session || session.type !== 'member') return res.status(401).json({ error: 'Login required' });
  req.member = session.record;
  next();
}

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireMemberAuth = requireMemberAuth;
module.exports.getSession = getSession;
module.exports.COOKIE_NAME = COOKIE_NAME;
