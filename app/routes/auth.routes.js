const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const PasswordResetToken = require('../models/passwordResetToken.model');
const { requireLogin } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/register', (req, res) => {
  res.render('auth/register', { error: null, old: {} });
});

// User verification algorithm: reject duplicate email / phone / username at signup.
router.post('/register', async (req, res) => {
  try {
    const { username, email, phone, password, confirmPassword } = req.body;

    if (!username || !email || !phone || !password || !confirmPassword) {
      return res.render('auth/register', { error: 'All required fields must be filled in.', old: req.body });
    }
    if (password.length < 8) {
      return res.render('auth/register', { error: 'Password must be at least 8 characters.', old: req.body });
    }
    if (password !== confirmPassword) {
      return res.render('auth/register', { error: 'Passwords do not match.', old: req.body });
    }

    const duplicate = await User.findOne({
      $or: [{ username }, { email: email.toLowerCase() }, { phone }]
    });
    if (duplicate) {
      return res.render('auth/register', {
        error: 'That username, email, or phone number is already registered.',
        old: req.body
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username, email: email.toLowerCase(), phone, passwordHash,
      profile: { displayName: username }
    });

    req.session.user = { id: user._id, username: user.username, role: user.role };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('auth/register', { error: 'Something went wrong. Please try again.', old: req.body });
  }
});

router.get('/login', (req, res) => {
  res.render('auth/login', { error: null, next: req.query.next || '/' });
});

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await User.findOne({ $or: [{ username: identifier }, { email: (identifier || '').toLowerCase() }] });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.render('auth/login', { error: 'Incorrect username/email or password.', next: req.body.next || '/' });
    }
    if (user.status === 'suspended') {
      return res.render('auth/login', { error: 'This account has been suspended.', next: '/' });
    }
    req.session.user = { id: user._id, username: user.username, role: user.role };
    res.redirect(req.body.next && req.body.next.startsWith('/') ? req.body.next : '/');
  } catch (err) {
    console.error(err);
    res.render('auth/login', { error: 'Something went wrong. Please try again.', next: '/' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// --- Forgot / reset password -------------------------------------------
// No email sending yet (flagged for later — see README). For now, typing
// the correct account email generates a reset link and shows it directly
// on the page instead of emailing it, so the flow is fully testable today
// and only the delivery mechanism needs to change later.
router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', { error: null });
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('auth/forgot-password', { error: 'No account uses that email address.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
    await PasswordResetToken.create({ userId: user._id, token, expiresAt });
    res.render('auth/reset-link-sent', { resetUrl: `/reset-password/${token}` });
  } catch (err) {
    console.error(err);
    res.render('auth/forgot-password', { error: 'Something went wrong. Please try again.' });
  }
});

router.get('/reset-password/:token', async (req, res) => {
  const record = await PasswordResetToken.findOne({ token: req.params.token }).lean();
  if (!record || record.used || record.expiresAt < new Date()) {
    return res.render('auth/reset-password', { error: 'This reset link is invalid or has expired.', token: null });
  }
  res.render('auth/reset-password', { error: null, token: req.params.token });
});

router.post('/reset-password/:token', async (req, res) => {
  try {
    const record = await PasswordResetToken.findOne({ token: req.params.token });
    if (!record || record.used || record.expiresAt < new Date()) {
      return res.render('auth/reset-password', { error: 'This reset link is invalid or has expired.', token: null });
    }
    const { password, confirmPassword } = req.body;
    if (!password || password.length < 8) {
      return res.render('auth/reset-password', { error: 'Password must be at least 8 characters.', token: req.params.token });
    }
    if (password !== confirmPassword) {
      return res.render('auth/reset-password', { error: 'Passwords do not match.', token: req.params.token });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(record.userId, { passwordHash });
    record.used = true;
    await record.save();
    res.render('auth/login', { error: null, next: '/', resetSuccess: true });
  } catch (err) {
    console.error(err);
    res.render('auth/reset-password', { error: 'Something went wrong. Please try again.', token: req.params.token });
  }
});

// .lean() returns the raw stored document and skips Mongoose's default-
// filling, so any account created without a `contact`/`profile` sub-object
// (every account right now — registration never sets one) comes back with
// that field as `undefined`, not `{}`. Normalize it here so the view never
// has to guess whether it's safe to read a sub-field.
function withDefaults(user) {
  if (!user) return user;
  user.profile = user.profile || {};
  user.contact = user.contact || {};
  user.reputation = user.reputation || { score: 0, badges: [] };
  return user;
}

router.get('/profile', requireLogin, async (req, res) => {
  const user = withDefaults(await User.findById(req.session.user.id).lean());
  res.render('account/profile', { user, error: null, success: null, passwordError: null, passwordSuccess: null });
});

router.post('/profile', requireLogin, async (req, res) => {
  try {
    const { displayName, bio, address, city } = req.body;
    await User.findByIdAndUpdate(req.session.user.id, {
      'profile.displayName': displayName,
      'profile.bio': bio,
      'contact.address': address,
      'contact.city': city
    });
    const user = withDefaults(await User.findById(req.session.user.id).lean());
    res.render('account/profile', { user, error: null, success: 'Settings saved.', passwordError: null, passwordSuccess: null });
  } catch (err) {
    console.error(err);
    const user = withDefaults(await User.findById(req.session.user.id).lean());
    res.render('account/profile', { user, error: 'Could not save changes.', success: null, passwordError: null, passwordSuccess: null });
  }
});

// Change password while logged in — distinct from the forgot-password flow:
// this requires knowing the *current* password rather than proving email
// ownership, so it belongs on the profile page as a normal account setting.
router.post('/profile/password', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user.id);
  const rerender = (passwordError, passwordSuccess) => {
    const leanUser = withDefaults(user.toObject());
    res.render('account/profile', { user: leanUser, error: null, success: null, passwordError, passwordSuccess });
  };

  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return rerender('Fill in all three password fields.', null);
    }
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return rerender('Current password is incorrect.', null);
    }
    if (newPassword.length < 8) {
      return rerender('New password must be at least 8 characters.', null);
    }
    if (newPassword !== confirmNewPassword) {
      return rerender('New passwords do not match.', null);
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    rerender(null, 'Password changed.');
  } catch (err) {
    console.error(err);
    rerender('Could not change password. Please try again.', null);
  }
});

module.exports = router;
