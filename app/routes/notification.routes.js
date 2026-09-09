const express = require('express');
const Notification = require('../models/notification.model');
const { requireLogin } = require('../middleware/auth.middleware');

// Purely additive module: nothing else reads from it to decide behavior.
const router = express.Router();

router.get('/notifications', requireLogin, async (req, res) => {
  const notifications = await Notification.find({ userId: req.session.user.id }).sort({ createdAt: -1 }).limit(50).lean();
  res.render('account/notifications', { notifications });
});

router.post('/notifications/:id/read', requireLogin, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
