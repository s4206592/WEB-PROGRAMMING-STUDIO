const express = require('express');
const { User, Cart, Wishlist, ActivityLog } = require('../models');
const { asyncH } = require('../utils/helpers');

const router = express.Router();

const MAX_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

function logActivity(req, userId, action, extra = {}) {
  return ActivityLog.create({
    userId, action,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    ...extra
  }).catch(() => {});
}

// ── Register ──────────────────────────────────────────────────────
router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('account/register', { title: 'Register', form: {}, errors: [] });
});

router.post('/register', asyncH(async (req, res) => {
  const form = {
    username: String(req.body.username || '').trim().toLowerCase(),
    email: String(req.body.email || '').trim().toLowerCase(),
    phone: String(req.body.phone || '').trim(),
    fullName: String(req.body.fullName || '').trim()
  };
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirmPassword || '');
  const errors = [];

  if (!/^[a-z0-9_.-]{3,30}$/.test(form.username)) {
    errors.push('Username must be 3–30 characters: letters, numbers, dot, dash or underscore.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errors.push('Enter a valid email address.');
  if (!/^\+?\d{8,15}$/.test(form.phone.replace(/[\s-]/g, ''))) {
    errors.push('Enter a valid phone number, e.g. +84901234567.');
  }
  if (password.length < 8) errors.push('Password must be at least 8 characters.');
  if (password !== confirm) errors.push('The two passwords do not match.');

  if (errors.length) {
    return res.status(400).render('account/register', { title: 'Register', form, errors });
  }

  const user = new User({
    username: form.username,
    email: form.email,
    phone: form.phone.replace(/[\s-]/g, ''),
    fullName: form.fullName || form.username,
    roles: ['buyer']
  });
  await user.setPassword(password);

  try {
    await user.save();
  } catch (err) {
    // Verification algorithm: trust the unique indexes and catch E11000.
    // A pre-check findOne() alone is racy under concurrent sign-ups.
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      const label = { username: 'username', email: 'email address', phone: 'phone number' }[field] || field;
      return res.status(409).render('account/register', {
        title: 'Register', form,
        errors: [`That ${label} is already registered. Try another, or sign in instead.`]
      });
    }
    throw err;
  }

  await Promise.all([
    Cart.create({ userId: user._id, items: [] }),
    Wishlist.create({ userId: user._id, items: [] })
  ]);
  logActivity(req, user._id, 'register');

  req.session.userId = user._id.toString();
  req.flash('success', `Welcome to StudioTrade, ${user.username}.`);
  res.redirect('/products');
}));

// ── Login ─────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('account/login', { title: 'Login', form: {}, errors: [] });
});

router.post('/login', asyncH(async (req, res) => {
  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const form = { identifier };
  const fail = (msg) => res.status(401).render('account/login', { title: 'Login', form, errors: [msg] });

  if (!identifier || !password) return fail('Enter your email (or username) and password.');

  const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
  if (!user) return fail('No account matches those details.');

  if (user.lockUntil && user.lockUntil > new Date()) {
    const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return fail(`Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  if (user.status === 'banned') return fail('This account has been banned.');
  if (user.status === 'suspended' && (!user.suspension?.until || user.suspension.until > new Date())) {
    return fail('This account is suspended. Contact support if you think that is a mistake.');
  }

  const ok = await user.verifyPassword(password);
  if (!ok) {
    user.loginAttempts = (user.loginAttempts || 0) + 1;
    if (user.loginAttempts >= MAX_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      user.loginAttempts = 0;
    }
    await user.save();
    return fail('Incorrect password.');
  }

  // A suspension that has expired restores the account on next sign-in.
  if (user.status === 'suspended') {
    user.status = 'active';
    user.suspension = undefined;
  }
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  // Make sure the two per-user singleton documents exist.
  await Promise.all([
    Cart.updateOne({ userId: user._id }, { $setOnInsert: { items: [] } }, { upsert: true }),
    Wishlist.updateOne({ userId: user._id }, { $setOnInsert: { items: [] } }, { upsert: true })
  ]);
  logActivity(req, user._id, 'login');

  const dest = req.session.returnTo || '/products';
  delete req.session.returnTo;
  req.session.userId = user._id.toString();
  req.flash('success', `Signed in as ${user.username}.`);
  res.redirect(dest);
}));

// ── Logout ────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const userId = req.session.userId;
  if (userId) logActivity(req, userId, 'logout');
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
