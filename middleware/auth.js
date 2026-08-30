function requireStudent(req, res, next) {
  if (!req.session.studentId) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.adminId) {
    return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function redirectIfStudent(req, res, next) {
  if (req.session.studentId) return res.redirect('/dashboard');
  next();
}

function redirectIfAdmin(req, res, next) {
  if (req.session.adminId) return res.redirect('/admin/dashboard');
  next();
}

module.exports = { requireStudent, requireAdmin, redirectIfStudent, redirectIfAdmin };
