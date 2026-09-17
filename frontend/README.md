# Haze Fitness — React Frontend

Vite + React app with one component per page and shared layout/UI pieces split
out separately.

## Structure
```
src/
  api.js              -> fetch wrapper (auth, error handling)
  utils.js             -> money(), fmtDate() formatters
  toast.js              -> toast notifications
  style.css              -> design system
  components/
    Layout.jsx           -> sidebar + nav, wraps all admin pages
    Modal.jsx            -> reusable modal shell
    StatusBadge.jsx       -> status pill
  pages/
    Login.jsx, Signup.jsx
    Dashboard.jsx
    Members.jsx, MemberProfile.jsx
    Trainers.jsx
    Fees.jsx
    Attendance.jsx
    Classes.jsx
    WorkoutDiet.jsx
    Pos.jsx
    Announcements.jsx
    Reports.jsx
    MemberPortal.jsx     -> standalone layout (member-facing, no admin sidebar)
```

## Run locally

1. Make sure the backend (Express, port 4000) is running.
2. In this folder:
   ```
   npm install
   npm run dev
   ```
3. Open http://localhost:3000 — API calls to `/api/*` are proxied to `http://localhost:4000` automatically (see `vite.config.js`).

If your backend runs on a different port/host, set `VITE_BACKEND_URL` in a `.env` file (see `.env.example`).

## Build for production
```
npm run build
```
Outputs static files to `dist/`. Serve `dist/` from the Express backend (or
any static host) instead of the dev server.