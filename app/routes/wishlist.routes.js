const express = require('express');
const Wishlist = require('../models/wishlist.model');
const SavedSearch = require('../models/savedSearch.model');
const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const { requireLogin } = require('../middleware/auth.middleware');

// Wishlist module — independent of Cart internally; it only writes a Cart
// document when the user explicitly checks an item out, and does so with
// its own logic rather than importing cart.routes.
const router = express.Router();

router.get('/wishlist', requireLogin, async (req, res) => {
  const wishlist = await Wishlist.findOne({ userId: req.session.user.id }).lean();

  // Saved searches are read defensively: if that collection is ever
  // dropped, the wishlist page still renders the saved items fine.
  let savedSearches = [];
  try {
    savedSearches = await SavedSearch.find({ userId: req.session.user.id }).sort({ createdAt: -1 }).lean();
  } catch (e) { /* saved searches unavailable */ }

  res.render('wishlist/landing', { wishlist: wishlist || { items: [] }, savedSearches });
});

router.post('/api/wishlist/add', requireLogin, async (req, res) => {
  try {
    const { productId } = req.body;
    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ ok: false, message: 'Product not found.' });

    let wishlist = await Wishlist.findOne({ userId: req.session.user.id });
    if (!wishlist) wishlist = new Wishlist({ userId: req.session.user.id, items: [] });

    if (!wishlist.items.some(i => String(i.productId) === String(productId))) {
      wishlist.items.push({
        productId: product._id,
        productSnapshot: {
          title: product.title, image: product.images[0] || '', price: product.pricing.listPrice,
          sellerName: product.sellerSnapshot.username, availability: product.status
        },
        priceHistory: [{ price: product.pricing.listPrice }]
      });
      await wishlist.save();
    }
    res.json({ ok: true, itemCount: wishlist.items.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Could not save to wishlist.' });
  }
});

router.post('/api/wishlist/remove', requireLogin, async (req, res) => {
  try {
    const { productId } = req.body;
    await Wishlist.updateOne({ userId: req.session.user.id }, { $pull: { items: { productId } } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Could not remove item.' });
  }
});

// Move a saved item straight into the cart. If the Cart module has been
// removed this simply 404s on the redirect target — the wishlist item
// itself is untouched.
router.post('/wishlist/:productId/checkout', requireLogin, async (req, res) => {
  const { productId } = req.params;
  const wishlist = await Wishlist.findOne({ userId: req.session.user.id });
  const item = wishlist && wishlist.items.find(i => String(i.productId) === String(productId));
  if (!item) return res.redirect('/wishlist');

  try {
    let cart = await Cart.findOne({ userId: req.session.user.id });
    if (!cart) cart = new Cart({ userId: req.session.user.id, items: [] });
    cart.items.push({ productId: item.productId, productSnapshot: item.productSnapshot, quantity: 1 });
    await cart.save();
    res.redirect('/cart');
  } catch (e) {
    res.redirect('/wishlist');
  }
});

// --- Saved searches -------------------------------------------------------
// Matches the endpoints named in the Assignment 2 report: save the current
// marketplace filter for later, and list/remove saved searches. Own
// collection (SavedSearch), no relation to wishlist "items" at all.

router.post('/api/wishlist/search', requireLogin, async (req, res) => {
  try {
    const { q, category, condition, minPrice, maxPrice, label } = req.body;
    if (!q && !category && !condition && !minPrice && !maxPrice) {
      return res.status(400).json({ ok: false, message: 'Add at least one filter before saving a search.' });
    }
    const saved = await SavedSearch.create({
      userId: req.session.user.id,
      queryParams: { q, category, condition, minPrice: minPrice ? Number(minPrice) : undefined, maxPrice: maxPrice ? Number(maxPrice) : undefined },
      label: label || [q, category, condition].filter(Boolean).join(' · ') || 'All listings'
    });
    res.json({ ok: true, id: saved._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Could not save this search.' });
  }
});

router.get('/api/wishlist/searches', requireLogin, async (req, res) => {
  const searches = await SavedSearch.find({ userId: req.session.user.id }).sort({ createdAt: -1 }).lean();
  res.json({ ok: true, searches });
});

router.post('/api/wishlist/searches/:id/delete', requireLogin, async (req, res) => {
  try {
    await SavedSearch.deleteOne({ _id: req.params.id, userId: req.session.user.id });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
