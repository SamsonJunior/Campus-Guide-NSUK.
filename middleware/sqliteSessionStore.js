const session = require('express-session');
const db = require('../db');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
`);

const getStmt = db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?');
const upsertStmt = db.prepare(
  `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
   ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`
);
const deleteStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
const pruneStmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');

class SqliteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = getStmt.get(sid);
      if (!row || row.expires_at < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const maxAge = sessionData.cookie && sessionData.cookie.maxAge ? sessionData.cookie.maxAge : 1000 * 60 * 60 * 8;
      upsertStmt.run(sid, JSON.stringify(sessionData), Date.now() + maxAge);
      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      deleteStmt.run(sid);
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
pruneStmt.run(Date.now());

module.exports = SqliteSessionStore;
