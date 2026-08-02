const express = require('express');
const { Product, Wishlist } = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH, availableQty } = require('../utils/helpers');
const { getCart, addToCart, revalidateCart } = require('../utils/pricing');

const router = express.Router();

// ── Shopping Cart (SC) ────────────────────────────────────────────
router.get('/', requireAuth, asyncH(async (req, res) => {
  const cart = await getCart(req.user._id);
  const { changed, blocking } = await revalidateCart(cart, req.user._id);

  // Group by seller — a multi-seller cart is normal on a P2P marketplace.
  const groups = new Map();
  for (const line of cart.items) {
    const key = String(line.sellerId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }
  const sellerIds = [...groups.keys()];
  const sellers = sellerIds.length
    ? await require('../models').User.find({ _id: { $in: sellerIds } }).select('username fullName').lean()
    : [];
  const sellerById = new Map(sellers.map(s => [String(s._id), s]));

  const products = cart.items.length
    ? await Product.find({ _id: { $in: cart.items.map(i => i.productId) } }).select('slug status').lean()
    : [];
  const slugById = new Map(products.map(p => [String(p._id), p.slug]));

  const subtotal = cart.items
    .filter(i => i.isAvailable)
    .reduce((n, i) => n + i.quantity * i.unitPrice, 0);

  res.render('cart/cart', {
    title: 'Shopping Cart',
    breadcrumb: 'Home / Shopping Cart',
    cart,
    groups: [...groups.entries()].map(([sid, lines]) => ({
      seller: sellerById.get(sid) || { username: 'Unknown seller' },
      lines
    })),
    slugById,
    subtotal, changed, blocking
  });
}));

// ── Add ───────────────────────────────────────────────────────────
router.post('/add/:productId', requireAuth, asyncH(async (req, res) => {
  const product = await Product.findById(req.params.productId).lean();
  if (!product) {
    req.flash('error', 'That listing no longer exists.');
    return res.redirect('/products');
  }
  const cart = await getCart(req.user._id);
  const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);

  const result = await addToCart({
    cart, product, buyerId: req.user._id, quantity,
    addedFrom: req.body.addedFrom || 'product_page'
  });

  req.flash(result.ok ? 'success' : 'error',
    result.ok && result.priceSource === 'negotiated'
      ? 'Added at your negotiated price.'
      : result.message);

  res.redirect(req.body.returnTo || (result.ok ? '/cart' : `/products/${product.slug}`));
}));

// ── Update quantity ───────────────────────────────────────────────
router.post('/:lineId/update', requireAuth, asyncH(async (req, res) => {
  const cart = await getCart(req.user._id);
  const line = cart.items.id(req.params.lineId);
  if (!line) return res.redirect('/cart');

  const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  const product = await Product.findById(line.productId).lean();
  if (!product || quantity > availableQty(product)) {
    req.flash('error', product ? `Only ${availableQty(product)} available.` : 'That listing is gone.');
    return res.redirect('/cart');
  }
  line.quantity = quantity;
  await cart.save();
  await revalidateCart(cart, req.user._id);   // re-price: a bulk tier may now apply
  res.redirect('/cart');
}));

// ── Remove ────────────────────────────────────────────────────────
router.post('/:lineId/remove', requireAuth, asyncH(async (req, res) => {
  const cart = await getCart(req.user._id);
  cart.items.pull({ _id: req.params.lineId });
  await cart.save();
  req.flash('success', 'Item removed from your cart.');
  res.redirect('/cart');
}));

// ── Save for later: cart → wishlist (the reverse transfer) ────────
router.post('/:lineId/save-for-later', requireAuth, asyncH(async (req, res) => {
  const cart = await getCart(req.user._id);
  const line = cart.items.id(req.params.lineId);
  if (!line) return res.redirect('/cart');

  const wishlist = await Wishlist.findOneAndUpdate(
    { userId: req.user._id },
    { $setOnInsert: { items: [] } },
    { upsert: true, new: true }
  );
  const already = wishlist.items.some(i => String(i.productId) === String(line.productId));
  if (!already) {
    wishlist.items.push({
      productId: line.productId,
      priceAtSave: line.unitPrice,
      lowestSeenPrice: line.unitPrice,
      addedAt: new Date()
    });
    await wishlist.save();
    await Product.updateOne({ _id: line.productId }, { $inc: { 'stats.wishlisted': 1 } });
  }
  cart.items.pull({ _id: line._id });
  await cart.save();

  req.flash('success', 'Moved to your wishlist.');
  res.redirect('/cart');
}));

// ── Empty ─────────────────────────────────────────────────────────
router.post('/clear', requireAuth, asyncH(async (req, res) => {
  const cart = await getCart(req.user._id);
  cart.items = [];
  await cart.save();
  req.flash('success', 'Cart emptied.');
  res.redirect('/cart');
}));

module.exports = router;
