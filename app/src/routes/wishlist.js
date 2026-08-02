const express = require('express');
const {
  Wishlist, Product, PriceHistory, SavedSearch, Category, Offer, User
} = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH, parseVND, isObjectId } = require('../utils/helpers');
const { getCart, addToCart } = require('../utils/pricing');

const router = express.Router();

async function getWishlist(userId) {
  let wl = await Wishlist.findOne({ userId });
  if (!wl) wl = await Wishlist.create({ userId, items: [] });
  return wl;
}

// ── Wishlist Landing (WL) ─────────────────────────────────────────
router.get('/', requireAuth, asyncH(async (req, res) => {
  const wl = await getWishlist(req.user._id);
  const ids = wl.items.map(i => i.productId).filter(Boolean);
  const products = ids.length
    ? await Product.find({ _id: { $in: ids } }).select('-minAcceptable').lean()
    : [];
  const byId = new Map(products.map(p => [String(p._id), p]));

  let rows = wl.items.map(item => {
    const p = byId.get(String(item.productId));
    return {
      item,
      product: p || null,
      // priceAtSave is an alerting baseline. The live price is what counts.
      priceDelta: p && item.priceAtSave != null ? p.price - item.priceAtSave : null,
      gone: !p || ['removed', 'sold', 'rejected'].includes(p.status)
    };
  });

  if (req.query.filter === 'drops') rows = rows.filter(r => r.priceDelta != null && r.priceDelta < 0);
  if (req.query.filter === 'available') rows = rows.filter(r => !r.gone);
  if (req.query.priority) rows = rows.filter(r => r.item.priority === req.query.priority);

  const sort = req.query.sort || 'newest';
  rows.sort((a, b) => {
    if (sort === 'price_asc') return (a.product?.price || 0) - (b.product?.price || 0);
    if (sort === 'price_desc') return (b.product?.price || 0) - (a.product?.price || 0);
    if (sort === 'drops') return (a.priceDelta ?? 0) - (b.priceDelta ?? 0);
    return new Date(b.item.addedAt) - new Date(a.item.addedAt);
  });

  res.render('wishlist/landing', {
    title: 'Wishlist',
    breadcrumb: 'Home / Wishlist',
    rows, sort,
    filter: req.query.filter || '',
    priority: req.query.priority || ''
  });
}));

// ── Add / remove ──────────────────────────────────────────────────
router.post('/add/:productId', requireAuth, asyncH(async (req, res) => {
  const product = await Product.findById(req.params.productId).lean();
  if (!product) {
    req.flash('error', 'That listing no longer exists.');
    return res.redirect('/products');
  }
  // A seller does not get price alerts on their own listing.
  if (String(product.sellerId) === String(req.user._id)) {
    req.flash('error', 'That is your own listing.');
    return res.redirect(`/products/${product.slug}`);
  }

  const wl = await getWishlist(req.user._id);
  if (wl.items.some(i => String(i.productId) === String(product._id))) {
    req.flash('error', 'Already on your wishlist.');
  } else if (wl.items.length >= 200) {
    req.flash('error', 'Your wishlist is full (200 items). Remove something first.');
  } else {
    wl.items.push({
      productId: product._id,
      priceAtSave: product.price,
      lowestSeenPrice: product.price,
      addedAt: new Date()
    });
    await wl.save();
    await Product.updateOne({ _id: product._id }, { $inc: { 'stats.wishlisted': 1 } });
    req.flash('success', 'Saved to your wishlist.');
  }
  res.redirect(req.body.returnTo || `/products/${product.slug}`);
}));

router.post('/item/:itemId/remove', requireAuth, asyncH(async (req, res) => {
  const wl = await getWishlist(req.user._id);
  const item = wl.items.id(req.params.itemId);
  if (item) {
    await Product.updateOne({ _id: item.productId }, { $inc: { 'stats.wishlisted': -1 } });
    wl.items.pull({ _id: item._id });
    await wl.save();
  }
  req.flash('success', 'Removed from your wishlist.');
  res.redirect('/wishlist');
}));

// ── Item Detail Page ──────────────────────────────────────────────
router.get('/item/:itemId', requireAuth, asyncH(async (req, res) => {
  const wl = await getWishlist(req.user._id);
  const item = wl.items.id(req.params.itemId);
  if (!item) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'That wishlist item is gone.' });
  }

  const product = await Product.findById(item.productId)
    .select('-minAcceptable')
    .populate('sellerId', 'username fullName sellerProfile')
    .lean();

  const history = product
    ? await PriceHistory.find({ productId: product._id }).sort({ createdAt: -1 }).limit(20).lean()
    : [];

  const acceptedOffer = product
    ? await Offer.findOne({
        productId: product._id, buyerId: req.user._id,
        status: 'accepted', settlement: 'cash_checkout', expiresAt: { $gt: new Date() }
      }).lean()
    : null;

  res.render('wishlist/item-detail', {
    title: product ? product.title : 'Saved item',
    breadcrumb: 'Home / Wishlist / Item Detail',
    item, product, history, acceptedOffer
  });
}));

router.post('/item/:itemId/notes', requireAuth, asyncH(async (req, res) => {
  const wl = await getWishlist(req.user._id);
  const item = wl.items.id(req.params.itemId);
  if (!item) return res.redirect('/wishlist');

  item.inspectionNotes = String(req.body.inspectionNotes || '').slice(0, 1000);
  if (['low', 'medium', 'high'].includes(req.body.priority)) item.priority = req.body.priority;
  item.alerts.onPriceDrop = req.body.onPriceDrop === 'on';
  item.alerts.onBackInStock = req.body.onBackInStock === 'on';
  item.alerts.onSimilarListing = req.body.onSimilarListing === 'on';
  const threshold = parseVND(req.body.priceThreshold);
  item.alerts.priceThreshold = threshold || undefined;
  item.tags = String(req.body.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 8);
  await wl.save();

  req.flash('success', 'Notes and alerts saved.');
  res.redirect(`/wishlist/item/${item._id}`);
}));

// ── Wishlist → Cart ───────────────────────────────────────────────
// Default is COPY, not move: emptying the cart must not silently destroy a
// saved item. The price is always re-resolved from the live listing.
router.post('/item/:itemId/to-cart', requireAuth, asyncH(async (req, res) => {
  const wl = await getWishlist(req.user._id);
  const item = wl.items.id(req.params.itemId);
  if (!item) return res.redirect('/wishlist');

  const product = await Product.findById(item.productId).lean();
  if (!product) {
    req.flash('error', 'That listing is no longer available.');
    return res.redirect('/wishlist');
  }

  const cart = await getCart(req.user._id);
  const result = await addToCart({
    cart, product, buyerId: req.user._id,
    quantity: Math.max(1, parseInt(req.body.quantity, 10) || 1),
    addedFrom: 'wishlist',
    wishlistItemId: item._id
  });

  if (!result.ok) {
    req.flash('error', result.message);
    return res.redirect('/wishlist');
  }

  item.movedToCartAt = new Date();
  // Removal on transfer is opt-in, never the default.
  if (req.body.removeAfter === 'on') {
    await Product.updateOne({ _id: item.productId }, { $inc: { 'stats.wishlisted': -1 } });
    wl.items.pull({ _id: item._id });
  }
  await wl.save();

  if (item.priceAtSave != null && item.priceAtSave !== product.price) {
    const dir = product.price < item.priceAtSave ? 'cheaper' : 'more expensive';
    req.flash('success', `Added to cart at the current price — ${dir} than when you saved it.`);
  } else {
    req.flash('success', 'Added to cart.');
  }
  res.redirect('/cart');
}));

router.post('/bulk-to-cart', requireAuth, asyncH(async (req, res) => {
  const ids = [].concat(req.body.itemId || []);
  if (!ids.length) {
    req.flash('error', 'Select at least one item.');
    return res.redirect('/wishlist');
  }
  const wl = await getWishlist(req.user._id);
  const cart = await getCart(req.user._id);

  let added = 0;
  const skipped = [];
  for (const id of ids) {
    const item = wl.items.id(id);
    if (!item) continue;
    const product = await Product.findById(item.productId).lean();
    if (!product) { skipped.push('a removed listing'); continue; }
    const result = await addToCart({
      cart, product, buyerId: req.user._id, quantity: 1,
      addedFrom: 'wishlist', wishlistItemId: item._id
    });
    if (result.ok) { added += 1; item.movedToCartAt = new Date(); }
    else skipped.push(product.title);
  }
  await wl.save();

  if (added) req.flash('success', `${added} item${added === 1 ? '' : 's'} added to your cart.`);
  if (skipped.length) req.flash('error', `Skipped: ${skipped.join(', ')}.`);
  res.redirect(added ? '/cart' : '/wishlist');
}));

// ── Saved Searches ────────────────────────────────────────────────
router.get('/saved-searches', requireAuth, asyncH(async (req, res) => {
  const [searches, categories] = await Promise.all([
    SavedSearch.find({ userId: req.user._id }).sort({ createdAt: -1 }).populate('query.categoryId', 'name').lean(),
    Category.find({ isActive: true }).sort({ displayOrder: 1 }).lean()
  ]);

  // Show a live match count next to each saved query.
  for (const s of searches) {
    const f = { status: 'active' };
    if (s.query.keywords) {
      const rx = new RegExp(String(s.query.keywords).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      f.$or = [{ title: rx }, { brand: rx }, { description: rx }];
    }
    if (s.query.categoryId) f.categoryPath = s.query.categoryId._id || s.query.categoryId;
    if (s.query.minPrice || s.query.maxPrice) {
      f.price = {};
      if (s.query.minPrice) f.price.$gte = s.query.minPrice;
      if (s.query.maxPrice) f.price.$lte = s.query.maxPrice;
    }
    if (s.query.province) f['location.province'] = s.query.province;
    s.liveMatches = await Product.countDocuments(f);
  }

  res.render('wishlist/saved-searches', {
    title: 'Saved Searches',
    breadcrumb: 'Home / Wishlist / Saved Searches',
    searches, categories
  });
}));

router.post('/saved-searches', requireAuth, asyncH(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (!name) {
    req.flash('error', 'Give the search a name.');
    return res.redirect('/wishlist/saved-searches');
  }
  await SavedSearch.create({
    userId: req.user._id,
    name,
    query: {
      keywords: String(req.body.keywords || '').trim(),
      categoryId: isObjectId(req.body.categoryId) ? req.body.categoryId : undefined,
      minPrice: parseVND(req.body.minPrice) || undefined,
      maxPrice: parseVND(req.body.maxPrice) || undefined,
      province: String(req.body.province || '').trim() || undefined,
      isNegotiable: req.body.isNegotiable === 'on' || undefined
    },
    alertFrequency: ['instant', 'daily', 'weekly', 'off'].includes(req.body.alertFrequency)
      ? req.body.alertFrequency : 'daily',
    isActive: true
  });
  req.flash('success', 'Search saved. You will be alerted when new listings match.');
  res.redirect('/wishlist/saved-searches');
}));

router.post('/saved-searches/:id/toggle', requireAuth, asyncH(async (req, res) => {
  const s = await SavedSearch.findOne({ _id: req.params.id, userId: req.user._id });
  if (s) { s.isActive = !s.isActive; await s.save(); }
  res.redirect('/wishlist/saved-searches');
}));

router.post('/saved-searches/:id/delete', requireAuth, asyncH(async (req, res) => {
  await SavedSearch.deleteOne({ _id: req.params.id, userId: req.user._id });
  req.flash('success', 'Saved search deleted.');
  res.redirect('/wishlist/saved-searches');
}));

module.exports = router;
