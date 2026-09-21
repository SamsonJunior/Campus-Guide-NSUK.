const session = require('express-session');
const db = require('../db');

// The sessions table itself is created in db.js's shared schema, since it
// now runs as part of the single async initialize() step (Turso is remote,
// so table creation can't happen synchronously at module-load time here).

const getStmt = db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?');
const upsertStmt = db.prepare(
  `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
   ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`
);
const deleteStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
const pruneStmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');

class SqliteSessionStore extends session.Store {
  async get(sid, callback) {
    try {
      const row = await getStmt.get(sid);
      if (!row || row.expires_at < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  async set(sid, sessionData, callback) {
    try {
      const maxAge = sessionData.cookie && sessionData.cookie.maxAge ? sessionData.cookie.maxAge : 1000 * 60 * 60 * 8;
      await upsertStmt.run(sid, JSON.stringify(sessionData), Date.now() + maxAge);
      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await deleteStmt.run(sid);
      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }
}

// Clear out expired sessions once on startup so the table doesn't grow forever.
pruneStmt.run(Date.now()).catch((err) => console.error('Failed to prune sessions:', err));

module.exports = SqliteSessionStore;
