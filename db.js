// Uses sql.js — a pure WebAssembly build of SQLite with no native/compiled
// code and no dependency on any particular Node.js version. This avoids two
// separate classes of hosting failures: "no such built-in module: node:sqlite"
// on hosts running an older Node version, and native-binary crashes from
// packages like better-sqlite3 when their prebuilt binary doesn't match the
// host's exact platform/architecture.
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');

// DATA_DIR lets a host point this at a persistent disk (e.g. Render's mounted
// volume). Falls back to the local ./data folder for development.
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, 'campusguard.db');

// This object is exported immediately (synchronously), then populated with
// working methods once initialize() finishes. Route files that do
// `require('../db')` receive this same object reference, so once it's
// populated (before the server starts accepting requests) every route sees
// the working methods automatically.
const api = { ready: false };

function buildDatabase(SQL) {
  const existing = fs.existsSync(dbFile) ? fs.readFileSync(dbFile) : null;
  const sqlDb = existing ? new SQL.Database(existing) : new SQL.Database();

  function persist() {
    fs.writeFileSync(dbFile, Buffer.from(sqlDb.export()));
  }

  api.exec = (sql) => {
    sqlDb.run(sql);
    persist();
  };

  api.prepare = (sql) => ({
    run(...params) {
      const stmt = sqlDb.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
      const changes = sqlDb.getRowsModified();
      let lastInsertRowid;
      const idRes = sqlDb.exec('SELECT last_insert_rowid() AS id');
      if (idRes[0]) lastInsertRowid = idRes[0].values[0][0];
      persist();
      return { changes, lastInsertRowid };
    },
    get(...params) {
      const stmt = sqlDb.prepare(sql);
      stmt.bind(params);
      const hasRow = stmt.step();
      const row = hasRow ? stmt.getAsObject() : undefined;
      stmt.free();
      return row;
    },
    all(...params) {
      const stmt = sqlDb.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
  });
}

function runSchemaAndSeed() {
  api.exec(`
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
  `);

  const adminCount = api.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (adminCount === 0) {
    const hash = bcrypt.hashSync('Security#2026', 10);
    api.prepare(
      `INSERT INTO admins (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)`
    ).run('Campus Security Desk', 'security@nsuk.edu.ng', hash, 'security');
    console.log('Seeded default admin -> security@nsuk.edu.ng / Security#2026');
  }
}

async function initialize() {
  if (api.ready) return api;
  const wasmBinary = fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  buildDatabase(SQL);
  runSchemaAndSeed();
  api.ready = true;
  return api;
}

api.initialize = initialize;
module.exports = api;
