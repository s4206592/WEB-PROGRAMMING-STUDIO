const express = require('express');
const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const { requireLogin } = require('../middleware/auth.middleware');

// Shopping Cart module. Deleting this whole file + its one line in server.js
// removes the module cleanly — nothing else requires it to exist.
const router = express.Router();

router.get('/cart', requireLogin, async (req, res) => {
  const cart = await Cart.findOne({ userId: req.session.user.id }).lean();
  res.render('cart/cart', { cart: cart || { items: [] } });
});

router.post('/api/cart/add', requireLogin, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const product = await Product.findById(productId).lean();
    if (!product) return res.status(404).json({ ok: false, message: 'Product not found.' });
    if (product.status !== 'active') return res.status(409).json({ ok: false, message: 'This item is no longer available.' });

    let cart = await Cart.findOne({ userId: req.session.user.id });
    if (!cart) cart = new Cart({ userId: req.session.user.id, items: [] });

    const existing = cart.items.find(i => String(i.productId) === String(productId));
    if (existing) {
      existing.quantity += Number(quantity) || 1;
    } else {
      cart.items.push({
        productId: product._id,
        productSnapshot: {
          title: product.title, image: product.images[0] || '', price: product.pricing.listPrice,
          sellerId: product.sellerId, sellerName: product.sellerSnapshot.username
        },
        quantity: Number(quantity) || 1
      });
    }
    cart.updatedAt = new Date();
    await cart.save();
    res.json({ ok: true, itemCount: cart.items.reduce((n, i) => n + i.quantity, 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Could not add item to cart.' });
  }
});

router.post('/api/cart/update', requireLogin, async (req, res) => {
  const { productId, quantity } = req.body;
  const cart = await Cart.findOne({ userId: req.session.user.id });
  if (!cart) return res.json({ ok: false });
  const item = cart.items.find(i => String(i.productId) === String(productId));
  if (item) item.quantity = Math.max(1, Number(quantity) || 1);
  cart.updatedAt = new Date();
  await cart.save();
  res.json({ ok: true });
});

router.post('/api/cart/remove', requireLogin, async (req, res) => {
  const { productId } = req.body;
  await Cart.updateOne({ userId: req.session.user.id }, { $pull: { items: { productId } } });
  res.json({ ok: true });
});

module.exports = router;
