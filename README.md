# Haze Fitness — Gym Management System

Haze Fitness is a full-stack gym management system: Express + MySQL backend and
a Vite + React frontend. Built from scratch for my gym.

## Structure
```
backend/     -> Express API (port 4000), MySQL via mysql2
database/    -> schema.sql (MySQL schema)
frontend/    -> Vite + React app (development on port 3000)
```

## Features
- Staff/admin dashboard with live stats
- Member management, profiles, subscriptions and fee tracking
- Trainer management and plan assignment
- Attendance check-in/out (member ID or QR scan)
- Class & slot scheduling with member bookings
- Workout & diet plan tracking
- POS (point of sale) for supplements and merchandise
- Reports with JSON/CSV export
- Member self-service portal
- **Online payments via Razorpay** (UPI / cards) with a built-in demo mode
- Email OTP + username/password login for staff and members
- Google OAuth option (add keys to enable)

## Setup

### 1. Database
Start MariaDB/MySQL (e.g. `docker run --name gym-mysql -e MYSQL_ROOT_PASSWORD=rootpass123 -p 3306:3306 -d mysql:8`) and run `database/schema.sql` against it:
```
mysql -uroot -prootpass123 < database/schema.sql
```

### 2. Backend
```
cd backend
npm install
cp .env.example .env      # then fill in your real DB password etc.
npm start
```
Runs on http://localhost:4000. The default login is:
```
username: hazeadmin
password: Haze@12345
```
(Change the password in `.env` before going live. The same credentials are
also created for a member account so you can try both portals.)

### 3. Frontend (development)
```
cd frontend
npm install
npm run dev
```
Runs on http://localhost:3000, proxying `/api` calls to the backend on port 4000.

### 4. Frontend (production build, served by the backend)
```
cd frontend
npm run build
```
This creates `frontend/dist/`. The backend (`server.js`) serves that folder as
static files with a fallback to `index.html` for client-side routes — so once
built, just running the backend alone serves the whole app at
http://localhost:4000.

## Razorpay online payments
1. Get test/live keys from https://dashboard.razorpay.com
2. Put them in `backend/.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxx
   RAZORPAY_KEY_SECRET=xxxx
   RAZORPAY_WEBHOOK_SECRET=xxxx
   ```
3. In the member portal, a member with a balance can click **Pay Online** to
   pay via Razorpay Checkout (UPI/card/etc.). Without keys, the app runs in a
   safe demo mode that lets you record a mock payment so the flow is testable.