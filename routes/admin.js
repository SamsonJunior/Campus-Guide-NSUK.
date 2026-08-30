const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin, redirectIfAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/login', redirectIfAdmin, (req, res) => {
  res.render('admin-login', { error: null, email: '', next: req.query.next || '' });
});

router.post('/login', redirectIfAdmin, (req, res) => {
  const { email, password, next } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get((email || '').trim().toLowerCase());

  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).render('admin-login', { error: 'Incorrect email or password.', email, next: next || '' });
  }

  req.session.adminId = admin.id;
  res.redirect(next && next.startsWith('/admin') ? next : '/admin/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.adminId = null;
  res.redirect('/admin/login');
});

router.get('/dashboard', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  const counts = db
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) AS acknowledged,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        COUNT(*) AS total
       FROM alerts`
    )
    .get();
  const recent = db
    .prepare(
      `SELECT alerts.*, students.full_name, students.matric_number
       FROM alerts JOIN students ON students.id = alerts.student_id
       ORDER BY alerts.created_at DESC LIMIT 8`
    )
    .all();
  res.render('admin-dashboard', { admin, counts, recent });
});

router.get('/alerts', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  const statusFilter = ['pending', 'acknowledged', 'resolved'].includes(req.query.status) ? req.query.status : null;

  const alerts = statusFilter
    ? db
        .prepare(
          `SELECT alerts.*, students.full_name, students.matric_number, students.phone
           FROM alerts JOIN students ON students.id = alerts.student_id
           WHERE alerts.status = ?
           ORDER BY alerts.created_at DESC`
        )
        .all(statusFilter)
    : db
        .prepare(
          `SELECT alerts.*, students.full_name, students.matric_number, students.phone
           FROM alerts JOIN students ON students.id = alerts.student_id
           ORDER BY alerts.created_at DESC`
        )
        .all();

  res.render('admin-alerts', { admin, alerts, statusFilter });
});

router.get('/alerts/:id', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  const alert = db
    .prepare(
      `SELECT alerts.*, students.full_name, students.matric_number, students.email, students.phone, students.department
       FROM alerts JOIN students ON students.id = alerts.student_id
       WHERE alerts.id = ?`
    )
    .get(req.params.id);

  if (!alert) return res.redirect('/admin/alerts');

  const events = db
    .prepare('SELECT * FROM alert_events WHERE alert_id = ? ORDER BY created_at ASC')
    .all(alert.id);

  res.render('admin-alert-detail', { admin, alert, events });
});

router.post('/alerts/:id/status', requireAdmin, (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
  if (!alert) return res.redirect('/admin/alerts');

  const status = ['pending', 'acknowledged', 'resolved'].includes(req.body.status) ? req.body.status : alert.status;

  db.prepare(
    `UPDATE alerts SET status = ?, updated_at = datetime('now'),
     resolved_by = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_by END,
     resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE resolved_at END
     WHERE id = ?`
  ).run(status, status, admin.id, status, alert.id);

  db.prepare(`INSERT INTO alert_events (alert_id, actor, action) VALUES (?, ?, ?)`).run(
    alert.id,
    admin.full_name,
    `Status changed to ${status}`
  );

  res.redirect(`/admin/alerts/${alert.id}`);
});

module.exports = router;
