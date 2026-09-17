// reset-admin.js
// Run this from inside your backend folder:
//   node reset-admin.js
//
// It forcibly sets the admin account's password, whether or not the
// account already exists — so there's no ambiguity left about what's
// stored in the database.

const mysql = require('mysql2/promise');
const crypto = require('crypto');

require('dotenv').config();
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  if (!EMAIL || !PASSWORD || PASSWORD.length < 8) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 8 characters in .env before running this script');
  }
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sarogym',
  });

  const [rows] = await conn.query('SELECT id, email FROM staff_users WHERE email = ?', [EMAIL]);
  const password_hash = hashPassword(PASSWORD);

  if (rows.length > 0) {
    await conn.query('UPDATE staff_users SET password_hash = ? WHERE email = ?', [password_hash, EMAIL]);
    console.log(`Updated existing admin (id=${rows[0].id}) with a fresh password hash.`);
  } else {
    await conn.query(
      `INSERT INTO staff_users (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)`,
      ['Admin', EMAIL, '0000000000', password_hash]
    );
    console.log('No admin row existed — created a new one.');
  }

  console.log(`Login now with:\n  email: ${EMAIL}\n  password: ${PASSWORD}`);
  await conn.end();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
