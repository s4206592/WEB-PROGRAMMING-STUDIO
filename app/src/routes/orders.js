const express = require('express');
const {
  Order, Delivery, Payment, Product, Review, Dispute, User, ActivityLog
} = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH } = require('../utils/helpers');
const { notify } = require('../utils/notify');
const { createDeliveries } = require('./checkout');

const router = express.Router();

const RETURN_WINDOW_DAYS = 15;

function isBuyer(order, user) { return String(order.buyerId) === String(user._id); }
function isSeller(order, user) { return order.items.some(i => String(i.sellerId) === String(user._id)); }
function canSee(order, user) {
  return isBuyer(order, user) || isSeller(order, user) || user.roles.includes('admin');
}

// ── My orders ─────────────────────────────────────────────────────
router.get('/', requireAuth, asyncH(async (req, res) => {
  const orders = await Order.find({ buyerId: req.user._id }).sort({ placedAt: -1 }).limit(50).lean();
  res.render('cart/my-orders', {
    title: 'My Orders',
    breadcrumb: 'Home / My Orders',
    orders
  });
}));

// ── Seller order queue ────────────────────────────────────────────
router.get('/sales', requireAuth, asyncH(async (req, res) => {
  const orders = await Order.find({ 'items.sellerId': req.user._id }).sort({ placedAt: -1 }).limit(50)
    .populate('buyerId', 'username fullName').lean();
  res.render('cart/my-sales', {
    title: 'Sales',
    breadcrumb: 'Home / My Orders / Sales',
    orders, meId: String(req.user._id)
  });
}));

// ── Order Confirmation (OC) ───────────────────────────────────────
router.get('/:id/confirmation', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.id).lean();
  if (!order || !canSee(order, req.user)) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such order.' });
  }
  res.render('cart/order-confirmation', {
    title: 'Order Confirmation',
    breadcrumb: `Home / My Orders / ${order.orderNumber}`,
    order
  });
}));

// ── Product Delivery Progress (PD) ────────────────────────────────
router.get('/:id', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('buyerId', 'username fullName phone');
  if (!order || !canSee(order, req.user)) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such order.' });
  }

  const [deliveries, sellers, reviews] = await Promise.all([
    Delivery.find({ orderId: order._id }).lean(),
    User.find({ _id: { $in: order.items.map(i => i.sellerId) } }).select('username fullName').lean(),
    Review.find({ orderId: order._id }).lean()
  ]);
  const sellerById = new Map(sellers.map(s => [String(s._id), s]));
  const reviewedItems = new Set(reviews.map(r => String(r.orderItemId)));

  res.render('cart/delivery-progress', {
    title: 'Delivery Progress',
    breadcrumb: `Home / My Orders / ${order.orderNumber}`,
    order: order.toObject({ virtuals: true }),
    deliveries, sellerById, reviewedItems,
    viewerIsBuyer: isBuyer(order, req.user),
    viewerIsSeller: isSeller(order, req.user),
    meId: String(req.user._id),
    RETURN_WINDOW_DAYS
  });
}));

// ── Buyer: "I've transferred the money" ───────────────────────────
router.post('/:id/mark-paid', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || !isBuyer(order, req.user)) return res.redirect('/orders');
  if (order.paymentInfo.status !== 'unpaid') {
    req.flash('error', 'That payment has already been submitted.');
    return res.redirect(`/orders/${order._id}`);
  }

  order.paymentInfo.status = 'submitted_by_buyer';
  order.paymentInfo.buyerMarkedPaidAt = new Date();
  const proofUrl = String(req.body.proofUrl || '').trim();
  if (proofUrl) order.paymentInfo.buyerProof.push({ url: proofUrl, uploadedAt: new Date() });
  // Seller silence past this point escalates to admin — never auto-confirms.
  order.paymentInfo.confirmationDueAt = new Date(Date.now() + 3 * 86400000);
  order.status = 'payment_submitted';
  order.statusHistory.push({ status: 'payment_submitted', byUserId: req.user._id, at: new Date() });
  await order.save();

  // An empty $push operator is rejected by MongoDB, so only include it when
  // the buyer actually attached a receipt.
  const paymentUpdate = { $set: { status: 'submitted_by_buyer' } };
  if (proofUrl) {
    paymentUpdate.$push = { proof: { url: proofUrl, uploadedBy: req.user._id, uploadedAt: new Date() } };
  }
  await Payment.updateOne({ orderId: order._id, direction: 'charge' }, paymentUpdate);

  for (const sid of [...new Set(order.items.map(i => String(i.sellerId)))]) {
    await notify(sid, {
      type: 'order_placed',
      title: 'Buyer says they have paid',
      body: `Check your account and confirm payment for ${order.orderNumber}.`,
      linkUrl: `/orders/${order._id}`,
      targetType: 'order', targetId: order._id,
      priority: 'high'
    });
  }

  req.flash('success', 'Marked as paid. The seller will confirm once the transfer lands.');
  res.redirect(`/orders/${order._id}`);
}));

// ── Seller: confirm the money arrived (unlocks delivery) ──────────
router.post('/:id/confirm-payment', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || !isSeller(order, req.user)) return res.redirect('/orders/sales');
  if (order.paymentInfo.status !== 'submitted_by_buyer') {
    req.flash('error', 'There is no submitted payment to confirm.');
    return res.redirect(`/orders/${order._id}`);
  }

  order.paymentInfo.status = 'confirmed_by_seller';
  order.paymentInfo.sellerConfirmedAt = new Date();
  order.paymentInfo.sellerConfirmedBy = req.user._id;
  order.status = 'payment_confirmed';
  order.statusHistory.push({ status: 'payment_confirmed', byUserId: req.user._id, at: new Date() });
  await order.save();

  await Payment.updateOne({ orderId: order._id, direction: 'charge' }, {
    $set: { status: 'confirmed_by_seller', confirmedBy: req.user._id, confirmedAt: new Date() }
  });

  // ★ Delivery unlocks here — and nowhere earlier.
  await createDeliveries(order, req.user._id);

  await notify(order.buyerId, {
    type: 'order_placed',
    title: 'Payment confirmed',
    body: `The seller confirmed payment for ${order.orderNumber}. Your item is being prepared.`,
    linkUrl: `/orders/${order._id}`,
    targetType: 'order', targetId: order._id
  });

  req.flash('success', 'Payment confirmed. Delivery is now unlocked.');
  res.redirect(`/orders/${order._id}`);
}));

// ── Seller: contest the payment ───────────────────────────────────
router.post('/:id/contest-payment', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || !isSeller(order, req.user)) return res.redirect('/orders/sales');

  order.paymentInfo.status = 'contested';
  order.paymentInfo.contestedReason = String(req.body.reason || '').slice(0, 500);
  order.statusHistory.push({ status: 'payment_contested', note: order.paymentInfo.contestedReason, byUserId: req.user._id, at: new Date() });
  await order.save();
  await Payment.updateOne({ orderId: order._id, direction: 'charge' }, { $set: { status: 'contested' } });

  await notify(order.buyerId, {
    type: 'dispute_update',
    title: 'Seller says the payment has not arrived',
    body: `Order ${order.orderNumber} is on hold while this is sorted out.`,
    linkUrl: `/orders/${order._id}`,
    targetType: 'order', targetId: order._id,
    priority: 'high'
  });

  req.flash('success', 'Payment contested. An administrator can step in from the admin panel.');
  res.redirect(`/orders/${order._id}`);
}));

// ── Seller: advance a delivery milestone ──────────────────────────
router.post('/:id/milestone', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || !isSeller(order, req.user)) return res.redirect('/orders/sales');

  const code = req.body.code;
  if (!['packed', 'shipped', 'in_transit', 'delivered'].includes(code)) {
    req.flash('error', 'Unknown milestone.');
    return res.redirect(`/orders/${order._id}`);
  }

  const delivery = await Delivery.findOne({ orderId: order._id, sellerId: req.user._id });
  if (!delivery) {
    req.flash('error', 'Delivery has not been unlocked yet — payment must be confirmed first.');
    return res.redirect(`/orders/${order._id}`);
  }

  const LABELS = { packed: 'Packed', shipped: 'Shipped', in_transit: 'In transit', delivered: 'Delivered' };
  delivery.milestones.push({
    code, label: LABELS[code], occurredAt: new Date(),
    note: String(req.body.note || '').slice(0, 200), byUserId: req.user._id
  });
  delivery.currentStatus = code;

  if (code === 'shipped') {
    delivery.carrier = String(req.body.carrier || '').slice(0, 60) || delivery.carrier;
    delivery.trackingNumber = String(req.body.trackingNumber || '').slice(0, 60) || delivery.trackingNumber;
  }

  if (code === 'delivered') {
    // deliveredAt OPENS the return window. receivedAt closes it — two different
    // timestamps, and it is easy to wire the wrong one.
    delivery.deliveredAt = new Date();
  }
  await delivery.save();

  const mine = order.items.filter(i => String(i.sellerId) === String(req.user._id));
  mine.forEach(i => {
    if (code === 'shipped' || code === 'in_transit') i.itemStatus = 'shipped';
    if (code === 'delivered') i.itemStatus = 'delivered';
  });

  const all = order.items;
  if (code === 'shipped' || code === 'in_transit') {
    order.status = all.every(i => i.itemStatus === 'shipped' || i.itemStatus === 'delivered' || i.itemStatus === 'received')
      ? 'shipped' : 'partially_shipped';
    // Transit lock: neither side can unwind the deal until it lands.
    order.returnWindow.status = 'locked_in_transit';
  }
  if (code === 'delivered' && all.every(i => ['delivered', 'received', 'cancelled'].includes(i.itemStatus))) {
    order.status = 'delivered';
    order.returnWindow.opensAt = new Date();
    order.returnWindow.closesAt = new Date(Date.now() + RETURN_WINDOW_DAYS * 86400000);
    order.returnWindow.status = 'open';
  }
  order.statusHistory.push({ status: code, byUserId: req.user._id, at: new Date() });
  await order.save();

  await notify(order.buyerId, {
    type: code === 'delivered' ? 'order_delivered' : 'order_shipped',
    title: code === 'delivered' ? 'Your order was delivered' : `Order ${LABELS[code].toLowerCase()}`,
    body: code === 'delivered'
      ? `You have ${RETURN_WINDOW_DAYS} days to raise a return or dispute. Confirming receipt ends that window immediately.`
      : `Order ${order.orderNumber} is ${LABELS[code].toLowerCase()}.`,
    linkUrl: `/orders/${order._id}`,
    targetType: 'order', targetId: order._id
  });

  req.flash('success', `Marked as ${LABELS[code].toLowerCase()}.`);
  res.redirect(`/orders/${order._id}`);
}));

// ── Buyer: confirm receipt (final — closes the window early) ──────
router.post('/:id/confirm-receipt', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || !isBuyer(order, req.user)) return res.redirect('/orders');

  if (order.returnWindow.status !== 'open') {
    req.flash('error', 'Receipt can only be confirmed once the order has been delivered.');
    return res.redirect(`/orders/${order._id}`);
  }

  const now = new Date();
  await Delivery.updateMany({ orderId: order._id }, {
    $set: { receivedAt: now, currentStatus: 'received' },
    $push: { milestones: { code: 'received', label: 'Received', occurredAt: now, byUserId: req.user._id } }
  });

  order.items.forEach(i => { if (i.itemStatus === 'delivered') i.itemStatus = 'received'; });
  order.returnWindow.status = 'closed_by_confirmation';
  order.returnWindow.closedAt = now;
  order.returnWindow.closedBy = 'buyer_confirmation';
  order.status = 'completed';
  order.completedAt = now;
  order.statusHistory.push({ status: 'completed', note: 'Buyer confirmed receipt', byUserId: req.user._id, at: now });
  await order.save();

  // Seller sales counter.
  for (const sid of [...new Set(order.items.map(i => String(i.sellerId)))]) {
    await User.updateOne({ _id: sid }, { $inc: { 'sellerProfile.totalSales': 1 } });
    await notify(sid, {
      type: 'order_placed',
      title: 'Buyer confirmed receipt',
      body: `Order ${order.orderNumber} is complete.`,
      linkUrl: `/orders/${order._id}`,
      targetType: 'order', targetId: order._id
    });
  }

  req.flash('success', 'Receipt confirmed. You can now review the items you bought.');
  res.redirect(`/orders/${order._id}`);
}));

// ── Buyer: cancel (only before shipment) ──────────────────────────
router.post('/:id/cancel', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || !isBuyer(order, req.user)) return res.redirect('/orders');

  // Once shipped, the deal is locked — a mid-shipment cancellation leaves the
  // seller with a package in motion and no order.
  const cancellable = ['awaiting_payment', 'payment_submitted', 'payment_confirmed', 'confirmed'];
  if (!cancellable.includes(order.status)) {
    req.flash('error', 'This order can no longer be cancelled — it has already shipped.');
    return res.redirect(`/orders/${order._id}`);
  }

  order.status = 'cancelled';
  order.cancellation = { reason: String(req.body.reason || '').slice(0, 300), byUserId: req.user._id, at: new Date() };
  order.items.forEach(i => { i.itemStatus = 'cancelled'; });
  order.statusHistory.push({ status: 'cancelled', byUserId: req.user._id, at: new Date() });
  await order.save();

  // Return the stock.
  for (const item of order.items) {
    await Product.updateOne({ _id: item.productId }, {
      $inc: { quantitySold: -item.quantity },
      $set: { status: 'active' }
    });
  }
  await Delivery.deleteMany({ orderId: order._id });

  for (const sid of [...new Set(order.items.map(i => String(i.sellerId)))]) {
    await notify(sid, {
      type: 'order_placed',
      title: 'Order cancelled',
      body: `${order.orderNumber} was cancelled by the buyer.`,
      linkUrl: `/orders/${order._id}`,
      targetType: 'order', targetId: order._id
    });
  }

  req.flash('success', 'Order cancelled.');
  res.redirect('/orders');
}));

// ── Buyer: open a dispute (only while the window is open) ─────────
router.post('/:id/dispute', requireAuth, asyncH(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || !isBuyer(order, req.user)) return res.redirect('/orders');

  if (order.returnWindow.status !== 'open') {
    const why = {
      not_open: 'The order has not been delivered yet.',
      locked_in_transit: 'The item is still in transit — wait until it arrives.',
      closed_by_confirmation: 'You already confirmed receipt, which closed the window. Contact an administrator.',
      closed_by_expiry: 'The 15-day window has expired.',
      closed_by_dispute: 'A dispute is already open on this order.'
    }[order.returnWindow.status] || 'The return window is not open.';
    req.flash('error', why);
    return res.redirect(`/orders/${order._id}`);
  }

  const dispute = await Dispute.create({
    orderId: order._id,
    raisedBy: req.user._id,
    against: order.items[0].sellerId,
    reason: req.body.reason || 'other',
    description: String(req.body.description || '').slice(0, 2000),
    evidence: String(req.body.evidenceUrl || '').trim()
      ? [{ url: String(req.body.evidenceUrl).trim(), type: 'image', uploadedBy: req.user._id, at: new Date() }]
      : [],
    status: 'open',
    slaDueAt: new Date(Date.now() + 7 * 86400000)
  });

  order.status = 'disputed';
  order.returnWindow.status = 'closed_by_dispute';
  order.returnWindow.closedAt = new Date();
  order.statusHistory.push({ status: 'disputed', byUserId: req.user._id, at: new Date() });
  await order.save();

  await notify(order.items[0].sellerId, {
    type: 'dispute_update',
    title: 'A dispute was opened',
    body: `Order ${order.orderNumber} is under review.`,
    linkUrl: `/orders/${order._id}`,
    targetType: 'dispute', targetId: dispute._id,
    priority: 'high'
  });

  req.flash('success', 'Dispute opened. The review team will assess it.');
  res.redirect(`/orders/${order._id}`);
}));

module.exports = router;
