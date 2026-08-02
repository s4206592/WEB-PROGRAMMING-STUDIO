const helpers = require('../utils/helpers');

/** Template helpers + flash messages, available in every view. */
function locals(req, res, next) {
  res.locals.formatVND = helpers.formatVND;
  res.locals.timeAgo   = helpers.timeAgo;
  res.locals.stars     = helpers.stars;
  res.locals.primaryImage = helpers.primaryImage;
  res.locals.availableQty = helpers.availableQty;
  res.locals.daysRemaining = helpers.daysRemaining;
  res.locals.CONDITION_LABELS = helpers.CONDITION_LABELS;
  res.locals.VN_PROVINCES = helpers.VN_PROVINCES;
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.flashSuccess = req.flash('success');
  res.locals.flashError = req.flash('error');
  res.locals.title = 'StudioTrade';
  res.locals.breadcrumb = null;
  // Defaults so the error view still renders if a request fails before
  // loadUser has had a chance to populate these.
  res.locals.currentUser = null;
  res.locals.cartCount = 0;
  res.locals.wishlistCount = 0;
  res.locals.notifCount = 0;
  next();
}

module.exports = { locals };
