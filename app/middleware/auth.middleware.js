// Shared auth helpers. These guard routes but never assume other modules exist.
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).render('404', { message: "You don't have access to this page." });
  }
  next();
}

// Makes the logged-in user (or null) available to every view without every
// route having to fetch it manually.
function attachUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  next();
}

module.exports = { requireLogin, requireAdmin, attachUser };
