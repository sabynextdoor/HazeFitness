-- ============================================================
-- Haze Fitness — Gym Management System
-- MySQL 8.x schema (production). For the runnable demo in this
-- project, backend/database/db.js creates the equivalent schema
-- in MySQL automatically. Use this file when deploying to MySQL.
-- ============================================================

CREATE DATABASE IF NOT EXISTS sarogym
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sarogym;

-- ---------- STAFF (ADMIN) ACCOUNTS & AUTH SESSIONS ----------
CREATE TABLE staff_users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(80),                  -- optional login name (username or email)
  full_name       VARCHAR(120) NOT NULL,
  email           VARCHAR(120) NOT NULL UNIQUE,
  phone           VARCHAR(20)  NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,       -- scrypt salt:hash
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per logged-in session, for both staff and self-service members.
-- user_id points into staff_users when user_type='staff', or members when
-- user_type='member' (no FK across both tables — enforced in app code).
CREATE TABLE sessions (
  token           VARCHAR(64) PRIMARY KEY,
  user_type       ENUM('staff','member') NOT NULL,
  user_id         INT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      TIMESTAMP NOT NULL
);

-- ---------- EMAIL OTP (one-time password login) ----------
CREATE TABLE otp_codes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(120) NOT NULL,
  user_type       ENUM('staff','member') NOT NULL,
  user_id         INT NOT NULL,
  otp             VARCHAR(6) NOT NULL,
  expires_at      TIMESTAMP NOT NULL,
  used            TINYINT(1) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_email (email)
);

-- ---------- STAFF / TRAINERS ----------
CREATE TABLE trainers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  full_name       VARCHAR(120) NOT NULL,
  phone           VARCHAR(20)  NOT NULL,
  email           VARCHAR(120),
  specialization  VARCHAR(120),          -- e.g. Strength, Yoga, Zumba
  schedule_notes  VARCHAR(255),          -- free text weekly schedule summary
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- MEMBERSHIP PLANS ----------
CREATE TABLE plans (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  duration_days   INT NOT NULL,
  price           DECIMAL(10,2) NOT NULL,
  includes_trainer TINYINT(1) NOT NULL DEFAULT 0,
  description     VARCHAR(255)
);

INSERT INTO plans (name, duration_days, price, includes_trainer, description) VALUES
 ('Monthly Plan', 30,  1000.00, 0, 'Standard monthly gym access'),
 ('1-Year Offer Pack', 365, 8000.00, 1, 'Annual plan with dedicated personal trainer coaching');

-- NOTE: the pre-seeded admin account (username hazeadmin / Haze@12345) is created
-- automatically by backend/database/db.js using Node's crypto.scryptSync,
-- which MySQL has no equivalent function for. To seed it here, run the app
-- once against SQLite (creates the hash), copy the password_hash value from
-- the SQLite staff_users table, and INSERT it into MySQL's staff_users.

-- ---------- MEMBERS ----------
CREATE TABLE members (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  member_code     VARCHAR(20) NOT NULL UNIQUE,   -- e.g. SFC0001
  username        VARCHAR(80),                  -- optional login name (username or email)
  full_name       VARCHAR(120) NOT NULL,
  gender          ENUM('male','female','other'),
  dob             DATE,
  phone           VARCHAR(20) NOT NULL,
  email           VARCHAR(120) NOT NULL,        -- required: used with member_code + phone for portal login
  password_hash   VARCHAR(255),                 -- optional scrypt hash for username/email + password login
  address         VARCHAR(255),
  fitness_goal    VARCHAR(255),
  emergency_contact_name  VARCHAR(120),
  emergency_contact_phone VARCHAR(20),
  join_date       DATE NOT NULL,
  trainer_id      INT,
  status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  photo_data      LONGTEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
);

CREATE TABLE trainer_assignment_history (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  member_id       INT NOT NULL,
  trainer_id      INT NULL,
  trainer_name    VARCHAR(120) NULL,
  trainer_fee     DECIMAL(10,2) NOT NULL DEFAULT 0,
  assigned_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
);

-- ---------- SUBSCRIPTIONS (a member's plan + manual fee tracking) ----------
CREATE TABLE subscriptions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  member_id       INT NOT NULL,
  plan_id         INT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  total_fee       DECIMAL(10,2) NOT NULL,
  trainer_fee     DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_paid     DECIMAL(10,2) NOT NULL DEFAULT 0,
  balance_due     DECIMAL(10,2) GENERATED ALWAYS AS (total_fee - amount_paid) STORED,
  payment_status  VARCHAR(20) GENERATED ALWAYS AS (
                     CASE
                       WHEN amount_paid <= 0 THEN 'Unpaid'
                       WHEN total_fee - amount_paid <= 0 THEN 'Paid'
                       ELSE 'Partially Paid'
                     END
                   ) STORED,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- ---------- PAYMENTS (each manual payment/receipt event) ----------
CREATE TABLE payments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  subscription_id INT NOT NULL,
  member_id       INT NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  payment_mode    ENUM('cash','upi','card','other') NOT NULL DEFAULT 'cash',
  payment_date    DATE NOT NULL,
  receipt_no      VARCHAR(30) NOT NULL UNIQUE,
  note            VARCHAR(255),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

-- ---------- ONLINE PAYMENT GATEWAY (Razorpay) ----------
CREATE TABLE payment_orders (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  subscription_id     INT NOT NULL,
  member_id           INT NOT NULL,
  amount              DECIMAL(10,2) NOT NULL,
  razorpay_order_id   VARCHAR(80) NOT NULL UNIQUE,
  razorpay_payment_id VARCHAR(80) UNIQUE,
  status              ENUM('created','paid','failed') NOT NULL DEFAULT 'created',
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE razorpay_webhook_events (
  event_id    VARCHAR(80) PRIMARY KEY,
  event_type  VARCHAR(80) NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- ATTENDANCE ----------
CREATE TABLE attendance (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  member_id       INT NOT NULL,
  attendance_date DATE NOT NULL,
  check_in        DATETIME,
  check_out       DATETIME,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- ---------- CLASSES / SLOT SCHEDULING ----------
CREATE TABLE classes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,     -- e.g. "Morning Yoga"
  trainer_id      INT,
  slot_time       VARCHAR(50) NOT NULL,      -- e.g. "06:00-07:00"
  days_of_week    VARCHAR(50) NOT NULL,      -- e.g. "Mon,Wed,Fri"
  capacity        INT NOT NULL DEFAULT 20,
  FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
);

CREATE TABLE class_bookings (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  class_id        INT NOT NULL,
  member_id       INT NOT NULL,
  booking_date    DATE NOT NULL,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_booking (class_id, member_id, booking_date)
);

-- ---------- DIET & WORKOUT PLANS ----------
CREATE TABLE workout_plans (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  member_id       INT NOT NULL,
  trainer_id      INT,
  title           VARCHAR(150) NOT NULL,
  details         TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
);

CREATE TABLE diet_plans (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  member_id       INT NOT NULL,
  trainer_id      INT,
  title           VARCHAR(150) NOT NULL,
  details         TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
);

-- ---------- MEMBER PROGRESS ----------
CREATE TABLE member_progress (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  member_id       INT NOT NULL,
  recorded_on     DATE NOT NULL,
  weight_kg       DECIMAL(5,2),
  height_cm       DECIMAL(5,2),
  chest_cm        DECIMAL(5,2),
  waist_cm        DECIMAL(5,2),
  hips_cm         DECIMAL(5,2),
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- ---------- POS (supplements / merchandise) ----------
CREATE TABLE pos_products (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  category        VARCHAR(80),
  price           DECIMAL(10,2) NOT NULL,
  stock           INT NOT NULL DEFAULT 0
);

CREATE TABLE pos_sales (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  sale_date       DATE NOT NULL,
  member_id       INT,                       -- nullable: walk-in sale
  total_amount    DECIMAL(10,2) NOT NULL,
  payment_mode    ENUM('cash','upi','card') NOT NULL DEFAULT 'cash',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE pos_sale_items (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  sale_id         INT NOT NULL,
  product_id      INT NOT NULL,
  qty             INT NOT NULL,
  unit_price      DECIMAL(10,2) NOT NULL,
  subtotal        DECIMAL(10,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  FOREIGN KEY (sale_id) REFERENCES pos_sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES pos_products(id)
);

-- ---------- ANNOUNCEMENTS (admin → member info board) ----------
CREATE TABLE announcements (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(200) NOT NULL,
  message         TEXT NOT NULL,
  created_by      INT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES staff_users(id) ON DELETE SET NULL
);

-- ---------- USEFUL INDEXES ----------
CREATE INDEX idx_members_status ON members(status);
CREATE INDEX idx_subscriptions_member ON subscriptions(member_id);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX idx_attendance_date ON attendance(attendance_date);
CREATE INDEX idx_payments_date ON payments(payment_date);
CREATE INDEX idx_payment_orders_subscription ON payment_orders(subscription_id);
CREATE INDEX idx_announcements_created_at ON announcements(created_at);
