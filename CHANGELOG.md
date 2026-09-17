# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-09-17

### Added

- **Authentication** — staff and member logins with separate HTTP-only cookie
  sessions, email OTP sign-in, and optional Google OAuth (Clerk).
- **Dashboard** — live KPIs for active members, attendance and monthly collection.
- **Members** — directory with search/filters, rich profiles, progress tracking
  and trainer assignment.
- **Trainers** — trainer management and member↔trainer assignment.
- **Fees & Payments** — fee plans and offers, subscriptions with generated
  `balance_due` / `payment_status`, manual payments (Cash / UPI / Card / Other),
  printable receipts and WhatsApp reminders.
- **Razorpay online payments** — Checkout integration with server-side signature
  verification, webhook support, and a safe built-in demo mode.
- **Attendance** — check-in / check-out with QR code scanning and streak tracking.
- **Classes & slots** — scheduling with capacity, plus member bookings.
- **Workout & diet plans** — per-member routine and nutrition plan builder.
- **Point of sale** — products and sales for supplements and merchandise.
- **Reports** — members status, monthly collection, pending dues, attendance
  trend and peak attendance, with JSON/CSV export.
- **Member portal** — self-service membership, dues, payments, bookings, plans
  and announcements.
- **Deployment** — multi-stage `Dockerfile`, `docker-compose.yml`, and a GitHub
  Actions workflow publishing the image to GitHub Container Registry.
- **Documentation** — detailed README with screenshots, API reference, security
  policy and contributor templates.

[1.0.0]: https://github.com/sabynextdoor/HazeFitness/releases/tag/v1.0.0
