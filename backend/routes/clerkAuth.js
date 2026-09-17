const express = require('express');
const crypto = require('crypto');
const dayjs = require('dayjs');
const { createClerkClient, verifyToken } = require('@clerk/backend');
const db = require('../database/db');

const router = express.Router();

const SESSION_DAYS = 7;
const COOKIE_NAME = 'sfc_session';
const isProduction = process.env.NODE_ENV === 'production';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clerkConfigured() {
  return Boolean(process.env.CLERK_SECRET_KEY);
}

function client() {
  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
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

// GET /api/auth/clerk/config — tells the login screen whether to show Clerk buttons
router.get('/config', (req, res) => {
  res.json({ configured: clerkConfigured() });
});

// POST /api/auth/clerk  { token: <Clerk session JWT> }
// Verifies the Clerk session server-side, then links it to a staff or member
// account (matching by verified email) so the rest of the app keeps working
// with its own session cookie. If no account exists yet, a member account is
// auto-created — this is the "sign up with Google" path.
router.post('/', async (req, res) => {
  if (!clerkConfigured()) {
    return res.status(503).json({ error: 'Clerk is not configured. Add CLERK_SECRET_KEY to the backend .env file.' });
  }
  const sessionToken = String((req.body || {}).token || '').trim();
  if (!sessionToken) return res.status(400).json({ error: 'Missing sign-in token' });

  try {
    const verifyOptions = { secretKey: process.env.CLERK_SECRET_KEY };
    if (process.env.CLERK_DOMAIN) verifyOptions.issuer = process.env.CLERK_DOMAIN;
    const claims = await verifyToken(sessionToken, verifyOptions);
    const clerkUser = await client().users.getUser(claims.sub);
    const email = (clerkUser.primaryEmailAddress && clerkUser.primaryEmailAddress.emailAddress || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'That account has no email address to sign in with.' });
    }

    const [staff, member] = await Promise.all([
      db.get('SELECT * FROM staff_users WHERE email = ?', [email]),
      db.get('SELECT * FROM members WHERE email = ?', [email]),
    ]);

    // No existing account -> auto-create a member ("sign up with Google").
    if (!staff && !member) {
      const name = String(clerkUser.fullName || `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 'Gym Member').trim();
      const maxId = await db.get('SELECT COALESCE(MAX(id), 0) AS max_id FROM members');
      const memberCode = `SFC${String(maxId.max_id + 1).padStart(4, '0')}`;
      const info = await db.run(
        `INSERT INTO members (member_code, full_name, phone, email, join_date, status)
         VALUES (?, ?, ?, ?, CURDATE(), 'active')`,
        [memberCode, name, '', email]
      );
      console.log(`[Clerk] Created member ${memberCode} (${email}) via Clerk sign-up`);
      await createSession('member', info.lastInsertRowid, res);
      return res.json({
        member: { id: info.lastInsertRowid, member_code: memberCode, full_name: name, email },
        redirect: '/member-portal',
      });
    }

    if (staff) {
      await createSession('staff', staff.id, res);
      return res.json({ user: { id: staff.id, full_name: staff.full_name, email: staff.email, phone: staff.phone }, redirect: '/dashboard' });
    }

    if (member.status !== 'active') {
      return res.status(403).json({ error: 'This membership is not active. Contact the front desk.' });
    }
    await createSession('member', member.id, res);
    res.json({
      member: { id: member.id, member_code: member.member_code, full_name: member.full_name, email: member.email, phone: member.phone },
      redirect: '/member-portal',
    });
  } catch (err) {
    console.error('Clerk verification failed:', err.message);
    res.status(401).json({ error: 'Could not verify your sign-in. Please try again.' });
  }
});

module.exports = router;