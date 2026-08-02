const express = require('express');
const {
  Offer, Product, Conversation, Message, User
} = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH, parseVND, formatVND, primaryImage, availableQty } = require('../utils/helpers');
const { notify } = require('../utils/notify');

const router = express.Router();

const OFFER_TTL_DAYS = 7;
const ACCEPTED_TTL_HOURS = 48;

/**
 * Resolve the single conversation for a (buyer, seller, listing) triple.
 * Upsert rather than create — two rapid clicks otherwise fork two threads
 * and the seller's inbox splits.
 */
async function resolveConversation({ buyerId, sellerId, product, context, offerId }) {
  const participantsKey = Conversation.buildKey(buyerId, sellerId);

  // participantsKey and productId are equality terms in the filter, so Mongo
  // already writes them on insert. Repeating them in $setOnInsert would be a
  // path conflict. An empty $set is also rejected, so only add it when needed.
  const update = {
    $setOnInsert: {
      participants: [buyerId, sellerId],
      context: context || 'listing',
      subject: product.title,
      thumbUrl: (product.media && product.media[0] && product.media[0].url) || null,
      status: 'open'
    }
  };
  if (offerId) update.$set = { offerId };

  return Conversation.findOneAndUpdate(
    { participantsKey, productId: product._id },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function systemMessage(conversationId, senderId, type, refId, amount, text) {
  const msg = await Message.create({
    conversationId, senderId, body: text,
    isSystem: true, systemEvent: { type, refId, amount }
  });
  await Conversation.updateOne({ _id: conversationId }, {
    $set: { lastMessage: { text, senderId, sentAt: new Date() } }
  });
  return msg;
}

// ── Offer inboxes ─────────────────────────────────────────────────
router.get('/', requireAuth, asyncH(async (req, res) => {
  const tab = req.query.tab === 'sent' ? 'sent' : 'received';
  const filter = tab === 'sent' ? { buyerId: req.user._id } : { sellerId: req.user._id };

  const offers = await Offer.find(filter)
    .sort({ updatedAt: -1 }).limit(100)
    .populate('productId', 'title slug media price status')
    .populate('buyerId', 'username fullName')
    .populate('sellerId', 'username fullName')
    .lean();

  res.render('offers/inbox', {
    title: 'Offers',
    breadcrumb: 'Home / Offers',
    offers, tab
  });
}));

// ── Make an offer ─────────────────────────────────────────────────
router.post('/product/:productId', requireAuth, asyncH(async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) {
    req.flash('error', 'That listing no longer exists.');
    return res.redirect('/products');
  }
  const back = `/products/${product.slug}`;

  // Self-interaction ban: you cannot offer on your own listing.
  if (String(product.sellerId) === String(req.user._id)) {
    req.flash('error', 'You cannot make an offer on your own listing.');
    return res.redirect(back);
  }
  if (product.status !== 'active') {
    req.flash('error', 'This listing is not accepting offers right now.');
    return res.redirect(back);
  }
  if (!product.isNegotiable) {
    req.flash('error', 'The seller has set a fixed price on this listing.');
    return res.redirect(back);
  }

  const cash = parseVND(req.body.cash);
  const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  const message = String(req.body.message || '').slice(0, 500);

  if (cash <= 0) {
    req.flash('error', 'Enter the amount you are offering.');
    return res.redirect(back);
  }
  if (quantity > availableQty(product)) {
    req.flash('error', `Only ${availableQty(product)} available.`);
    return res.redirect(back);
  }

  // Barter leg — the buyer's own active listings offered in trade.
  const tradeIds = [].concat(req.body.tradeItem || []).filter(Boolean);
  let items = [];
  if (tradeIds.length) {
    // Ownership guard: every offered item must belong to the buyer and be active.
    const owned = await Product.find({
      _id: { $in: tradeIds }, sellerId: req.user._id, status: 'active'
    }).lean();
    if (owned.length !== tradeIds.length) {
      req.flash('error', 'You can only offer items you own that are currently active.');
      return res.redirect(back);
    }
    items = owned.map(p => ({
      productId: p._id, title: p.title, imageUrl: primaryImage(p),
      condition: p.condition, quantity: 1, statedValue: p.price
    }));
  }

  const totalStatedValue = cash + items.reduce((n, i) => n + (i.statedValue || 0), 0);
  const consideration = { cash, items, totalStatedValue };
  const settlement = items.length ? 'trade' : 'cash_checkout';

  let offer;
  try {
    offer = await Offer.create({
      productId: product._id,
      buyerId: req.user._id,
      sellerId: product.sellerId,
      quantity,
      consideration,
      settlement,
      turn: 'seller',
      status: 'pending',
      expiresAt: new Date(Date.now() + OFFER_TTL_DAYS * 86400000),
      history: [{ actorId: req.user._id, action: 'offer', consideration, message, createdAt: new Date() }]
    });
  } catch (err) {
    if (err.code === 11000) {
      req.flash('error', 'You already have an open offer on this listing. Withdraw it before sending another.');
      return res.redirect(back);
    }
    throw err;
  }

  // Lock the barter items so the same camera cannot be offered into five trades.
  if (items.length) {
    await Product.updateMany({ _id: { $in: items.map(i => i.productId) } }, { $set: { status: 'reserved' } });
  }

  const conv = await resolveConversation({
    buyerId: req.user._id, sellerId: product.sellerId, product, context: 'offer', offerId: offer._id
  });
  offer.conversationId = conv._id;
  await offer.save();

  await systemMessage(conv._id, req.user._id, 'offer_made', offer._id, cash,
    `Offer: ${formatVND(cash)}${items.length ? ` + ${items.length} item(s) in trade` : ''}`);
  if (message) {
    await Message.create({ conversationId: conv._id, senderId: req.user._id, body: message });
  }

  await Product.updateOne({ _id: product._id }, { $inc: { 'stats.offers': 1 } });
  await notify(product.sellerId, {
    type: 'offer_received',
    title: 'New offer received',
    body: `${req.user.username} offered ${formatVND(cash)} for ${product.title}.`,
    linkUrl: `/offers/${offer._id}`,
    targetType: 'offer', targetId: offer._id
  });

  req.flash('success', 'Offer sent. The seller has been notified.');
  res.redirect(`/offers/${offer._id}`);
}));

// ── Offer thread ──────────────────────────────────────────────────
router.get('/:id', requireAuth, asyncH(async (req, res) => {
  const offer = await Offer.findById(req.params.id)
    .populate('productId', 'title slug media price status quantity quantitySold isNegotiable')
    .populate('buyerId', 'username fullName')
    .populate('sellerId', 'username fullName');
  if (!offer) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such offer.' });
  }
  const me = String(req.user._id);
  if (me !== String(offer.buyerId._id) && me !== String(offer.sellerId._id)) {
    return res.status(403).render('error', { title: 'Not allowed', status: 403, message: 'This offer is not yours.' });
  }

  const isSeller = me === String(offer.sellerId._id);
  const isOpen = ['pending', 'countered'].includes(offer.status);
  const myTurn = isOpen && ((offer.turn === 'seller' && isSeller) || (offer.turn === 'buyer' && !isSeller));

  const messages = offer.conversationId
    ? await Message.find({ conversationId: offer.conversationId }).sort({ createdAt: 1 }).limit(200)
        .populate('senderId', 'username').lean()
    : [];

  res.render('offers/thread', {
    title: 'Offer',
    breadcrumb: `Home / Offers / ${offer.productId?.title || 'Listing'}`,
    offer, isSeller, isOpen, myTurn, messages
  });
}));

// ── Counter ───────────────────────────────────────────────────────
router.post('/:id/counter', requireAuth, asyncH(async (req, res) => {
  const offer = await Offer.findById(req.params.id).populate('productId', 'title slug');
  if (!offer) return res.redirect('/offers');
  const me = String(req.user._id);
  const isSeller = me === String(offer.sellerId);
  if (me !== String(offer.buyerId) && !isSeller) {
    return res.status(403).render('error', { title: 'Not allowed', status: 403, message: 'Not your offer.' });
  }
  if (!['pending', 'countered'].includes(offer.status)) {
    req.flash('error', 'This negotiation is already closed.');
    return res.redirect(`/offers/${offer._id}`);
  }
  if ((offer.turn === 'seller') !== isSeller) {
    req.flash('error', 'It is the other side\'s turn to respond.');
    return res.redirect(`/offers/${offer._id}`);
  }
  if (offer.history.length >= 20) {
    req.flash('error', 'This negotiation has reached its 20-round limit. Accept, reject, or start again.');
    return res.redirect(`/offers/${offer._id}`);
  }

  const cash = parseVND(req.body.cash);
  if (cash <= 0) {
    req.flash('error', 'Enter a counter amount.');
    return res.redirect(`/offers/${offer._id}`);
  }
  const message = String(req.body.message || '').slice(0, 500);
  const consideration = {
    cash,
    items: offer.consideration.items,
    totalStatedValue: cash + offer.consideration.items.reduce((n, i) => n + (i.statedValue || 0), 0)
  };

  offer.consideration = consideration;
  offer.status = 'countered';
  offer.turn = isSeller ? 'buyer' : 'seller';
  offer.expiresAt = new Date(Date.now() + OFFER_TTL_DAYS * 86400000);
  offer.history.push({ actorId: req.user._id, action: 'counter', consideration, message, createdAt: new Date() });
  await offer.save();

  if (offer.conversationId) {
    await systemMessage(offer.conversationId, req.user._id, 'offer_countered', offer._id, cash,
      `Counter-offer: ${formatVND(cash)}`);
    if (message) await Message.create({ conversationId: offer.conversationId, senderId: req.user._id, body: message });
  }

  await notify(isSeller ? offer.buyerId : offer.sellerId, {
    type: 'offer_countered',
    title: 'Counter-offer received',
    body: `${req.user.username} countered at ${formatVND(cash)}.`,
    linkUrl: `/offers/${offer._id}`,
    targetType: 'offer', targetId: offer._id
  });

  req.flash('success', 'Counter-offer sent.');
  res.redirect(`/offers/${offer._id}`);
}));

// ── Accept ────────────────────────────────────────────────────────
// The atomic conditional update on `products` IS the lock. Checking
// availability with a separate findOne first would reopen the race.
router.post('/:id/accept', requireAuth, asyncH(async (req, res) => {
  const offer = await Offer.findById(req.params.id).populate('productId', 'title slug');
  if (!offer) return res.redirect('/offers');

  const me = String(req.user._id);
  const isSeller = me === String(offer.sellerId);
  if (me !== String(offer.buyerId) && !isSeller) {
    return res.status(403).render('error', { title: 'Not allowed', status: 403, message: 'Not your offer.' });
  }
  if (!['pending', 'countered'].includes(offer.status)) {
    req.flash('error', 'This offer is no longer open.');
    return res.redirect(`/offers/${offer._id}`);
  }
  // You accept the other side's terms, not your own.
  if ((offer.turn === 'seller') !== isSeller) {
    req.flash('error', 'You cannot accept your own terms — wait for the other side.');
    return res.redirect(`/offers/${offer._id}`);
  }

  const reservedUntil = new Date(Date.now() + ACCEPTED_TTL_HOURS * 3600000);

  // Step 1 — the guarded reservation. If this returns null, someone else won.
  const locked = await Product.findOneAndUpdate(
    { _id: offer.productId._id, status: 'active', quantity: { $gte: offer.quantity } },
    { $set: { status: 'reserved', reservedForOfferId: offer._id, reservedUntil } },
    { new: true }
  );
  if (!locked) {
    req.flash('error', 'That listing is no longer available — another buyer got there first.');
    return res.redirect(`/offers/${offer._id}`);
  }

  // Step 2 — freeze the terms. Checkout must honour these, never re-read the listing.
  offer.status = 'accepted';
  offer.acceptedConsideration = JSON.parse(JSON.stringify(offer.consideration));
  offer.acceptedAt = new Date();
  offer.expiresAt = reservedUntil;
  offer.history.push({ actorId: req.user._id, action: 'accept', consideration: offer.consideration, createdAt: new Date() });
  await offer.save();

  // Step 3 — auto-decline every rival thread on the same listing.
  const rivals = await Offer.find({
    productId: offer.productId._id,
    _id: { $ne: offer._id },
    status: { $in: ['pending', 'countered'] }
  }).lean();

  if (rivals.length) {
    await Offer.updateMany(
      { _id: { $in: rivals.map(r => r._id) } },
      { $set: { status: 'auto_declined', isAutoDeclined: true, autoDeclineReason: 'rival_accepted' } }
    );
    for (const r of rivals) {
      await notify(r.buyerId, {
        type: 'offer_rejected',
        title: 'Offer declined',
        body: `${offer.productId.title} was sold to another buyer. You may offer again if it is relisted.`,
        linkUrl: `/products/${offer.productId.slug}`,
        targetType: 'offer', targetId: r._id
      });
    }
  }

  if (offer.conversationId) {
    await systemMessage(offer.conversationId, req.user._id, 'offer_accepted', offer._id,
      offer.acceptedConsideration.cash, `Offer accepted at ${formatVND(offer.acceptedConsideration.cash)}`);
  }

  const other = isSeller ? offer.buyerId : offer.sellerId;
  await notify(other, {
    type: 'offer_accepted',
    title: 'Offer accepted',
    body: offer.settlement === 'trade'
      ? 'The trade was agreed. Arrange the swap in your messages.'
      : `Accepted at ${formatVND(offer.acceptedConsideration.cash)}. The buyer has 48 hours to check out.`,
    linkUrl: `/offers/${offer._id}`,
    targetType: 'offer', targetId: offer._id,
    priority: 'high'
  });

  req.flash('success', offer.settlement === 'trade'
    ? 'Trade agreed. Goods move off-platform — use the message thread to arrange it.'
    : 'Offer accepted. The buyer can now check out at the agreed price.');
  res.redirect(`/offers/${offer._id}`);
}));

// ── Reject / withdraw ─────────────────────────────────────────────
router.post('/:id/reject', requireAuth, asyncH(async (req, res) => {
  const offer = await Offer.findById(req.params.id).populate('productId', 'title slug');
  if (!offer) return res.redirect('/offers');
  const me = String(req.user._id);
  const isSeller = me === String(offer.sellerId);
  const isBuyer = me === String(offer.buyerId);
  if (!isSeller && !isBuyer) {
    return res.status(403).render('error', { title: 'Not allowed', status: 403, message: 'Not your offer.' });
  }
  if (!['pending', 'countered'].includes(offer.status)) {
    req.flash('error', 'This offer is already closed.');
    return res.redirect(`/offers/${offer._id}`);
  }

  offer.status = isBuyer ? 'withdrawn' : 'rejected';
  offer.history.push({
    actorId: req.user._id,
    action: isBuyer ? 'withdraw' : 'reject',
    consideration: offer.consideration,
    message: String(req.body.message || '').slice(0, 500),
    createdAt: new Date()
  });
  await offer.save();

  // Release any barter items this offer had locked.
  const ids = (offer.consideration.items || []).map(i => i.productId).filter(Boolean);
  if (ids.length) await Product.updateMany({ _id: { $in: ids }, status: 'reserved' }, { $set: { status: 'active' } });

  await notify(isBuyer ? offer.sellerId : offer.buyerId, {
    type: 'offer_rejected',
    title: isBuyer ? 'Offer withdrawn' : 'Offer declined',
    body: `${req.user.username} ${isBuyer ? 'withdrew their offer on' : 'declined your offer on'} ${offer.productId.title}.`,
    linkUrl: `/products/${offer.productId.slug}`,
    targetType: 'offer', targetId: offer._id
  });

  req.flash('success', isBuyer ? 'Offer withdrawn.' : 'Offer declined. The buyer can make a new one.');
  res.redirect(`/offers/${offer._id}`);
}));

module.exports = router;
