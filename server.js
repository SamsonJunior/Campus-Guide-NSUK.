const path = require('path');
const express = require('express');
const session = require('express-session');
const SqliteSessionStore = require('./middleware/sqliteSessionStore');

require('./db'); // ensures schema + seed admin exist before routes load

const authRoutes = require('./routes/auth');
const alertRoutes = require('./routes/alerts');
const adminRoutes = require('./routes/admin');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new SqliteSessionStore(),
    secret: process.env.SESSION_SECRET || 'campusguard-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8, httpOnly: true },
  })
);

// make current student/admin available to all views
app.use((req, res, next) => {
  res.locals.isStudentAuthed = Boolean(req.session.studentId);
  res.locals.isAdminAuthed = Boolean(req.session.adminId);
  next();
});

app.get('/', (req, res) => {
  const totals = db.prepare('SELECT COUNT(*) AS c FROM alerts').get();
  res.render('landing', { totalAlerts: totals.c });
});

app.use('/', authRoutes);
app.use('/', alertRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`CampusGuard running at http://localhost:${PORT}`);
});
