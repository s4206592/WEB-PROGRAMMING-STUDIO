const express = require('express');
const { Notification } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH } = require('../utils/helpers');

const router = express.Router();

// ── Notification Center ───────────────────────────────────────────
router.get('/', requireAuth, asyncH(async (req, res) => {
  const filter = { userId: req.user._id };
  if (req.query.unread === '1') filter.isRead = false;
  if (req.query.type) filter.type = String(req.query.type);

  const [notifications, unreadCount, typeRows] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(100).lean(),
    Notification.countDocuments({ userId: req.user._id, isRead: false }),
    Notification.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$type', n: { $sum: 1 } } },
      { $sort: { n: -1 } }
    ])
  ]);

  res.render('shared/notifications', {
    title: 'Notification Center',
    breadcrumb: 'Home / Notifications',
    notifications, unreadCount, typeRows,
    activeType: req.query.type || '',
    unreadOnly: req.query.unread === '1'
  });
}));

// ── Open one (marks read, then follows the deep link) ─────────────
router.get('/:id/open', requireAuth, asyncH(async (req, res) => {
  const n = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
  if (!n) return res.redirect('/notifications');
  if (!n.isRead) {
    n.isRead = true;
    n.readAt = new Date();
    await n.save();
  }
  res.redirect(n.linkUrl || '/notifications');
}));

router.post('/read-all', requireAuth, asyncH(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  req.flash('success', 'All notifications marked as read.');
  res.redirect('/notifications');
}));

router.post('/:id/read', requireAuth, asyncH(async (req, res) => {
  await Notification.updateOne(
    { _id: req.params.id, userId: req.user._id },
    { $set: { isRead: true, readAt: new Date() } }
  );
  res.redirect('/notifications');
}));

router.post('/clear-read', requireAuth, asyncH(async (req, res) => {
  await Notification.deleteMany({ userId: req.user._id, isRead: true });
  req.flash('success', 'Read notifications cleared.');
  res.redirect('/notifications');
}));

module.exports = router;
