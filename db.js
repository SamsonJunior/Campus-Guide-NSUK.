// Uses Turso (libSQL) — a cloud-hosted SQLite database — instead of a local
// file. This is what makes student accounts and alerts survive server
// restarts and redeploys: Render's free-tier disk is wiped on every restart,
// but the Turso database lives outside that container entirely.
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');

const url = (process.env.TURSO_DATABASE_URL || '').trim();
const authToken = (process.env.TURSO_AUTH_TOKEN || '').trim();

if (!url || !authToken) {
  throw new Error(
    'Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables. ' +
    'Set them (e.g. in Render\u2019s Environment tab) before starting the server.'
  );
}

// Helpful, non-sensitive startup diagnostics: prints the URL in full (it's
// not a secret) and only the length of the token (never the token itself),
// so a bad copy/paste shows up immediately in Render's logs instead of a
// cryptic parser error.
console.log(`Connecting to Turso database: ${url} (auth token length: ${authToken.length})`);

const client = createClient({ url, authToken });

// This object is exported immediately (synchronously), then populated with
// working methods once initialize() finishes. Route files that do
// `require('../db')` receive this same object reference, so once it's
// populated (before the server starts accepting requests) every route sees
// the working methods automatically. Every method is now async, since Turso
// is a remote database reached over the network.
const api = { ready: false };

api.exec = async (sql) => {
  await client.executeMultiple(sql);
};

api.prepare = (sql) => ({
  async run(...params) {
    const result = await client.execute({ sql, args: params });
    return {
      changes: result.rowsAffected,
      lastInsertRowid: result.lastInsertRowid !== undefined ? Number(result.lastInsertRowid) : undefined,
    };
  },
  async get(...params) {
    const result = await client.execute({ sql, args: params });
    return result.rows[0];
  },
  async all(...params) {
    const result = await client.execute({ sql, args: params });
    return result.rows;
  },
});

async function runSchemaAndSeed() {
  await api.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      matric_number TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      department TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'security',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      category TEXT NOT NULL DEFAULT 'general',
      note TEXT,
      latitude REAL,
      longitude REAL,
      accuracy REAL,
      location_captured INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_by INTEGER REFERENCES admins(id),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id INTEGER NOT NULL REFERENCES alerts(id),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id),
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
  `);

  const adminCount = (await api.prepare('SELECT COUNT(*) AS c FROM admins').get()).c;
  if (adminCount === 0) {
    const hash = bcrypt.hashSync('Security#2026', 10);
    await api.prepare(
      `INSERT INTO admins (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)`
    ).run('Campus Security Desk', 'security@nsuk.edu.ng', hash, 'security');
    console.log('Seeded default admin -> security@nsuk.edu.ng / Security#2026');
  }
}

async function initialize() {
  if (api.ready) return api;
  await runSchemaAndSeed();
  api.ready = true;
  return api;
}

api.initialize = initialize;
module.exports = api;
