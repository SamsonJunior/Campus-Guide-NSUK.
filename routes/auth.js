const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { redirectIfStudent } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../lib/mailer');

const router = express.Router();

router.get('/register', redirectIfStudent, (req, res) => {
  res.render('register', { errors: [], values: {} });
});

router.post(
  '/register',
  redirectIfStudent,
  [
    body('full_name').trim().isLength({ min: 3 }).withMessage('Enter the student\u2019s full name.'),
    body('matric_number').trim().isLength({ min: 3 }).withMessage('Enter a valid matric number.'),
    body('email').trim().isEmail().withMessage('Enter a valid email address.'),
    body('phone').trim().isLength({ min: 7 }).withMessage('Enter a reachable phone number.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('confirm_password').custom((val, { req }) => val === req.body.password).withMessage('Passwords do not match.'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).render('register', {
          errors: errors.array(),
          values: req.body,
        });
      }

      const { full_name, matric_number, email, phone, department, password } = req.body;

      const existing = await db
        .prepare('SELECT id FROM students WHERE email = ? OR matric_number = ?')
        .get(email.toLowerCase(), matric_number.toUpperCase());

      if (existing) {
        return res.status(400).render('register', {
          errors: [{ msg: 'A student account with that email or matric number already exists.' }],
          values: req.body,
        });
      }

      const password_hash = bcrypt.hashSync(password, 10);
      const info = await db
        .prepare(
          `INSERT INTO students (full_name, matric_number, email, phone, department, password_hash)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(full_name.trim(), matric_number.trim().toUpperCase(), email.trim().toLowerCase(), phone.trim(), (department || '').trim(), password_hash);

      req.session.studentId = info.lastInsertRowid;
      res.redirect('/dashboard');
    } catch (err) {
      next(err);
    }
  }
);

router.get('/login', redirectIfStudent, (req, res) => {
  res.render('login', { error: null, email: '', next: req.query.next || '', resetSuccess: false });
});

router.post('/login', redirectIfStudent, async (req, res, next) => {
  try {
    const { email, password, next: nextUrl } = req.body;
    const student = await db.prepare('SELECT * FROM students WHERE email = ?').get((email || '').trim().toLowerCase());

    if (!student || !bcrypt.compareSync(password || '', student.password_hash)) {
      return res.status(401).render('login', { error: 'Incorrect email or password.', email, next: nextUrl || '', resetSuccess: false });
    }

    req.session.studentId = student.id;
    res.redirect(nextUrl && nextUrl.startsWith('/') ? nextUrl : '/dashboard');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.studentId = null;
  res.redirect('/');
});

router.get('/forgot-password', redirectIfStudent, (req, res) => {
  res.render('forgot-password', { error: null, sent: false, email: '' });
});

router.post('/forgot-password', redirectIfStudent, async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const student = await db.prepare('SELECT * FROM students WHERE email = ?').get(email);

    // Always show the same "sent" message whether or not the account
    // exists \u2014 this stops someone from using this form to find out which
    // emails are registered students.
    if (student) {
      const token = crypto.randomBytes(32).toString('hex');
      const oneHour = 1000 * 60 * 60;
      await db
        .prepare('INSERT INTO password_resets (token, student_id, expires_at) VALUES (?, ?, ?)')
        .run(token, student.id, Date.now() + oneHour);

      const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${token}`;
      try {
        await sendPasswordResetEmail(student.email, resetUrl);
      } catch (mailErr) {
        console.error('Failed to send password reset email:', mailErr);
        return res.status(500).render('forgot-password', {
          error: 'We could not send the reset email right now. Please try again shortly.',
          sent: false,
          email,
        });
      }
    }

    res.render('forgot-password', { error: null, sent: true, email });
  } catch (err) {
    next(err);
  }
});

router.get('/reset-password/:token', redirectIfStudent, async (req, res, next) => {
  try {
    const reset = await db
      .prepare('SELECT * FROM password_resets WHERE token = ?')
      .get(req.params.token);

    if (!reset || reset.used || reset.expires_at < Date.now()) {
      return res.status(400).render('reset-password', {
        error: 'This reset link is invalid or has expired. Please request a new one.',
        token: null,
      });
    }

    res.render('reset-password', { error: null, token: req.params.token });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/reset-password/:token',
  redirectIfStudent,
  [
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('confirm_password').custom((val, { req }) => val === req.body.password).withMessage('Passwords do not match.'),
  ],
  async (req, res, next) => {
    try {
      const reset = await db
        .prepare('SELECT * FROM password_resets WHERE token = ?')
        .get(req.params.token);

      if (!reset || reset.used || reset.expires_at < Date.now()) {
        return res.status(400).render('reset-password', {
          error: 'This reset link is invalid or has expired. Please request a new one.',
          token: null,
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).render('reset-password', {
          error: errors.array()[0].msg,
          token: req.params.token,
        });
      }

      const password_hash = bcrypt.hashSync(req.body.password, 10);
      await db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(password_hash, reset.student_id);
      await db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(req.params.token);

      res.render('login', { error: null, email: '', next: '', resetSuccess: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
