const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { redirectIfStudent } = require('../middleware/auth');

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
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render('register', {
        errors: errors.array(),
        values: req.body,
      });
    }

    const { full_name, matric_number, email, phone, department, password } = req.body;

    const existing = db
      .prepare('SELECT id FROM students WHERE email = ? OR matric_number = ?')
      .get(email.toLowerCase(), matric_number.toUpperCase());

    if (existing) {
      return res.status(400).render('register', {
        errors: [{ msg: 'A student account with that email or matric number already exists.' }],
        values: req.body,
      });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const info = db
      .prepare(
        `INSERT INTO students (full_name, matric_number, email, phone, department, password_hash)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(full_name.trim(), matric_number.trim().toUpperCase(), email.trim().toLowerCase(), phone.trim(), (department || '').trim(), password_hash);

    req.session.studentId = info.lastInsertRowid;
    res.redirect('/dashboard');
  }
);

router.get('/login', redirectIfStudent, (req, res) => {
  res.render('login', { error: null, email: '', next: req.query.next || '' });
});

router.post('/login', redirectIfStudent, (req, res) => {
  const { email, password, next } = req.body;
  const student = db.prepare('SELECT * FROM students WHERE email = ?').get((email || '').trim().toLowerCase());

  if (!student || !bcrypt.compareSync(password || '', student.password_hash)) {
    return res.status(401).render('login', { error: 'Incorrect email or password.', email, next: next || '' });
  }

  req.session.studentId = student.id;
  res.redirect(next && next.startsWith('/') ? next : '/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.studentId = null;
  res.redirect('/');
});

module.exports = router;
