const express = require('express');
const { Conversation, Message, Product, Studio, User } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH, primaryImage } = require('../utils/helpers');
const { notify } = require('../utils/notify');

const router = express.Router();

// ── Inbox ─────────────────────────────────────────────────────────
router.get('/', requireAuth, asyncH(async (req, res) => {
  const conversations = await Conversation.find({
    participants: req.user._id,
    archivedBy: { $ne: req.user._id },
    status: { $ne: 'removed' }
  }).sort({ updatedAt: -1 }).limit(100)
    .populate('participants', 'username fullName avatarUrl')
    .lean();

  res.render('messages/inbox', {
    title: 'Messages',
    breadcrumb: 'Home / Messages',
    conversations
  });
}));

// ── Start a thread from a listing ─────────────────────────────────
router.post('/start/product/:productId', requireAuth, asyncH(async (req, res) => {
  const product = await Product.findById(req.params.productId).lean();
  if (!product) {
    req.flash('error', 'That listing no longer exists.');
    return res.redirect('/products');
  }
  if (String(product.sellerId) === String(req.user._id)) {
    req.flash('error', 'That is your own listing.');
    return res.redirect(`/products/${product.slug}`);
  }

  const participantsKey = Conversation.buildKey(req.user._id, product.sellerId);
  // Upsert, not create — two rapid clicks must not fork two threads.
  const conv = await Conversation.findOneAndUpdate(
    { participantsKey, productId: product._id },
    {
      // participantsKey / productId come from the filter on insert — repeating
      // them here would be a path conflict.
      $setOnInsert: {
        participants: [req.user._id, product.sellerId],
        context: 'listing',
        subject: product.title,
        thumbUrl: primaryImage(product),
        status: 'open'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.redirect(`/messages/${conv._id}`);
}));

// ── Thread ────────────────────────────────────────────────────────
router.get('/:id', requireAuth, asyncH(async (req, res) => {
  const conv = await Conversation.findById(req.params.id)
    .populate('participants', 'username fullName avatarUrl');
  if (!conv) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such conversation.' });
  }
  // Membership is checked server-side — a conversationId from the client is not trusted.
  if (!conv.participants.some(p => String(p._id) === String(req.user._id))) {
    return res.status(403).render('error', { title: 'Not allowed', status: 403, message: 'This conversation is not yours.' });
  }

  const messages = await Message.find({ conversationId: conv._id })
    .sort({ createdAt: 1 }).limit(300)
    .populate('senderId', 'username').lean();

  // Clear this user's unread counter.
  await Conversation.updateOne(
    { _id: conv._id, 'unread.userId': req.user._id },
    { $set: { 'unread.$.count': 0 } }
  );

  const other = conv.participants.find(p => String(p._id) !== String(req.user._id));
  res.render('messages/thread', {
    title: other ? `Chat with ${other.username}` : 'Conversation',
    breadcrumb: 'Home / Messages / Conversation',
    conv, messages, other
  });
}));

// ── Send ──────────────────────────────────────────────────────────
router.post('/:id/send', requireAuth, asyncH(async (req, res) => {
  const conv = await Conversation.findById(req.params.id);
  if (!conv) return res.redirect('/messages');

  const isMember = conv.participants.some(p => String(p) === String(req.user._id));
  if (!isMember || conv.status !== 'open' || (conv.blockedBy || []).length) {
    req.flash('error', 'You cannot post in this conversation.');
    return res.redirect('/messages');
  }

  const body = String(req.body.body || '').trim().slice(0, 2000);
  if (!body) return res.redirect(`/messages/${conv._id}`);

  await Message.create({ conversationId: conv._id, senderId: req.user._id, body });

  const other = conv.participants.find(p => String(p) !== String(req.user._id));
  conv.lastMessage = { text: body.slice(0, 140), senderId: req.user._id, sentAt: new Date() };
  const entry = (conv.unread || []).find(u => String(u.userId) === String(other));
  if (entry) entry.count += 1;
  else conv.unread.push({ userId: other, count: 1 });
  // A reply un-archives the thread for the other side.
  conv.archivedBy = (conv.archivedBy || []).filter(u => String(u) !== String(other));
  await conv.save();

  await notify(other, {
    type: 'system',
    title: `New message from ${req.user.username}`,
    body: body.slice(0, 120),
    linkUrl: `/messages/${conv._id}`,
    targetType: 'message', targetId: conv._id
  });

  res.redirect(`/messages/${conv._id}`);
}));

// ── Archive (per user — hiding it must not hide it for the other side) ──
router.post('/:id/archive', requireAuth, asyncH(async (req, res) => {
  await Conversation.updateOne(
    { _id: req.params.id, participants: req.user._id },
    { $addToSet: { archivedBy: req.user._id } }
  );
  req.flash('success', 'Conversation archived.');
  res.redirect('/messages');
}));

module.exports = router;
