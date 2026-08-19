const express = require('express');
const Cart = require('../models/cart.model');
const Order = require('../models/order.model');
const { requireLogin } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/checkout', requireLogin, async (req, res) => {
  const cart = await Cart.findOne({ userId: req.session.user.id }).lean();
  if (!cart || cart.items.length === 0) return res.redirect('/cart');
  res.render('checkout/checkout', { cart, error: null });
});

router.post('/checkout', requireLogin, async (req, res) => {
  try {
    const { address, contactPhone, shippingMethod, paymentMethod } = req.body;
    if (!address || !contactPhone || !shippingMethod) {
      const cart = await Cart.findOne({ userId: req.session.user.id }).lean();
      return res.render('checkout/checkout', { cart, error: 'Please complete delivery and payment details.' });
    }
    const cart = await Cart.findOne({ userId: req.session.user.id }).lean();
    if (!cart || cart.items.length === 0) return res.redirect('/cart');

    const subtotal = cart.items.reduce((sum, i) => sum + i.productSnapshot.price * i.quantity, 0);
    const shippingFee = 30000;
    const order = await Order.create({
      orderNumber: 'ST' + Date.now(),
      buyerId: req.session.user.id,
      buyerSnapshot: { username: req.session.user.username, contact: { address, contactPhone } },
      items: cart.items.map(i => ({
        productId: i.productId,
        productSnapshot: { title: i.productSnapshot.title, image: i.productSnapshot.image, sellerId: i.productSnapshot.sellerId, sellerName: i.productSnapshot.sellerName },
        quantity: i.quantity, priceAtPurchase: i.productSnapshot.price
      })),
      delivery: { address, contactPhone, shippingMethod },
      payment: { method: paymentMethod || 'Cash on delivery (simulated)', status: 'paid' },
      totals: { subtotal, shippingFee, total: subtotal + shippingFee },
      deliveryMilestones: [{ stage: 'confirmed' }]
    });

    await Cart.deleteOne({ userId: req.session.user.id });
    res.redirect(`/orders/${order._id}/confirmation`);
  } catch (err) {
    console.error(err);
    res.redirect('/cart');
  }
});

router.get('/orders/:id/confirmation', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id).lean();
  if (!order) return res.status(404).render('404', { message: 'Order not found.' });
  res.render('orders/confirmation', { order });
});

router.get('/orders/:id/delivery', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id).lean();
  if (!order) return res.status(404).render('404', { message: 'Order not found.' });
  res.render('orders/delivery-progress', { order });
});

// Demo-only: since there is no real shipping carrier integration, the
// buyer can step the order through its milestones to see the PD flow work
// end-to-end (and unlock the review step on "received").
const STAGES = ['confirmed', 'shipped', 'delivered', 'received'];
router.post('/orders/:id/advance', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ ok: false });
  const currentIndex = STAGES.indexOf(order.status === 'placed' ? 'confirmed' : order.status);
  const next = STAGES[Math.min(currentIndex + 1, STAGES.length - 1)];
  order.status = next;
  order.deliveryMilestones.push({ stage: next });
  if (next === 'delivered') {
    const eligibleUntil = new Date();
    eligibleUntil.setDate(eligibleUntil.getDate() + 15);
    order.returnWindow = { deliveredAt: new Date(), eligibleUntil, disputeRaised: false };
  }
  await order.save();
  res.json({ ok: true, status: order.status });
});

module.exports = router;
