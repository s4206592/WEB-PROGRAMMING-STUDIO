const express = require('express');
const { Conversation, Message, findOrCreateConversation } = require('../models/chat.model');
const User = require('../models/user.model');
const Product = require('../models/product.model');
const { requireLogin } = require('../middleware/auth.middleware');

// Buyer-seller chat, doubling as the negotiation surface (see chat.model.js).
// Independently removable like every other module: delete this file + its
// moduleRegistry line and the rest of the app keeps working — order.routes.js
// only reads Conversation defensively for the negotiated-checkout handoff.
const router = express.Router();

router.get('/messages', requireLogin, async (req, res) => {
  const conversations = await Conversation.find({ participantIds: req.session.user.id })
    .sort({ lastMessageAt: -1 }).lean();
  res.render('messages/inbox', { conversations, myId: req.session.user.id });
});

// Entry point for "Message seller" / "Negotiate price" on a product page.
router.post('/messages/start', requireLogin, async (req, res) => {
  try {
    const { toUserId, productId } = req.body;
    if (!toUserId || String(toUserId) === String(req.session.user.id)) {
      return res.redirect(productId ? `/products/${productId}` : '/messages');
    }
    const seller = await User.findById(toUserId).lean();
    if (!seller) return res.redirect('/messages');

    let relatedProductId, relatedProductSnapshot;
    if (productId) {
      const product = await Product.findById(productId).lean();
      if (product) {
        relatedProductId = product._id;
        relatedProductSnapshot = { title: product.title, image: product.images[0] || '', listPrice: product.pricing.listPrice };
      }
    }

    const convo = await findOrCreateConversation({
      buyer: { id: req.session.user.id, username: req.session.user.username },
      seller: { id: seller._id, username: seller.username },
      relatedProductId, relatedProductSnapshot
    });
    res.redirect(`/messages/${convo._id}`);
  } catch (err) {
    console.error(err);
    res.redirect('/messages');
  }
});

function isParticipant(req, convo) {
  return convo.participantIds.some(id => String(id) === String(req.session.user.id));
}

// findOrCreateConversation always stores [buyer, seller] in that order.
function isSellerOfConversation(req, convo) {
  return String(convo.participantIds[1]) === String(req.session.user.id);
}

router.get('/messages/:id', requireLogin, async (req, res) => {
  const convo = await Conversation.findById(req.params.id).lean();
  if (!convo) return res.status(404).render('404', { message: 'Conversation not found.' });
  if (!isParticipant(req, convo)) return res.status(403).render('404', { message: "You don't have access to this conversation." });

  const messages = await Message.find({ conversationId: convo._id }).sort({ sentAt: 1 }).lean();
  res.render('messages/conversation', {
    convo, messages, myId: req.session.user.id, isSeller: isSellerOfConversation(req, convo)
  });
});

router.post('/messages/:id/send', requireLogin, async (req, res) => {
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).render('404', { message: 'Conversation not found.' });
  if (!isParticipant(req, convo)) return res.status(403).render('404', { message: "You don't have access to this conversation." });

  const body = (req.body.body || '').trim();
  if (body) {
    await Message.create({
      conversationId: convo._id, senderId: req.session.user.id,
      senderSnapshot: { username: req.session.user.username }, body
    });
    convo.lastMessageAt = new Date();
    convo.lastMessagePreview = body.slice(0, 140);
    await convo.save();
  }
  res.redirect(`/messages/${convo._id}`);
});

// Seller-only: this is "closing the deal" — no separate offer/accept/decline
// object, the seller just confirms whatever price the chat settled on.
router.post('/messages/:id/confirm-price', requireLogin, async (req, res) => {
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).render('404', { message: 'Conversation not found.' });
  if (!convo.relatedProductId || !isSellerOfConversation(req, convo)) {
    return res.status(403).render('404', { message: "You don't have access to confirm a price on this conversation." });
  }

  const amount = Number(req.body.amount);
  if (amount > 0) {
    convo.negotiation = { agreedPrice: amount, confirmedAt: new Date() };
    const preview = `Confirmed price: ₫${amount.toLocaleString()}`;
    convo.lastMessageAt = new Date();
    convo.lastMessagePreview = preview;
    await convo.save();
    await Message.create({
      conversationId: convo._id, senderId: req.session.user.id,
      senderSnapshot: { username: req.session.user.username }, body: preview
    });
  }
  res.redirect(`/messages/${convo._id}`);
});

// No websockets/build step in this app — the conversation view polls this
// every few seconds while open instead.
router.get('/messages/:id/poll', requireLogin, async (req, res) => {
  const convo = await Conversation.findById(req.params.id).lean();
  if (!convo || !isParticipant(req, convo)) return res.status(403).json({ ok: false });
  const after = req.query.after ? new Date(req.query.after) : new Date(0);
  const messages = await Message.find({ conversationId: convo._id, sentAt: { $gt: after } }).sort({ sentAt: 1 }).lean();
  res.json({ ok: true, messages, agreedPrice: (convo.negotiation && convo.negotiation.agreedPrice) || null });
});

module.exports = router;
