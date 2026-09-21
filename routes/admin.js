const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin, redirectIfAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/login', redirectIfAdmin, (req, res) => {
  res.render('admin-login', { error: null, email: '', next: req.query.next || '' });
});

router.post('/login', redirectIfAdmin, async (req, res, next) => {
  try {
    const { email, password, next: nextUrl } = req.body;
    const admin = await db.prepare('SELECT * FROM admins WHERE email = ?').get((email || '').trim().toLowerCase());

    if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
      return res.status(401).render('admin-login', { error: 'Incorrect email or password.', email, next: nextUrl || '' });
    }

    req.session.adminId = admin.id;
    res.redirect(nextUrl && nextUrl.startsWith('/admin') ? nextUrl : '/admin/dashboard');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.adminId = null;
  res.redirect('/admin/login');
});

router.get('/dashboard', requireAdmin, async (req, res, next) => {
  try {
    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
    const counts = await db
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) AS acknowledged,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
          COUNT(*) AS total
         FROM alerts`
      )
      .get();
    const recent = await db
      .prepare(
        `SELECT alerts.*, students.full_name, students.matric_number
         FROM alerts JOIN students ON students.id = alerts.student_id
         ORDER BY alerts.created_at DESC LIMIT 8`
      )
      .all();
    res.render('admin-dashboard', { admin, counts, recent });
  } catch (err) {
    next(err);
  }
});

router.get('/alerts', requireAdmin, async (req, res, next) => {
  try {
    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
    const statusFilter = ['pending', 'acknowledged', 'resolved'].includes(req.query.status) ? req.query.status : null;

    const alerts = statusFilter
      ? await db
          .prepare(
            `SELECT alerts.*, students.full_name, students.matric_number, students.phone
             FROM alerts JOIN students ON students.id = alerts.student_id
             WHERE alerts.status = ?
             ORDER BY alerts.created_at DESC`
          )
          .all(statusFilter)
      : await db
          .prepare(
            `SELECT alerts.*, students.full_name, students.matric_number, students.phone
             FROM alerts JOIN students ON students.id = alerts.student_id
             ORDER BY alerts.created_at DESC`
          )
          .all();

    res.render('admin-alerts', { admin, alerts, statusFilter });
  } catch (err) {
    next(err);
  }
});

router.get('/alerts/:id', requireAdmin, async (req, res, next) => {
  try {
    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
    const alert = await db
      .prepare(
        `SELECT alerts.*, students.full_name, students.matric_number, students.email, students.phone, students.department
         FROM alerts JOIN students ON students.id = alerts.student_id
         WHERE alerts.id = ?`
      )
      .get(req.params.id);

    if (!alert) return res.redirect('/admin/alerts');

    const events = await db
      .prepare('SELECT * FROM alert_events WHERE alert_id = ? ORDER BY created_at ASC')
      .all(alert.id);

    res.render('admin-alert-detail', { admin, alert, events });
  } catch (err) {
    next(err);
  }
});

router.post('/alerts/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const admin = await db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
    const alert = await db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) return res.redirect('/admin/alerts');

    const status = ['pending', 'acknowledged', 'resolved'].includes(req.body.status) ? req.body.status : alert.status;

    await db.prepare(
      `UPDATE alerts SET status = ?, updated_at = datetime('now'),
       resolved_by = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_by END,
       resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE resolved_at END
       WHERE id = ?`
    ).run(status, status, admin.id, status, alert.id);

    await db.prepare(`INSERT INTO alert_events (alert_id, actor, action) VALUES (?, ?, ?)`).run(
      alert.id,
      admin.full_name,
      `Status changed to ${status}`
    );

    res.redirect(`/admin/alerts/${alert.id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/alerts/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const alert = await db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) return res.redirect('/admin/alerts');

    await db.prepare('DELETE FROM alert_events WHERE alert_id = ?').run(alert.id);
    await db.prepare('DELETE FROM alerts WHERE id = ?').run(alert.id);

    res.redirect('/admin/alerts');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
