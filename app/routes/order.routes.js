const express = require('express');
const Cart = require('../models/cart.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const { requireLogin } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/checkout', requireLogin, async (req, res) => {
  const cart = await Cart.findOne({ userId: req.session.user.id }).lean();
  if (!cart || cart.items.length === 0) return res.redirect('/cart');
  res.render('checkout/checkout', { cart, error: null, negotiatedConversationId: null });
});

// Reads a chat conversation's confirmed price defensively (module-independence
// pattern: read another module's collection, never require it) and hands off
// into the same checkout view for that single item instead of the cart.
router.get('/messages/:id/checkout', requireLogin, async (req, res) => {
  let convo = null;
  try {
    const { Conversation } = require('../models/chat.model');
    convo = await Conversation.findById(req.params.id).lean();
  } catch (e) { /* chat module unavailable */ }

  if (!convo || !convo.relatedProductId || !convo.negotiation || !convo.negotiation.agreedPrice) {
    return res.status(404).render('404', { message: 'No confirmed price to check out on this conversation.' });
  }
  if (String(convo.participantIds[0]) !== String(req.session.user.id)) {
    return res.status(403).render('404', { message: "You don't have access to this conversation." });
  }
  const product = await Product.findById(convo.relatedProductId).lean();
  if (!product || product.status !== 'active') {
    return res.status(404).render('404', { message: 'That listing is no longer available.' });
  }

  const negotiatedCart = {
    items: [{
      productId: product._id,
      productSnapshot: {
        title: product.title, image: product.images[0] || '', price: convo.negotiation.agreedPrice,
        sellerId: product.sellerId, sellerName: product.sellerSnapshot.username
      },
      quantity: 1
    }]
  };
  res.render('checkout/checkout', { cart: negotiatedCart, error: null, negotiatedConversationId: convo._id });
});

// Cash on Delivery only. A cart can hold items from several sellers, but
// fulfillment (confirm/ship/deliver) is a per-seller action — so checkout
// splits the cart into one Order per seller, each shipped ₫30,000 flat,
// rather than one shared order no single seller fully controls.
router.post('/checkout', requireLogin, async (req, res) => {
  try {
    const { address, contactPhone, shippingMethod, negotiatedConversationId } = req.body;

    // Negotiated single-item checkout: re-derive the item from the
    // conversation's confirmed price server-side, never trust the form.
    let cart;
    if (negotiatedConversationId) {
      const { Conversation } = require('../models/chat.model');
      const convo = await Conversation.findById(negotiatedConversationId).lean();
      if (!convo || !convo.negotiation || !convo.negotiation.agreedPrice ||
          String(convo.participantIds[0]) !== String(req.session.user.id)) {
        return res.redirect('/messages');
      }
      const product = await Product.findById(convo.relatedProductId).lean();
      if (!product || product.status !== 'active') return res.redirect('/messages');
      cart = {
        items: [{
          productId: product._id,
          productSnapshot: { title: product.title, image: product.images[0] || '', price: convo.negotiation.agreedPrice, sellerId: product.sellerId, sellerName: product.sellerSnapshot.username }
        , quantity: 1 }]
      };
    } else {
      cart = await Cart.findOne({ userId: req.session.user.id }).lean();
    }

    if (!address || !contactPhone || !shippingMethod) {
      return res.render('checkout/checkout', { cart: cart || { items: [] }, error: 'Please complete delivery details.', negotiatedConversationId: negotiatedConversationId || null });
    }
    if (!cart || cart.items.length === 0) return res.redirect(negotiatedConversationId ? '/messages' : '/cart');

    const bySeller = new Map();
    cart.items.forEach(i => {
      const sellerId = String(i.productSnapshot.sellerId);
      if (!bySeller.has(sellerId)) bySeller.set(sellerId, []);
      bySeller.get(sellerId).push(i);
    });

    const shippingFee = 30000;
    const sellerGroups = Array.from(bySeller.values());
    const orders = [];
    for (let idx = 0; idx < sellerGroups.length; idx++) {
      const items = sellerGroups[idx];
      const subtotal = items.reduce((sum, i) => sum + i.productSnapshot.price * i.quantity, 0);
      const order = await Order.create({
        orderNumber: 'ST' + Date.now() + '-' + idx,
        buyerId: req.session.user.id,
        buyerSnapshot: { username: req.session.user.username, contact: { address, contactPhone } },
        items: items.map(i => ({
          productId: i.productId,
          productSnapshot: { title: i.productSnapshot.title, image: i.productSnapshot.image, sellerId: i.productSnapshot.sellerId, sellerName: i.productSnapshot.sellerName },
          quantity: i.quantity, priceAtPurchase: i.productSnapshot.price
        })),
        delivery: { address, contactPhone, shippingMethod },
        payment: { method: 'cod', status: 'pending' },
        totals: { subtotal, shippingFee, total: subtotal + shippingFee }
      });
      orders.push(order);

      // Open a buyer<->seller chat thread for this order right away, so
      // there's always a channel for shipping/return issues even if no
      // negotiation happened. Best-effort: checkout must still succeed if
      // the chat module is missing/removed.
      try {
        const { findOrCreateConversation } = require('../models/chat.model');
        await findOrCreateConversation({
          buyer: { id: req.session.user.id, username: req.session.user.username },
          seller: { id: items[0].productSnapshot.sellerId, username: items[0].productSnapshot.sellerName },
          relatedOrderId: order._id
        });
      } catch (e) { /* chat module unavailable — order still placed */ }
    }

    if (negotiatedConversationId) {
      // Closes the deal: clear the agreed price so "Checkout at ₫X" doesn't
      // linger on a conversation that's already turned into an order.
      try {
        const { Conversation, Message } = require('../models/chat.model');
        const convo = await Conversation.findById(negotiatedConversationId);
        if (convo) {
          convo.negotiation = { agreedPrice: null, confirmedAt: convo.negotiation && convo.negotiation.confirmedAt };
          convo.relatedOrderId = orders[0]._id;
          const preview = `Order #${orders[0].orderNumber} placed at the agreed price.`;
          convo.lastMessageAt = new Date();
          convo.lastMessagePreview = preview;
          await convo.save();
          await Message.create({
            conversationId: convo._id, senderId: req.session.user.id,
            senderSnapshot: { username: req.session.user.username }, body: preview
          });
        }
      } catch (e) { /* chat module unavailable */ }
    } else {
      await Cart.deleteOne({ userId: req.session.user.id });
    }

    if (orders.length === 1) return res.redirect(`/orders/${orders[0]._id}/confirmation`);
    res.redirect(`/orders/placed?ids=${orders.map(o => o._id).join(',')}`);
  } catch (err) {
    console.error(err);
    res.redirect('/cart');
  }
});

router.get('/orders/placed', requireLogin, async (req, res) => {
  const ids = (req.query.ids || '').split(',').filter(Boolean);
  const orders = await Order.find({ _id: { $in: ids }, buyerId: req.session.user.id }).lean();
  res.render('orders/placed-summary', { orders });
});

// Buyer's own order history — previously the only way to reach an order was
// the one-time redirect right after checkout.
router.get('/orders', requireLogin, async (req, res) => {
  const orders = await Order.find({ buyerId: req.session.user.id }).sort({ createdAt: -1 }).lean();
  res.render('orders/list', { orders });
});

function isOrderSeller(req, order) {
  if (!req.session.user) return false;
  return order.items.some(i => String(i.productSnapshot.sellerId) === String(req.session.user.id));
}

// Seller's incoming-orders dashboard — nothing like this existed before;
// sellers had zero visibility into orders containing their products.
router.get('/orders/selling', requireLogin, async (req, res) => {
  const orders = await Order.find({ 'items.productSnapshot.sellerId': req.session.user.id })
    .sort({ createdAt: -1 }).lean();
  res.render('orders/selling', { orders });
});

router.get('/orders/:id/confirmation', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id).lean();
  if (!order) return res.status(404).render('404', { message: 'Order not found.' });
  if (String(order.buyerId) !== String(req.session.user.id)) {
    return res.status(403).render('404', { message: "You don't have access to this order." });
  }
  res.render('orders/confirmation', { order });
});

router.get('/orders/:id/delivery', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id).lean();
  if (!order) return res.status(404).render('404', { message: 'Order not found.' });
  const isBuyer = String(order.buyerId) === String(req.session.user.id);
  const isSeller = isOrderSeller(req, order);
  if (!isBuyer && !isSeller) return res.status(403).render('404', { message: "You don't have access to this order." });
  res.render('orders/delivery-progress', { order, isSeller });
});

// --- Seller fulfillment actions -----------------------------------------
// Replaces the old buyer-facing "simulate next delivery step" button —
// the buyer has no delivery-status controls at all now. Shipping tracking
// stays manual (no carrier integration): the seller just confirms each
// stage really happened.

router.post('/orders/:id/confirm', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).render('404', { message: 'Order not found.' });
  if (!isOrderSeller(req, order)) return res.status(403).render('404', { message: "You don't have access to this order." });
  if (order.status !== 'placed') return res.redirect('/orders/selling');

  try {
    order.status = 'confirmed';
    order.deliveryMilestones.push({ stage: 'confirmed' });
    await order.save();

    // Confirming is what marks the item sold out — not checkout itself, since
    // nothing is guaranteed until the seller actually agrees to fulfill it.
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (!product) continue;
      product.quantityAvailable = Math.max(0, (product.quantityAvailable || 0) - item.quantity);
      if (product.quantityAvailable === 0) product.status = 'sold';
      await product.save();
    }
  } catch (err) { console.error(err); }
  res.redirect('/orders/selling');
});

router.post('/orders/:id/decline', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).render('404', { message: 'Order not found.' });
  if (!isOrderSeller(req, order)) return res.status(403).render('404', { message: "You don't have access to this order." });
  if (order.status === 'placed') {
    try {
      order.status = 'cancelled';
      order.deliveryMilestones.push({ stage: 'cancelled' });
      await order.save();
    } catch (err) { console.error(err); }
  }
  res.redirect('/orders/selling');
});

router.post('/orders/:id/ship', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).render('404', { message: 'Order not found.' });
  if (!isOrderSeller(req, order)) return res.status(403).render('404', { message: "You don't have access to this order." });
  if (order.status !== 'confirmed') return res.redirect('/orders/selling');
  try {
    order.status = 'shipped';
    order.deliveryMilestones.push({ stage: 'shipped' });
    await order.save();
  } catch (err) { console.error(err); }
  res.redirect('/orders/selling');
});

router.post('/orders/:id/mark-delivered', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).render('404', { message: 'Order not found.' });
  if (!isOrderSeller(req, order)) return res.status(403).render('404', { message: "You don't have access to this order." });
  if (order.status !== 'shipped') return res.redirect('/orders/selling');

  try {
    order.status = 'delivered';
    order.deliveryMilestones.push({ stage: 'delivered' });
    // Cash on Delivery: this is the real moment payment happens.
    order.payment.status = 'paid';
    const eligibleUntil = new Date();
    eligibleUntil.setDate(eligibleUntil.getDate() + 15);
    order.returnWindow = { deliveredAt: new Date(), eligibleUntil, disputeRaised: false };
    await order.save();
  } catch (err) { console.error(err); }
  res.redirect('/orders/selling');
});

module.exports = router;
