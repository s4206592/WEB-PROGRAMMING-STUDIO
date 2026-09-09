const express = require('express');
const User = require('../models/user.model');
const Product = require('../models/product.model');
const Order = require('../models/order.model');
const ModerationFlag = require('../models/moderationFlag.model');
const { Studio } = require('../models/studio.model');
const { requireAdmin } = require('../middleware/auth.middleware');

// Administration module. Every read here is wrapped so that a missing
// collection from another module shows as zero, not a crash.
const router = express.Router();

async function safeCount(model, filter = {}) {
  try { return await model.countDocuments(filter); } catch (e) { return 0; }
}

router.get('/admin', requireAdmin, async (req, res) => {
  const stats = {
    users: await safeCount(User),
    listings: await safeCount(Product, { status: 'active' }),
    orders: await safeCount(Order),
    openFlags: await safeCount(ModerationFlag, { status: 'open' }),
    pendingStudios: await safeCount(Studio, { status: 'pending_review' })
  };
  res.render('admin/dashboard', { stats });
});

router.get('/admin/users', requireAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  res.render('admin/users', { users });
});

router.post('/admin/users/:id/suspend', requireAdmin, async (req, res) => {
  try { await User.findByIdAndUpdate(req.params.id, { status: 'suspended' }); } catch (err) { console.error(err); }
  res.redirect('/admin/users');
});

router.post('/admin/users/:id/activate', requireAdmin, async (req, res) => {
  try { await User.findByIdAndUpdate(req.params.id, { status: 'active' }); } catch (err) { console.error(err); }
  res.redirect('/admin/users');
});

router.get('/admin/moderation', requireAdmin, async (req, res) => {
  const flags = await ModerationFlag.find({ status: 'open' }).sort({ createdAt: -1 }).lean();
  res.render('admin/moderation', { flags });
});

router.post('/admin/moderation/:id/resolve', requireAdmin, async (req, res) => {
  try { await ModerationFlag.findByIdAndUpdate(req.params.id, { status: 'resolved' }); } catch (err) { console.error(err); }
  res.redirect('/admin/moderation');
});

module.exports = router;
