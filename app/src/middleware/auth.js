const { User, Cart, Wishlist, Notification } = require('../models');

/** Loads the signed-in user onto req.user and res.locals for every request. */
async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  res.locals.cartCount = 0;
  res.locals.wishlistCount = 0;
  res.locals.notifCount = 0;

  if (!req.session.userId) return next();

  try {
    const user = await User.findById(req.session.userId);
    if (!user || user.status === 'deleted' || user.status === 'banned') {
      req.session.destroy(() => {});
      return next();
    }
    req.user = user;
    res.locals.currentUser = user;

    const [cart, wishlist, notifCount] = await Promise.all([
      Cart.findOne({ userId: user._id }),
      Wishlist.findOne({ userId: user._id }),
      Notification.countDocuments({ userId: user._id, isRead: false })
    ]);
    // Cart counter is computed, never stored — a stored count drifts.
    res.locals.cartCount = cart ? cart.items.reduce((n, i) => n + i.quantity, 0) : 0;
    res.locals.wishlistCount = wishlist ? wishlist.items.length : 0;
    res.locals.notifCount = notifCount;
    next();
  } catch (err) {
    next(err);
  }
}

/** Gate a page behind sign-in, remembering where the user was headed. */
function requireAuth(req, res, next) {
  if (req.user) return next();
  req.session.returnTo = req.originalUrl;
  req.flash('error', 'Sign in to continue.');
  return res.redirect('/login');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      req.session.returnTo = req.originalUrl;
      req.flash('error', 'Sign in to continue.');
      return res.redirect('/login');
    }
    if (!roles.some(r => req.user.roles.includes(r))) {
      return res.status(403).render('error', {
        title: 'Not allowed',
        status: 403,
        message: 'This area is restricted to ' + roles.join(' / ') + ' accounts.'
      });
    }
    next();
  };
}

const requireAdmin = requireRole('admin');
const requireStaff = requireRole('admin', 'staff');
const requireModerator = requireRole('admin', 'staff', 'moderator');

module.exports = { loadUser, requireAuth, requireRole, requireAdmin, requireStaff, requireModerator };
