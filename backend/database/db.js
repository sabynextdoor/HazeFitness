// MySQL implementation of database/schema.sql
// Run database/schema.sql on your MySQL server first (creates the
// `hazegym` database + all tables), then this file connects to it.
//
// Connection settings can be overridden with env vars:
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
// Defaults below match a local MySQL Workbench "Local instance MySQL80".

const mysql = require('mysql2/promise');
const crypto = require('crypto');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sarogym',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // return DATE/DATETIME columns as strings, like SQLite did
  // Many cloud MySQL providers (Aiven, PlanetScale, Railway, etc.) require
  // SSL. Set DB_SSL=true in your environment variables to enable it.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

// Without this listener, a dropped/reset connection (common on cloud DBs,
// idle timeouts, free-tier hosting) emits an 'error' event on the pool.
// An EventEmitter 'error' with no listener throws and crashes the whole
// Node process. This keeps the server alive — the next query just retries
// against a fresh connection from the pool.
pool.on('error', (err) => {
  console.error('MySQL pool error (connection recovered automatically):', err.message);
});

// ---------------------------------------------------------------------
// Thin async wrapper that mirrors the subset of the better-sqlite3 API
// this project's routes use: db.get / db.all / db.run / db.transaction.
// Keeping these names means the route files only need `.prepare(sql).x(...)`
// calls swapped for `await db.x(sql, [...])` rather than a full rewrite.
// ---------------------------------------------------------------------
const db = {
  async get(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows[0];
  },
  async all(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows;
  },
  async run(sql, params = []) {
    const [result] = await pool.query(sql, params);
    return { lastInsertRowid: result.insertId, changes: result.affectedRows };
  },
  // Runs fn(tx) inside a MySQL transaction on a dedicated connection.
  // tx exposes the same get/all/run shape as db itself.
  async transaction(fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const tx = {
        async get(sql, params = []) {
          const [rows] = await conn.query(sql, params);
          return rows[0];
        },
        async all(sql, params = []) {
          const [rows] = await conn.query(sql, params);
          return rows;
        },
        async run(sql, params = []) {
          const [result] = await conn.query(sql, params);
          return { lastInsertRowid: result.insertId, changes: result.affectedRows };
        },
      };
      const result = await fn(tx);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },
  pool,
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// ---- One-time seed data, run on boot (idempotent) ----
// NOTE: this assumes database/schema.sql has already been run against
// your MySQL server so the tables exist.
async function seed() {
  // Safe one-time upgrade for databases created before member photos existed.
  // `ADD COLUMN IF NOT EXISTS` is only available in newer MySQL releases, so
  // query INFORMATION_SCHEMA first for compatibility with MySQL 5.7 and older.
  const photoColumn = await db.get(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'members' AND COLUMN_NAME = 'photo_data'
  `);
  if (!photoColumn) await db.run('ALTER TABLE members ADD COLUMN photo_data LONGTEXT NULL');
  const staffUsernameColumn = await db.get(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_users' AND COLUMN_NAME = 'username'
  `);
  if (!staffUsernameColumn) await db.run('ALTER TABLE staff_users ADD COLUMN username VARCHAR(80) NULL');
  const memberUsernameColumn = await db.get(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'members' AND COLUMN_NAME = 'username'
  `);
  if (!memberUsernameColumn) await db.run('ALTER TABLE members ADD COLUMN username VARCHAR(80) NULL');
  const memberPasswordColumn = await db.get(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'members' AND COLUMN_NAME = 'password_hash'
  `);
  if (!memberPasswordColumn) await db.run('ALTER TABLE members ADD COLUMN password_hash VARCHAR(255) NULL');
  const trainerFeeColumn = await db.get(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subscriptions' AND COLUMN_NAME = 'trainer_fee'
  `);
  if (!trainerFeeColumn) await db.run('ALTER TABLE subscriptions ADD COLUMN trainer_fee DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total_fee');
  await db.run(`CREATE TABLE IF NOT EXISTS payment_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subscription_id INT NOT NULL, member_id INT NOT NULL, amount DECIMAL(10,2) NOT NULL,
    razorpay_order_id VARCHAR(80) NOT NULL UNIQUE, razorpay_payment_id VARCHAR(80) UNIQUE,
    status ENUM('created','paid','failed') NOT NULL DEFAULT 'created',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
    event_id VARCHAR(80) PRIMARY KEY, event_type VARCHAR(80) NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS member_progress (
    id INT AUTO_INCREMENT PRIMARY KEY, member_id INT NOT NULL, recorded_on DATE NOT NULL,
    weight_kg DECIMAL(5,2), height_cm DECIMAL(5,2), chest_cm DECIMAL(5,2),
    waist_cm DECIMAL(5,2), hips_cm DECIMAL(5,2), notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS trainer_assignment_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    trainer_id INT NULL,
    trainer_name VARCHAR(120) NULL,
    trainer_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
  )`);
  // One-time password logins (email OTP). Required for the OTP auth flow.
  await db.run(`CREATE TABLE IF NOT EXISTS otp_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(120) NOT NULL,
    user_type ENUM('staff','member') NOT NULL,
    user_id INT NOT NULL,
    otp VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_email (email)
  )`);
  const planCount = (await db.get('SELECT COUNT(*) AS c FROM plans')).c;
  if (planCount === 0) {
    await db.run(
      `INSERT INTO plans (name, duration_days, price, includes_trainer, description) VALUES (?, ?, ?, ?, ?)`,
      ['Monthly Plan', 30, 1000, 0, 'Standard monthly gym access']
    );
    await db.run(
      `INSERT INTO plans (name, duration_days, price, includes_trainer, description) VALUES (?, ?, ?, ?, ?)`,
      ['1-Year Offer Pack', 365, 8000, 1, 'Annual plan with dedicated personal trainer coaching']
    );
  }

  const posCount = (await db.get('SELECT COUNT(*) AS c FROM pos_products')).c;
  if (posCount === 0) {
    const products = [
      ['Water Bottle 1L', 'Beverage', 20, 100],
      ['Whey Protein Sachet', 'Supplement', 150, 50],
      ['Gym Gloves', 'Merchandise', 250, 30],
      ['Shaker Bottle', 'Merchandise', 180, 40],
    ];
    for (const p of products) {
      await db.run(`INSERT INTO pos_products (name, category, price, stock) VALUES (?, ?, ?, ?)`, p);
    }
  }

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || ADMIN_EMAIL.split('@')[0];
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD must be configured before initializing the admin account');
  }
  const adminExists = await db.get('SELECT id FROM staff_users WHERE email = ?', [ADMIN_EMAIL]);
  if (!adminExists) {
    await db.run(
      `INSERT INTO staff_users (full_name, username, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)`,
      ['Admin', ADMIN_USERNAME, ADMIN_EMAIL, '0000000000', hashPassword(ADMIN_PASSWORD)]
    );
  }

  // Demo members for a newly set-up gym. Use a stable email as the lookup so
  // restarting the server never creates duplicate sample records.
  const today = new Date();
  const joinDate = today.toISOString().slice(0, 10);
  const dobForAge = (age) => {
    const dob = new Date(today);
    dob.setFullYear(dob.getFullYear() - age);
    return dob.toISOString().slice(0, 10);
  };
  const sampleMembers = [
    ['SELVA GANAPATHY', '9000000001', 'sample.selva.ganapathy@sarogym.example', 21],
    ['SRIDHARAN', '9000000002', '9000000002@sarogym.example', 19],
    ['SESU ANTONY', '9000000003', '9000000003@sarogym.example', 21],
    ['SANTHOSH KUMAR', '9000000004', '9000000004@sarogym.example', 19],
    ['SRI PARAMESH', '9000000005', '9000000005@sarogym.example', 21],
    ['SREE VENKATRAM', '9000000006', '9000000006@sarogym.example', 19],
    ['SELVAM', '9000000007', '9000000007@sarogym.example', 21],
    ['SOBAN', '9000000008', '9000000008@sarogym.example', 19],
    ['SANTOSH', '9000000009', '9000000009@sarogym.example', 21],
    ['SATHISH KUMAR', '9000000010', '9000000010@sarogym.example', 19],
  ];
  for (const [fullName, phone, email, age] of sampleMembers) {
    const existing = await db.get('SELECT id FROM members WHERE email = ?', [email]);
    if (existing) continue;
    const result = await db.run(`
      INSERT INTO members (member_code, full_name, gender, dob, phone, email, join_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ['TEMP', fullName, 'male', dobForAge(age), phone, email, joinDate, 'active']);
    const memberCode = 'SFC' + String(result.lastInsertRowid).padStart(4, '0');
    await db.run('UPDATE members SET member_code = ? WHERE id = ?', [memberCode, result.lastInsertRowid]);
  }
}

seed().catch((err) => {
  console.error('Seed failed — is database/schema.sql set up on your MySQL server?', err.message);
});

module.exports = db;
