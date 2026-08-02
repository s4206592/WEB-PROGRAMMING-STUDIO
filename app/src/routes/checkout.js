const express = require('express');
const {
  Product, Order, Offer, Wishlist, Payment, Delivery, ActivityLog
} = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH, orderNumber } = require('../utils/helpers');
const { getCart, revalidateCart } = require('../utils/pricing');
const { notify } = require('../utils/notify');

const router = express.Router();

const SHIPPING = { standard: 30000, express: 60000, pickup: 0 };

function draft(req) {
  if (!req.session.checkout) req.session.checkout = {};
  return req.session.checkout;
}

async function loadLiveCart(req) {
  const cart = await getCart(req.user._id);
  const { blocking } = await revalidateCart(cart, req.user._id);
  const lines = cart.items.filter(i => i.isAvailable);
  const subtotal = lines.reduce((n, i) => n + i.quantity * i.unitPrice, 0);
  return { cart, lines, subtotal, blocking };
}

// ── Step 1: Delivery Information ──────────────────────────────────
router.get('/delivery', requireAuth, asyncH(async (req, res) => {
  const { lines } = await loadLiveCart(req);
  if (!lines.length) {
    req.flash('error', 'Your cart is empty.');
    return res.redirect('/cart');
  }
  res.render('cart/checkout-delivery', {
    title: 'Checkout — Delivery',
    breadcrumb: 'Home / Shopping Cart / Checkout / Delivery',
    addresses: req.user.addresses,
    draft: draft(req),
    step: 1
  });
}));

router.post('/delivery', requireAuth, asyncH(async (req, res) => {
  const d = draft(req);
  let info;

  if (req.body.savedAddressId) {
    const a = req.user.addresses.id(req.body.savedAddressId);
    if (!a) {
      req.flash('error', 'That saved address no longer exists.');
      return res.redirect('/checkout/delivery');
    }
    info = {
      recipient: a.recipient, phone: a.phone, line1: a.line1,
      ward: a.ward, district: a.district, province: a.province, country: a.country || 'VN'
    };
  } else {
    info = {
      recipient: String(req.body.recipient || '').trim(),
      phone: String(req.body.phone || '').trim(),
      line1: String(req.body.line1 || '').trim(),
      ward: String(req.body.ward || '').trim(),
      district: String(req.body.district || '').trim(),
      province: String(req.body.province || '').trim(),
      country: 'VN'
    };
    if (!info.recipient || !info.phone || !info.line1 || !info.province) {
      req.flash('error', 'Recipient, phone, street address and province are all required.');
      return res.redirect('/checkout/delivery');
    }
  }

  info.method = ['standard', 'express', 'pickup'].includes(req.body.method) ? req.body.method : 'standard';
  info.notes = String(req.body.notes || '').slice(0, 500);
  d.deliveryInfo = info;
  res.redirect('/checkout/payment');
}));

// ── Step 2: Payment Information (simulated) ───────────────────────
router.get('/payment', requireAuth, asyncH(async (req, res) => {
  const d = draft(req);
  if (!d.deliveryInfo) return res.redirect('/checkout/delivery');
  const { lines } = await loadLiveCart(req);
  if (!lines.length) return res.redirect('/cart');

  res.render('cart/checkout-payment', {
    title: 'Checkout — Payment',
    breadcrumb: 'Home / Shopping Cart / Checkout / Payment',
    draft: d, step: 2
  });
}));

router.post('/payment', requireAuth, asyncH(async (req, res) => {
  const d = draft(req);
  if (!d.deliveryInfo) return res.redirect('/checkout/delivery');

  const method = ['cod', 'bank_transfer', 'card_sim'].includes(req.body.method) ? req.body.method : 'cod';
  // Simulated only. Nothing resembling a real card number is ever stored:
  // we keep the last four digits the user typed and discard the rest.
  let maskedRef = null;
  if (method === 'card_sim') {
    const digits = String(req.body.cardNumber || '').replace(/\D/g, '');
    if (digits.length < 12) {
      req.flash('error', 'Enter a (fake) card number of at least 12 digits — this is a simulated payment.');
      return res.redirect('/checkout/payment');
    }
    maskedRef = `**** **** **** ${digits.slice(-4)}`;
  }
  d.paymentInfo = { method, maskedRef };
  res.redirect('/checkout/review');
}));

// ── Step 3: Review Order ──────────────────────────────────────────
router.get('/review', requireAuth, asyncH(async (req, res) => {
  const d = draft(req);
  if (!d.deliveryInfo) return res.redirect('/checkout/delivery');
  if (!d.paymentInfo) return res.redirect('/checkout/payment');

  const { lines, subtotal, blocking } = await loadLiveCart(req);
  if (!lines.length) return res.redirect('/cart');

  const shippingFee = d.deliveryInfo.method === 'pickup'
    ? 0
    : SHIPPING[d.deliveryInfo.method] || SHIPPING.standard;

  res.render('cart/checkout-review', {
    title: 'Checkout — Review Order',
    breadcrumb: 'Home / Shopping Cart / Checkout / Review Order',
    draft: d, lines, subtotal, shippingFee,
    grandTotal: subtotal + shippingFee,
    blocking, step: 3
  });
}));

// ── Place Order ───────────────────────────────────────────────────
router.post('/place', requireAuth, asyncH(async (req, res) => {
  const d = draft(req);
  if (!d.deliveryInfo || !d.paymentInfo) return res.redirect('/checkout/delivery');

  const { cart, lines, subtotal, blocking } = await loadLiveCart(req);
  if (!lines.length) {
    req.flash('error', 'Your cart is empty.');
    return res.redirect('/cart');
  }
  // Revalidation at Place Order, not just on cart load.
  if (blocking) {
    req.flash('error', 'Something in your cart changed. Check the highlighted lines before ordering.');
    return res.redirect('/cart');
  }

  // Stock decrement via a conditional update: if modifiedCount is 0 the
  // listing sold out between the review page and this click.
  const claimed = [];
  for (const line of lines) {
    const upd = await Product.updateOne(
      { _id: line.productId, status: { $in: ['active', 'reserved'] }, $expr: { $gte: [{ $subtract: ['$quantity', '$quantitySold'] }, line.quantity] } },
      { $inc: { quantitySold: line.quantity } }
    );
    if (upd.modifiedCount === 0) {
      // Roll back everything already claimed in this pass.
      for (const c of claimed) {
        await Product.updateOne({ _id: c.productId }, { $inc: { quantitySold: -c.quantity } });
      }
      req.flash('error', `"${line.titleSnapshot}" sold out while you were checking out. It has been left in your cart.`);
      return res.redirect('/cart');
    }
    claimed.push({ productId: line.productId, quantity: line.quantity });
  }

  // Mark anything now fully sold.
  for (const c of claimed) {
    await Product.updateOne(
      { _id: c.productId, $expr: { $lte: [{ $subtract: ['$quantity', '$quantitySold'] }, 0] } },
      { $set: { status: 'sold' } }
    );
  }

  const shippingFee = d.deliveryInfo.method === 'pickup' ? 0 : (SHIPPING[d.deliveryInfo.method] || SHIPPING.standard);
  const grandTotal = subtotal + shippingFee;

  // orderNumber is human-facing and unique-indexed. A count is racy under
  // concurrent checkouts, so retry on the duplicate-key error rather than 500.
  let order = null;
  let seq = await Order.countDocuments() + 1;
  const buildOrder = (number) => ({
    orderNumber: number,
    orderType: 'purchase',
    buyerId: req.user._id,
    items: lines.map(l => ({
      productId: l.productId,
      sellerId: l.sellerId,
      title: l.titleSnapshot,
      imageUrl: l.imageSnapshot,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.quantity * l.unitPrice,
      offerId: l.offerId,
      itemStatus: 'pending'
    })),
    deliveryInfo: d.deliveryInfo,
    paymentInfo: {
      method: d.paymentInfo.method,
      maskedRef: d.paymentInfo.maskedRef,
      status: d.paymentInfo.method === 'cod' ? 'auto_confirmed' : 'unpaid',
      confirmationMethod: d.paymentInfo.method === 'cod' ? 'cod_none' : 'seller_manual'
    },
    totals: { subtotal, shippingFee, discount: 0, tax: 0, grandTotal },
    // COD needs no upfront confirmation, so delivery unlocks immediately.
    status: d.paymentInfo.method === 'cod' ? 'payment_confirmed' : 'awaiting_payment',
    statusHistory: [{ status: 'placed', byUserId: req.user._id, at: new Date() }],
    returnWindow: { status: 'not_open' },
    placedAt: new Date()
  });

  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    try {
      order = await Order.create(buildOrder(orderNumber(seq + attempt)));
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  if (!order) {
    req.flash('error', 'Could not create the order — try again in a moment.');
    return res.redirect('/cart');
  }

  await Payment.create({
    orderId: order._id,
    userId: req.user._id,
    sellerId: lines[0].sellerId,
    direction: 'charge',
    amount: grandTotal,
    method: order.paymentInfo.method,
    status: order.paymentInfo.method === 'cod' ? 'pending' : 'pending',
    reference: order.orderNumber
  });

  // COD: delivery starts straight away. Everything else waits for the seller
  // to confirm the payment actually landed.
  if (order.paymentInfo.method === 'cod') {
    await createDeliveries(order, req.user._id);
  }

  // Mark converted offers.
  const offerIds = lines.map(l => l.offerId).filter(Boolean);
  if (offerIds.length) {
    await Offer.updateMany({ _id: { $in: offerIds } }, { $set: { status: 'converted', orderId: order._id } });
  }

  // Stamp any wishlist copy of these products instead of deleting it.
  await Wishlist.updateOne(
    { userId: req.user._id },
    { $set: { 'items.$[el].purchasedAt': new Date() } },
    { arrayFilters: [{ 'el.productId': { $in: lines.map(l => l.productId) } }] }
  ).catch(() => {});

  // Empty the ordered lines out of the cart.
  const orderedIds = lines.map(l => String(l._id));
  cart.items = cart.items.filter(i => !orderedIds.includes(String(i._id)));
  await cart.save();
  delete req.session.checkout;

  // Notify every seller in the order.
  const sellers = [...new Set(order.items.map(i => String(i.sellerId)))];
  for (const sid of sellers) {
    await notify(sid, {
      type: 'order_placed',
      title: 'You have a new order',
      body: `Order ${order.orderNumber} from ${req.user.username}.`,
      linkUrl: `/orders/${order._id}`,
      targetType: 'order', targetId: order._id,
      priority: 'high'
    });
  }
  ActivityLog.create({
    userId: req.user._id, action: 'order_placed',
    targetType: 'order', targetId: order._id
  }).catch(() => {});

  res.redirect(`/orders/${order._id}/confirmation`);
}));

/**
 * Delivery gate: a deliveries document must not exist until payment is
 * confirmed (or the method is COD, where there is nothing to confirm).
 * One delivery per seller sub-order.
 */
async function createDeliveries(order, actorId) {
  const bySeller = new Map();
  order.items.forEach(i => {
    const k = String(i.sellerId);
    if (!bySeller.has(k)) bySeller.set(k, []);
    bySeller.get(k).push(i._id);
  });

  for (const [sellerId, itemIds] of bySeller) {
    const existing = await Delivery.findOne({ orderId: order._id, sellerId });
    if (existing) continue;
    await Delivery.create({
      orderId: order._id,
      sellerId,
      orderItemIds: itemIds,
      currentStatus: 'confirmed',
      milestones: [{ code: 'confirmed', label: 'Order confirmed', occurredAt: new Date(), byUserId: actorId }]
    });
  }
  await Order.updateOne(
    { _id: order._id },
    { $set: { status: 'confirmed', 'items.$[].itemStatus': 'confirmed' },
      $push: { statusHistory: { status: 'confirmed', note: 'Delivery unlocked', byUserId: actorId, at: new Date() } } }
  );
}

module.exports = router;
module.exports.createDeliveries = createDeliveries;
