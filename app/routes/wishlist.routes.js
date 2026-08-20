const express = require('express');
const Wishlist = require('../models/wishlist.model');
const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const { requireLogin } = require('../middleware/auth.middleware');

// Wishlist module — independent of Cart internally; it only writes a Cart
// document when the user explicitly checks an item out, and does so with
// its own logic rather than importing cart.routes.
const router = express.Router();

router.get('/wishlist', requireLogin, async (req, res) => {
  const wishlist = await Wishlist.findOne({ userId: req.session.user.id }).lean();
  res.render('wishlist/landing', { wishlist: wishlist || { items: [] } });
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
  const { productId } = req.body;
  await Wishlist.updateOne({ userId: req.session.user.id }, { $pull: { items: { productId } } });
  res.json({ ok: true });
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

module.exports = router;
