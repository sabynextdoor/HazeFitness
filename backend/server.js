require('dotenv').config();
require('express-async-errors');
const express = require('express');

// Last-resort safety nets: log and keep running instead of crashing the
// whole process on an unexpected error (e.g. a transient DB hiccup).
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection (server kept running):', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept running):', err);
});
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const auth = require('./routes/auth');
const { requireAuth, requireMemberAuth, getSession } = auth;

const app = express();
const PORT = process.env.PORT || 4000;
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:4000')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
const loginAttempts = new Map();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // The staff attendance page uses the device camera to scan member QR codes.
  // Permit it for this origin while keeping microphone and location disabled.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use('/api/razorpay/webhook', express.raw({ type: 'application/json' }), require('./routes/razorpayWebhook'));
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());

// Limits password and member-login guesses without adding a dependency.
app.use('/api/auth', (req, res, next) => {
  if (!['/login', '/member-login', '/signup'].includes(req.path)) return next();
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { count: 0, startedAt: now };
  if (now - attempt.startedAt > 15 * 60 * 1000) { attempt.count = 0; attempt.startedAt = now; }
  attempt.count += 1;
  loginAttempts.set(key, attempt);
  if (attempt.count > 10) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  next();
});

// ---- Auth routes (no login required to reach these) ----
app.use('/api/auth/clerk', require('./routes/clerkAuth'));
app.use('/api/auth', auth);

// ---- Staff (admin) API routes — full access ----
app.use('/api/dashboard', requireAuth, require('./routes/dashboard'));
app.use('/api/members', requireAuth, require('./routes/members'));
app.use('/api/trainers', requireAuth, require('./routes/trainers'));
app.use('/api/plans', requireAuth, require('./routes/plans'));
app.use('/api/fees', requireAuth, require('./routes/fees'));
app.use('/api/attendance', requireAuth, require('./routes/attendance'));
app.use('/api/classes', requireAuth, require('./routes/classes'));
app.use('/api/fitness-plans', requireAuth, require('./routes/plansFitness')); // workout + diet plans
app.use('/api/pos', requireAuth, require('./routes/pos'));
app.use('/api/reports', requireAuth, require('./routes/reports'));
app.use('/api/announcements', requireAuth, require('./routes/announcements'));

// ---- Member self-service API routes — own data only ----
app.use('/api/portal', requireMemberAuth, require('./routes/memberPortal'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ---- Serve frontend (static HTML/CSS/JS) ----
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'dist');
const PUBLIC_PAGES = new Set(['/login.html', '/signup.html']);
const MEMBER_PAGES = new Set(['/member-portal.html']);

// Gate every HTML page by session type:
//  - login.html / signup.html: always reachable
//  - member-portal.html: needs a MEMBER session
//  - everything else (dashboard, members, fees, ...): needs a STAFF session
//  - "/" sends staff to the dashboard and members to their portal
// (The actual data is protected server-side via requireAuth/requireMemberAuth
// on the API routes above — this page-level gate just avoids showing someone
// a screen they'd immediately get 401s on.)
app.get(/^\/(?:[a-zA-Z0-9_-]+\.html)?$/, async (req, res, next) => {
  if (PUBLIC_PAGES.has(req.path)) return next();

  const session = await getSession(req);

  if (req.path === '/') {
    if (session && session.type === 'member') return res.redirect('/member-portal.html');
    if (session && session.type === 'staff') return next(); // falls through to dashboard.html below
    return res.redirect('/login.html');
  }

  if (MEMBER_PAGES.has(req.path)) {
    if (!session || session.type !== 'member') return res.redirect('/login.html');
    return next();
  }

  // staff-only page
  if (!session || session.type !== 'staff') return res.redirect('/login.html');
  next();
});

app.use(express.static(FRONTEND_DIR));
// React Router client-side routing: serve index.html for any non-API, non-static route
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Haze Fitness GMS running at http://localhost:${PORT}`);
});
