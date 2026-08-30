const express = require('express');
const db = require('../db');
const { requireStudent } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = [
  { value: 'medical', label: 'Medical emergency' },
  { value: 'security', label: 'Security threat / robbery' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'accident', label: 'Accident' },
  { value: 'fire', label: 'Fire' },
  { value: 'general', label: 'Other emergency' },
];

router.get('/dashboard', requireStudent, (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.session.studentId);
  const alerts = db
    .prepare('SELECT * FROM alerts WHERE student_id = ? ORDER BY created_at DESC LIMIT 10')
    .all(student.id);
  res.render('dashboard', { student, alerts });
});

router.get('/alert', requireStudent, (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.session.studentId);
  res.render('alert', { student, categories: CATEGORIES, error: null });
});

router.post('/alert', requireStudent, (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.session.studentId);
  const { category, note, latitude, longitude, accuracy, location_captured } = req.body;

  const cat = CATEGORIES.some((c) => c.value === category) ? category : 'general';

  const info = db
    .prepare(
      `INSERT INTO alerts (student_id, category, note, latitude, longitude, accuracy, location_captured)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      student.id,
      cat,
      (note || '').trim().slice(0, 500),
      latitude ? Number(latitude) : null,
      longitude ? Number(longitude) : null,
      accuracy ? Number(accuracy) : null,
      location_captured === '1' ? 1 : 0
    );

  db.prepare(`INSERT INTO alert_events (alert_id, actor, action) VALUES (?, ?, ?)`).run(
    info.lastInsertRowid,
    `student:${student.id}`,
    'Alert created'
  );

  res.redirect(`/alert/${info.lastInsertRowid}/confirmation`);
});

router.get('/alert/:id/confirmation', requireStudent, (req, res) => {
  const alert = db
    .prepare('SELECT * FROM alerts WHERE id = ? AND student_id = ?')
    .get(req.params.id, req.session.studentId);
  if (!alert) return res.redirect('/dashboard');
  res.render('confirmation', { alert });
});

module.exports = router;
