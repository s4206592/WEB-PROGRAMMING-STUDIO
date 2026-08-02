const express = require('express');
const {
  Product, Category, Review, ReviewVote, Offer, Wishlist, PriceHistory,
  ModerationReport, User
} = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH, parseVND, isObjectId } = require('../utils/helpers');

const router = express.Router();
const PER_PAGE = 12;

/** Build the Mongo filter for the Product Listing page from query params. */
function buildFilter(q) {
  const filter = { status: { $in: ['active', 'reserved'] } };

  if (q.q && String(q.q).trim()) {
    const rx = new RegExp(String(q.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { brand: rx }, { model: rx }, { description: rx }];
  }
  const cats = [].concat(q.category || []).filter(isObjectId);
  if (cats.length) filter.categoryPath = { $in: cats };

  if (q.condition === 'new') filter.isSecondhand = false;
  else if (q.condition === 'secondhand') filter.isSecondhand = true;

  const min = parseVND(q.minPrice);
  const max = parseVND(q.maxPrice);
  if (min || max) {
    filter.price = {};
    if (min) filter.price.$gte = min;
    if (max) filter.price.$lte = max;
  }
  if (q.province) filter['location.province'] = String(q.province);
  if (q.negotiable === 'on') filter.isNegotiable = true;
  if (q.type === 'wanted') filter.listingType = 'wanted';
  else if (q.type === 'sale') filter.listingType = 'sale';

  return filter;
}

const SORTS = {
  newest:   { publishedAt: -1, createdAt: -1 },
  oldest:   { createdAt: 1 },
  price_asc:  { price: 1 },
  price_desc: { price: -1 },
  rating:   { 'ratingSummary.average': -1, 'ratingSummary.count': -1 }
};

// ── Product Listing (PL) ──────────────────────────────────────────
router.get('/', asyncH(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const filter = buildFilter(req.query);
  const sortKey = SORTS[req.query.sort] ? req.query.sort : 'newest';

  const [products, total, categories] = await Promise.all([
    Product.find(filter).select('-minAcceptable')          // seller-private floor never leaves the server
      .sort(SORTS[sortKey]).skip((page - 1) * PER_PAGE).limit(PER_PAGE).lean(),
    Product.countDocuments(filter),
    Category.find({ isActive: true }).sort({ displayOrder: 1 }).lean()
  ]);

  const roots = categories.filter(c => !c.parentId);
  const byParent = {};
  categories.filter(c => c.parentId).forEach(c => {
    (byParent[c.parentId] = byParent[c.parentId] || []).push(c);
  });

  const qsExtra = Object.entries(req.query)
    .filter(([k]) => k !== 'page')
    .flatMap(([k, v]) => [].concat(v).map(x => `&${encodeURIComponent(k)}=${encodeURIComponent(x)}`))
    .join('');

  res.render('shared/product-listing', {
    title: 'Product Listing',
    breadcrumb: 'Home / Product Listing',
    products, total, roots, byParent,
    selectedCats: [].concat(req.query.category || []).map(String),
    sortKey,
    page, totalPages: Math.max(1, Math.ceil(total / PER_PAGE)),
    baseUrl: '/products', qsExtra
  });
}));

// ── Similar Listing Page (Wishlist module) ────────────────────────
// Derived at query time — no collection of its own. Weighted score:
// same category 40 · price within ±25% 30 · same brand 20 · same condition 10.
router.get('/:slug/similar', asyncH(async (req, res) => {
  const source = await Product.findOne({ slug: req.params.slug }).lean();
  if (!source) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such listing.' });
  }

  const lo = Math.floor(source.price * 0.6);
  const hi = Math.ceil(source.price * 1.6);
  const pool = await Product.find({
    _id: { $ne: source._id },
    status: 'active',
    $or: [
      { categoryPath: { $in: source.categoryPath || [] } },
      { brand: source.brand || '\u0000' },
      { price: { $gte: lo, $lte: hi } }
    ]
  }).select('-minAcceptable').limit(60).lean();

  const scored = pool.map(p => {
    let score = 0;
    const shareCat = (p.categoryPath || []).some(c => (source.categoryPath || []).some(s => String(s) === String(c)));
    if (String(p.categoryId) === String(source.categoryId)) score += 40;
    else if (shareCat) score += 25;

    if (source.price > 0) {
      const delta = Math.abs(p.price - source.price) / source.price;
      if (delta <= 0.25) score += 30;
      else if (delta <= 0.5) score += 15;
    }
    if (source.brand && p.brand && p.brand.toLowerCase() === source.brand.toLowerCase()) score += 20;
    if (p.condition === source.condition) score += 10;
    score += Math.min(10, (p.ratingSummary?.average || 0) * 2);
    return { ...p, matchScore: Math.round(score) };
  }).filter(p => p.matchScore >= 25)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 12);

  res.render('wishlist/similar-listings', {
    title: 'Similar Listings',
    breadcrumb: `Home / Product Listing / ${source.title} / Similar Listings`,
    source, matches: scored
  });
}));

// ── Individual Product (IP) ───────────────────────────────────────
router.get('/:slug', asyncH(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug })
    .populate('sellerId', 'username fullName avatarUrl sellerProfile createdAt')
    .populate('categoryId', 'name slug');
  if (!product || product.status === 'removed') {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'This listing is no longer available.' });
  }

  const sortMap = {
    newest: { createdAt: -1 },
    highest: { rating: -1, createdAt: -1 },
    lowest: { rating: 1, createdAt: -1 },
    helpful: { helpfulCount: -1, createdAt: -1 }
  };
  const reviewSort = sortMap[req.query.reviewSort] ? req.query.reviewSort : 'newest';

  const [reviews, myOffer, inWishlist, priceHistory] = await Promise.all([
    Review.find({ productId: product._id, status: 'published' })
      .sort(sortMap[reviewSort]).limit(20)
      .populate('reviewerId', 'username fullName avatarUrl').lean(),
    req.user
      ? Offer.findOne({ productId: product._id, buyerId: req.user._id, status: { $in: ['pending', 'countered', 'accepted'] } }).lean()
      : null,
    req.user
      ? Wishlist.exists({ userId: req.user._id, 'items.productId': product._id })
      : false,
    PriceHistory.find({ productId: product._id }).sort({ createdAt: -1 }).limit(10).lean()
  ]);

  // Public offer activity — amounts only, never who made them.
  const offerStats = await Offer.aggregate([
    { $match: { productId: product._id, status: { $in: ['pending', 'countered'] } } },
    { $group: { _id: null, n: { $sum: 1 }, highest: { $max: '$consideration.cash' } } }
  ]);

  let myVotes = {};
  if (req.user && reviews.length) {
    const votes = await ReviewVote.find({
      userId: req.user._id, reviewId: { $in: reviews.map(r => r._id) }
    }).lean();
    votes.forEach(v => { myVotes[String(v.reviewId)] = v.value; });
  }

  Product.updateOne({ _id: product._id }, { $inc: { 'stats.views': 1 } }).catch(() => {});

  const isOwner = req.user && String(product.sellerId._id) === String(req.user._id);
  const obj = product.toObject({ virtuals: true });
  if (!isOwner) delete obj.minAcceptable;   // never send the seller's floor to a buyer

  res.render('shared/individual-product', {
    title: product.title,
    breadcrumb: `Home / Product Listing / ${product.title}`,
    product: obj,
    seller: product.sellerId,
    reviews, reviewSort, myVotes,
    myOffer, inWishlist: !!inWishlist, isOwner,
    priceHistory,
    offerCount: offerStats[0]?.n || 0,
    offerHighest: offerStats[0]?.highest || 0
  });
}));

// ── Report a listing ──────────────────────────────────────────────
router.post('/:id/report', requireAuth, asyncH(async (req, res) => {
  try {
    await ModerationReport.create({
      reporterId: req.user._id,
      targetType: 'product',
      targetId: req.params.id,
      reason: req.body.reason || 'other',
      details: String(req.body.details || '').slice(0, 1000)
    });
    req.flash('success', 'Report submitted. A moderator will review it.');
  } catch (err) {
    if (err.code === 11000) req.flash('error', 'You have already reported this listing.');
    else throw err;
  }
  res.redirect(req.get('Referer') || `/products`);
}));

module.exports = router;
