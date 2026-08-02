const express = require('express');
const {
  User, Product, Order, Review, Wishlist, ForumPost, BlogPost, ActivityLog
} = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH } = require('../utils/helpers');

const router = express.Router();

// ── Profile (view) ────────────────────────────────────────────────
router.get('/profile', requireAuth, asyncH(async (req, res) => {
  const uid = req.user._id;
  const [listings, orders, reviews, wishlist, threads, articles] = await Promise.all([
    Product.find({ sellerId: uid, status: { $ne: 'removed' } }).sort({ createdAt: -1 }).limit(6).lean(),
    Order.find({ buyerId: uid }).sort({ placedAt: -1 }).limit(5).lean(),
    Review.find({ reviewerId: uid, status: 'published' }).sort({ createdAt: -1 }).limit(5).populate('productId', 'title slug').lean(),
    Wishlist.findOne({ userId: uid }).populate('items.productId', 'title slug price media status').lean(),
    ForumPost.find({ authorId: uid, status: { $ne: 'removed' } }).sort({ createdAt: -1 }).limit(5).lean(),
    BlogPost.find({ authorId: uid }).sort({ createdAt: -1 }).limit(5).lean()
  ]);

  res.render('account/profile', {
    title: 'Profile',
    breadcrumb: 'Home / Profile',
    profileUser: req.user,
    listings, orders, reviews,
    wishlistItems: wishlist ? wishlist.items.filter(i => i.productId).slice(0, 6) : [],
    threads, articles
  });
}));

// ── Public profile ────────────────────────────────────────────────
router.get('/u/:username', asyncH(async (req, res) => {
  const profileUser = await User.findOne({ username: String(req.params.username).toLowerCase() });
  if (!profileUser || profileUser.status === 'deleted') {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such user.' });
  }
  const [listings, reviews] = await Promise.all([
    Product.find({ sellerId: profileUser._id, status: 'active' }).sort({ publishedAt: -1 }).limit(12).lean(),
    Review.find({ sellerId: profileUser._id, status: 'published' }).sort({ createdAt: -1 }).limit(10)
      .populate('reviewerId', 'username').populate('productId', 'title slug').lean()
  ]);
  res.render('account/public-profile', {
    title: profileUser.username,
    breadcrumb: `Home / Users / ${profileUser.username}`,
    profileUser, listings, reviews
  });
}));

// ── Account settings ──────────────────────────────────────────────
router.get('/settings', requireAuth, (req, res) => {
  res.render('account/settings', {
    title: 'Account Settings',
    breadcrumb: 'Home / Profile / Account Settings',
    errors: []
  });
});

router.post('/settings/profile', requireAuth, asyncH(async (req, res) => {
  req.user.fullName = String(req.body.fullName || '').trim().slice(0, 100);
  req.user.bio = String(req.body.bio || '').trim().slice(0, 500);
  req.user.avatarUrl = String(req.body.avatarUrl || '').trim();
  const phone = String(req.body.phone || '').trim().replace(/[\s-]/g, '');
  const email = String(req.body.email || '').trim().toLowerCase();

  if (phone && phone !== req.user.phone) {
    req.user.phone = phone;
    req.user.verification.phoneVerified = false;
  }
  if (email && email !== req.user.email) {
    req.user.email = email;
    req.user.verification.emailVerified = false;
  }

  try {
    await req.user.save();
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      req.flash('error', `That ${field} already belongs to another account.`);
      return res.redirect('/account/settings');
    }
    throw err;
  }
  ActivityLog.create({ userId: req.user._id, action: 'profile_update' }).catch(() => {});
  req.flash('success', 'Profile updated.');
  res.redirect('/account/settings');
}));

router.post('/settings/password', requireAuth, asyncH(async (req, res) => {
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  const confirm = String(req.body.confirmPassword || '');

  if (!(await req.user.verifyPassword(current))) {
    req.flash('error', 'Your current password is incorrect.');
    return res.redirect('/account/settings');
  }
  if (next.length < 8) {
    req.flash('error', 'The new password must be at least 8 characters.');
    return res.redirect('/account/settings');
  }
  if (next !== confirm) {
    req.flash('error', 'The two new passwords do not match.');
    return res.redirect('/account/settings');
  }
  await req.user.setPassword(next);
  await req.user.save();
  ActivityLog.create({ userId: req.user._id, action: 'password_change' }).catch(() => {});
  req.flash('success', 'Password changed.');
  res.redirect('/account/settings');
}));

router.post('/settings/notifications', requireAuth, asyncH(async (req, res) => {
  const keys = ['email', 'inApp', 'priceDrops', 'savedSearch', 'orderUpdates', 'forumReplies', 'blogStatus', 'marketing'];
  keys.forEach(k => { req.user.notificationPrefs[k] = req.body[k] === 'on'; });
  await req.user.save();
  req.flash('success', 'Notification preferences saved.');
  res.redirect('/account/settings');
}));

// ── Addresses (embedded on the user) ──────────────────────────────
router.post('/addresses', requireAuth, asyncH(async (req, res) => {
  const addr = {
    label: String(req.body.label || 'Home').slice(0, 40),
    recipient: String(req.body.recipient || '').slice(0, 100),
    phone: String(req.body.phone || '').slice(0, 20),
    line1: String(req.body.line1 || '').slice(0, 200),
    ward: String(req.body.ward || '').slice(0, 80),
    district: String(req.body.district || '').slice(0, 80),
    province: String(req.body.province || '').slice(0, 80),
    country: 'VN',
    isDefault: req.body.isDefault === 'on' || req.user.addresses.length === 0
  };
  if (!addr.recipient || !addr.line1 || !addr.province) {
    req.flash('error', 'Recipient, street address and province are required.');
    return res.redirect(req.body.returnTo || '/account/settings');
  }
  if (addr.isDefault) req.user.addresses.forEach(a => { a.isDefault = false; });
  req.user.addresses.push(addr);
  await req.user.save();
  req.flash('success', 'Address saved.');
  res.redirect(req.body.returnTo || '/account/settings');
}));

router.post('/addresses/:id/delete', requireAuth, asyncH(async (req, res) => {
  req.user.addresses.pull({ _id: req.params.id });
  if (req.user.addresses.length && !req.user.addresses.some(a => a.isDefault)) {
    req.user.addresses[0].isDefault = true;
  }
  await req.user.save();
  req.flash('success', 'Address removed.');
  res.redirect('/account/settings');
}));

// ── Activity history ──────────────────────────────────────────────
router.get('/activity', requireAuth, asyncH(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 25;
  const [entries, total] = await Promise.all([
    ActivityLog.find({ userId: req.user._id }).sort({ createdAt: -1 })
      .skip((page - 1) * perPage).limit(perPage).lean(),
    ActivityLog.countDocuments({ userId: req.user._id })
  ]);
  res.render('account/activity', {
    title: 'Activity History',
    breadcrumb: 'Home / Profile / Activity History',
    entries, page, totalPages: Math.max(1, Math.ceil(total / perPage)),
    baseUrl: '/account/activity', qsExtra: ''
  });
}));

module.exports = router;
