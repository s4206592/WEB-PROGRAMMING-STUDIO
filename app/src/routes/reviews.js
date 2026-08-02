const express = require('express');
const {
  Review, ReviewVote, Order, Product, User, ModerationReport, ActivityLog
} = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH } = require('../utils/helpers');
const { notify } = require('../utils/notify');

const router = express.Router();

/** Recompute the seller's headline rating from every published review. */
async function recomputeSellerRating(sellerId) {
  const rows = await Review.aggregate([
    { $match: { sellerId: sellerId, status: 'published' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }
  ]);
  const avg = rows[0] ? Math.round(rows[0].avg * 10) / 10 : 0;
  await User.updateOne({ _id: sellerId }, {
    $set: { 'sellerProfile.rating': avg, 'sellerProfile.ratingCount': rows[0]?.n || 0 }
  });
}

// ── Product Review (PR) page ──────────────────────────────────────
router.get('/new/:orderId/:itemId', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order || String(order.buyerId) !== String(req.user._id)) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such order.' });
  }
  const item = order.items.id(req.params.itemId);
  if (!item) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such item on that order.' });
  }

  // Eligibility: the line must be RECEIVED. Delivered is not enough — the
  // buyer confirms receipt, and that confirmation is what unlocks the review.
  if (item.itemStatus !== 'received') {
    req.flash('error', 'You can review an item once you have confirmed you received it.');
    return res.redirect(`/orders/${order._id}`);
  }
  const existing = await Review.findOne({ orderItemId: item._id });
  if (existing) {
    req.flash('error', 'You have already reviewed this item.');
    return res.redirect(`/products/${(await Product.findById(item.productId).select('slug').lean())?.slug || ''}`);
  }

  const product = await Product.findById(item.productId).select('title slug media').lean();
  res.render('review/product-review', {
    title: 'Write a Review',
    breadcrumb: `Home / My Orders / ${order.orderNumber} / Review`,
    order, item, product, errors: []
  });
}));

router.post('/new/:orderId/:itemId', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order || String(order.buyerId) !== String(req.user._id)) return res.redirect('/orders');
  const item = order.items.id(req.params.itemId);
  if (!item || item.itemStatus !== 'received') {
    req.flash('error', 'This item is not eligible for a review yet.');
    return res.redirect(`/orders/${order._id}`);
  }

  const rating = parseInt(req.body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) {
    req.flash('error', 'Choose a star rating from 1 to 5.');
    return res.redirect(`/reviews/new/${order._id}/${item._id}`);
  }

  const media = [].concat(req.body.mediaUrl || [])
    .map(u => String(u).trim()).filter(Boolean).slice(0, 6)
    .map((url, i) => ({
      url,
      type: /\.(mp4|webm|mov)$/i.test(url) ? 'video' : 'image',
      order: i
    }));

  const aspect = {};
  ['accuracy', 'condition', 'communication', 'shipping'].forEach(k => {
    const v = parseInt(req.body[k], 10);
    if (v >= 1 && v <= 5) aspect[k] = v;
  });

  let review;
  try {
    review = await Review.create({
      productId: item.productId,
      orderId: order._id,
      orderItemId: item._id,
      reviewerId: req.user._id,
      sellerId: item.sellerId,
      rating,
      title: String(req.body.title || '').slice(0, 120),
      comment: String(req.body.comment || '').slice(0, 2000),
      media,
      aspectRatings: aspect,
      isVerifiedPurchase: true,
      status: 'published'
    });
  } catch (err) {
    // The unique index on orderItemId is what actually stops duplicates.
    if (err.code === 11000) {
      req.flash('error', 'You have already reviewed this item.');
      return res.redirect(`/orders/${order._id}`);
    }
    throw err;
  }

  item.reviewId = review._id;
  await order.save();

  await Review.recomputeSummary(item.productId);
  await recomputeSellerRating(item.sellerId);

  await notify(item.sellerId, {
    type: 'review_received',
    title: 'New review on your listing',
    body: `${req.user.username} left a ${rating}-star review on ${item.title}.`,
    linkUrl: `/products/${(await Product.findById(item.productId).select('slug').lean())?.slug || ''}`,
    targetType: 'review', targetId: review._id
  });
  ActivityLog.create({
    userId: req.user._id, action: 'review_posted',
    targetType: 'review', targetId: review._id
  }).catch(() => {});

  const product = await Product.findById(item.productId).select('slug').lean();
  req.flash('success', 'Review published. Thanks for helping other buyers.');
  res.redirect(`/products/${product.slug}#reviews`);
}));

// ── Helpful votes ─────────────────────────────────────────────────
router.post('/:id/vote', requireAuth, asyncH(async (req, res) => {
  const value = req.body.value === 'down' ? -1 : 1;
  const review = await Review.findById(req.params.id);
  if (!review) return res.redirect('/products');

  if (String(review.reviewerId) === String(req.user._id)) {
    req.flash('error', 'You cannot vote on your own review.');
    return res.redirect(req.get('Referer') || '/products');
  }

  const existing = await ReviewVote.findOne({ reviewId: review._id, userId: req.user._id });
  if (existing) {
    if (existing.value === value) {
      await existing.deleteOne();                       // toggle off
      if (value === 1) review.helpfulCount = Math.max(0, review.helpfulCount - 1);
      else review.notHelpfulCount = Math.max(0, review.notHelpfulCount - 1);
    } else {
      existing.value = value;
      await existing.save();
      if (value === 1) {
        review.helpfulCount += 1;
        review.notHelpfulCount = Math.max(0, review.notHelpfulCount - 1);
      } else {
        review.notHelpfulCount += 1;
        review.helpfulCount = Math.max(0, review.helpfulCount - 1);
      }
    }
  } else {
    await ReviewVote.create({ reviewId: review._id, userId: req.user._id, value });
    if (value === 1) review.helpfulCount += 1;
    else review.notHelpfulCount += 1;
  }
  await review.save();
  res.redirect((req.get('Referer') || '/products') + '#reviews');
}));

// ── Seller reply ──────────────────────────────────────────────────
router.post('/:id/reply', requireAuth, asyncH(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review || String(review.sellerId) !== String(req.user._id)) {
    req.flash('error', 'Only the seller can reply to this review.');
    return res.redirect(req.get('Referer') || '/products');
  }
  review.sellerReply = { body: String(req.body.body || '').slice(0, 1000), repliedAt: new Date() };
  await review.save();

  await notify(review.reviewerId, {
    type: 'review_reply',
    title: 'The seller replied to your review',
    body: review.sellerReply.body.slice(0, 120),
    linkUrl: req.get('Referer') || '/products',
    targetType: 'review', targetId: review._id
  });

  req.flash('success', 'Reply posted.');
  res.redirect((req.get('Referer') || '/products') + '#reviews');
}));

// ── Report ────────────────────────────────────────────────────────
router.post('/:id/report', requireAuth, asyncH(async (req, res) => {
  try {
    await ModerationReport.create({
      reporterId: req.user._id,
      targetType: 'review',
      targetId: req.params.id,
      reason: req.body.reason || 'other',
      details: String(req.body.details || '').slice(0, 1000)
    });
    await Review.updateOne({ _id: req.params.id }, { $inc: { 'moderation.reportCount': 1 } });
    req.flash('success', 'Review reported.');
  } catch (err) {
    if (err.code === 11000) req.flash('error', 'You have already reported this review.');
    else throw err;
  }
  res.redirect(req.get('Referer') || '/products');
}));

module.exports = router;
