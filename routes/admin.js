const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { requireAdmin, redirectIfAdmin } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../lib/mailer');

const router = express.Router();

router.get('/login', redirectIfAdmin, (req, res) => {
  res.render('admin-login', { error: null, email: '', next: req.query.next || '', resetSuccess: false });
});

router.post('/login', redirectIfAdmin, async (req, res, next) => {
  try {
    const { email, password, next: nextUrl } = req.body;
    const admin = await db.prepare('SELECT * FROM admins WHERE email = ?').get((email || '').trim().toLowerCase());

    if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
      return res.status(401).render('admin-login', { error: 'Incorrect email or password.', email, next: nextUrl || '', resetSuccess: false });
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

router.get('/forgot-password', redirectIfAdmin, (req, res) => {
  res.render('admin-forgot-password', { error: null, sent: false, email: '' });
});

router.post('/forgot-password', redirectIfAdmin, async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const admin = await db.prepare('SELECT * FROM admins WHERE email = ?').get(email);

    // Same "always say sent" approach as the student flow, so this form
    // can't be used to check which emails have admin accounts.
    if (admin) {
      const token = crypto.randomBytes(32).toString('hex');
      const oneHour = 1000 * 60 * 60;
      await db
        .prepare('INSERT INTO admin_password_resets (token, admin_id, expires_at) VALUES (?, ?, ?)')
        .run(token, admin.id, Date.now() + oneHour);

      const resetUrl = `${req.protocol}://${req.get('host')}/admin/reset-password/${token}`;
      try {
        await sendPasswordResetEmail(admin.email, resetUrl, { heading: 'CampusGuard Security Desk' });
      } catch (mailErr) {
        console.error('Failed to send admin password reset email:', mailErr);
        return res.status(500).render('admin-forgot-password', {
          error: 'We could not send the reset email right now. Please try again shortly.',
          sent: false,
          email,
        });
      }
    }

    res.render('admin-forgot-password', { error: null, sent: true, email });
  } catch (err) {
    next(err);
  }
});

router.get('/reset-password/:token', redirectIfAdmin, async (req, res, next) => {
  try {
    const reset = await db
      .prepare('SELECT * FROM admin_password_resets WHERE token = ?')
      .get(req.params.token);

    if (!reset || reset.used || reset.expires_at < Date.now()) {
      return res.status(400).render('admin-reset-password', {
        error: 'This reset link is invalid or has expired. Please request a new one.',
        token: null,
      });
    }

    res.render('admin-reset-password', { error: null, token: req.params.token });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/reset-password/:token',
  redirectIfAdmin,
  [
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('confirm_password').custom((val, { req }) => val === req.body.password).withMessage('Passwords do not match.'),
  ],
  async (req, res, next) => {
    try {
      const reset = await db
        .prepare('SELECT * FROM admin_password_resets WHERE token = ?')
        .get(req.params.token);

      if (!reset || reset.used || reset.expires_at < Date.now()) {
        return res.status(400).render('admin-reset-password', {
          error: 'This reset link is invalid or has expired. Please request a new one.',
          token: null,
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).render('admin-reset-password', {
          error: errors.array()[0].msg,
          token: req.params.token,
        });
      }

      const password_hash = bcrypt.hashSync(req.body.password, 10);
      await db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(password_hash, reset.admin_id);
      await db.prepare('UPDATE admin_password_resets SET used = 1 WHERE token = ?').run(req.params.token);

      res.render('admin-login', { error: null, email: '', next: '', resetSuccess: true });
    } catch (err) {
      next(err);
    }
  }
);

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
