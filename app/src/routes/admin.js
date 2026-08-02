const express = require('express');
const {
  User, Product, Order, Review, ForumPost, ForumReply, BlogPost, BlogComment,
  ModerationReport, Dispute, AdminAction, Notification, Studio, FaqCategory,
  FaqEntry, FaqSubmission, Payment, Delivery, Offer, Category
} = require('../models');
const { requireAdmin, requireStaff } = require('../middleware/auth');
const { asyncH, isObjectId, slugify } = require('../utils/helpers');
const { cleanHtml, textToHtml } = require('../utils/sanitize');
const { notify } = require('../utils/notify');

const router = express.Router();

/** Every privileged action writes one immutable audit row. */
function audit(req, action, targetType, targetId, extra = {}) {
  return AdminAction.create({
    adminId: req.user._id, action, targetType, targetId,
    reason: String(req.body.reason || '').slice(0, 500),
    ip: req.ip,
    ...extra
  }).catch(() => {});
}

// ── Administration Page (hub) ─────────────────────────────────────
router.get('/', requireStaff, asyncH(async (req, res) => {
  const [
    users, listings, orders, reviews, threads, articles,
    pendingReports, openDisputes, pendingBlogs, newQuestions, pendingStudios
  ] = await Promise.all([
    User.countDocuments({ status: { $ne: 'deleted' } }),
    Product.countDocuments({ status: 'active' }),
    Order.countDocuments(),
    Review.countDocuments({ status: 'published' }),
    ForumPost.countDocuments({ status: { $ne: 'removed' } }),
    BlogPost.countDocuments({ status: 'published' }),
    ModerationReport.countDocuments({ status: 'pending' }),
    Dispute.countDocuments({ status: { $in: ['open', 'under_review', 'awaiting_evidence'] } }),
    BlogPost.countDocuments({ status: 'pending_review' }),
    FaqSubmission.countDocuments({ status: 'new' }),
    Studio.countDocuments({ 'verification.status': 'pending' })
  ]);

  const recentActions = await AdminAction.find({}).sort({ createdAt: -1 }).limit(10)
    .populate('adminId', 'username').lean();

  res.render('admin/hub', {
    title: 'Administration',
    breadcrumb: 'Home / Administration',
    counts: { users, listings, orders, reviews, threads, articles },
    queues: { pendingReports, openDisputes, pendingBlogs, newQuestions, pendingStudios },
    recentActions
  });
}));

// ── User Management ───────────────────────────────────────────────
router.get('/users', requireAdmin, asyncH(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 25;
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.role) filter.roles = String(req.query.role);
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ username: rx }, { email: rx }, { fullName: rx }, { phone: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage)
      .select('-passwordHash').lean(),
    User.countDocuments(filter)
  ]);

  const qsExtra = ['status', 'role', 'q'].filter(k => req.query[k])
    .map(k => `&${k}=${encodeURIComponent(req.query[k])}`).join('');

  res.render('admin/users', {
    title: 'User Management',
    breadcrumb: 'Home / Administration / User Management',
    users, total,
    page, totalPages: Math.max(1, Math.ceil(total / perPage)),
    baseUrl: '/admin/users', qsExtra,
    q: req.query.q || '',
    activeStatus: req.query.status || '',
    activeRole: req.query.role || ''
  });
}));

router.get('/users/:id', requireAdmin, asyncH(async (req, res) => {
  const user = await User.findById(req.params.id).select('-passwordHash');
  if (!user) return res.redirect('/admin/users');

  const [listings, orders, reviews, threads] = await Promise.all([
    Product.find({ sellerId: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
    Order.find({ buyerId: user._id }).sort({ placedAt: -1 }).limit(10).lean(),
    Review.find({ reviewerId: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
    ForumPost.find({ authorId: user._id }).sort({ createdAt: -1 }).limit(10).lean()
  ]);

  res.render('admin/user-detail', {
    title: `User: ${user.username}`,
    breadcrumb: `Home / Administration / User Management / ${user.username}`,
    user, listings, orders, reviews, threads
  });
}));

router.post('/users/:id/suspend', requireAdmin, asyncH(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.redirect('/admin/users');
  if (String(user._id) === String(req.user._id)) {
    req.flash('error', 'You cannot suspend your own account.');
    return res.redirect(`/admin/users/${user._id}`);
  }

  const days = Math.max(1, parseInt(req.body.days, 10) || 7);
  user.status = 'suspended';
  user.suspension = {
    reason: String(req.body.reason || '').slice(0, 500),
    until: new Date(Date.now() + days * 86400000),
    byAdminId: req.user._id
  };
  await user.save();
  await audit(req, 'user_suspend', 'user', user._id, { after: { days } });
  await notify(user._id, {
    type: 'moderation_action',
    title: 'Your account has been suspended',
    body: `${user.suspension.reason || 'Policy violation'} — until ${user.suspension.until.toDateString()}.`,
    priority: 'high'
  });

  req.flash('success', `${user.username} suspended for ${days} days.`);
  res.redirect(`/admin/users/${user._id}`);
}));

router.post('/users/:id/ban', requireAdmin, asyncH(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.redirect('/admin/users');
  if (String(user._id) === String(req.user._id)) {
    req.flash('error', 'You cannot ban your own account.');
    return res.redirect(`/admin/users/${user._id}`);
  }
  user.status = 'banned';
  user.suspension = { reason: String(req.body.reason || '').slice(0, 500), byAdminId: req.user._id };
  await user.save();
  // Their live listings come down with them.
  await Product.updateMany({ sellerId: user._id, status: 'active' }, { $set: { status: 'removed' } });
  await audit(req, 'user_ban', 'user', user._id);
  req.flash('success', `${user.username} banned and their listings taken down.`);
  res.redirect(`/admin/users/${user._id}`);
}));

router.post('/users/:id/restore', requireAdmin, asyncH(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.redirect('/admin/users');
  user.status = 'active';
  user.suspension = undefined;
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();
  await audit(req, 'user_restore', 'user', user._id);
  req.flash('success', `${user.username} restored.`);
  res.redirect(`/admin/users/${user._id}`);
}));

router.post('/users/:id/roles', requireAdmin, asyncH(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.redirect('/admin/users');

  const allowed = ['buyer', 'seller', 'studio_owner', 'moderator', 'staff', 'admin'];
  const roles = [].concat(req.body.role || []).filter(r => allowed.includes(r));
  if (!roles.length) roles.push('buyer');

  // Never let the last admin remove their own admin role.
  if (String(user._id) === String(req.user._id) && !roles.includes('admin')) {
    req.flash('error', 'You cannot remove your own admin role.');
    return res.redirect(`/admin/users/${user._id}`);
  }

  const before = [...user.roles];
  user.roles = roles;
  await user.save();
  await audit(req, 'role_change', 'user', user._id, { before: { roles: before }, after: { roles } });

  req.flash('success', 'Roles updated.');
  res.redirect(`/admin/users/${user._id}`);
}));

// Soft delete only. Hard-deleting a user orphans financial records.
router.post('/users/:id/anonymise', requireAdmin, asyncH(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user || String(user._id) === String(req.user._id)) {
    req.flash('error', 'That account cannot be anonymised.');
    return res.redirect('/admin/users');
  }
  const stamp = Date.now().toString(36);
  user.status = 'deleted';
  user.email = `deleted-${stamp}@removed.invalid`;
  user.phone = `+000000${stamp}`.slice(0, 15);
  user.username = `deleted_${stamp}`;
  user.fullName = 'Anonymous';
  user.bio = '';
  user.avatarUrl = '';
  user.addresses = [];
  await user.save();
  await Product.updateMany({ sellerId: user._id }, { $set: { status: 'removed' } });
  await audit(req, 'user_anonymise', 'user', user._id);

  req.flash('success', 'Account anonymised. Orders, reviews and posts were kept.');
  res.redirect('/admin/users');
}));

// ── Transaction Records ───────────────────────────────────────────
router.get('/transactions', requireStaff, asyncH(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 25;
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.q) {
    filter.orderNumber = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const [orders, total, gmvRow] = await Promise.all([
    Order.find(filter).sort({ placedAt: -1 }).skip((page - 1) * perPage).limit(perPage)
      .populate('buyerId', 'username').lean(),
    Order.countDocuments(filter),
    Order.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, gmv: { $sum: '$totals.grandTotal' }, n: { $sum: 1 } } }
    ])
  ]);

  const qsExtra = ['status', 'q'].filter(k => req.query[k])
    .map(k => `&${k}=${encodeURIComponent(req.query[k])}`).join('');

  res.render('admin/transactions', {
    title: 'Transaction Records',
    breadcrumb: 'Home / Administration / Transaction Records',
    orders, total,
    gmv: gmvRow[0]?.gmv || 0, completed: gmvRow[0]?.n || 0,
    page, totalPages: Math.max(1, Math.ceil(total / perPage)),
    baseUrl: '/admin/transactions', qsExtra,
    q: req.query.q || '', activeStatus: req.query.status || ''
  });
}));

// ── Disputes ──────────────────────────────────────────────────────
router.get('/disputes', requireStaff, asyncH(async (req, res) => {
  const disputes = await Dispute.find({}).sort({ status: 1, slaDueAt: 1 }).limit(60)
    .populate('raisedBy', 'username').populate('against', 'username')
    .populate('orderId', 'orderNumber totals').lean();
  res.render('admin/disputes', {
    title: 'Disputes',
    breadcrumb: 'Home / Administration / Disputes',
    disputes
  });
}));

router.post('/disputes/:id/resolve', requireStaff, asyncH(async (req, res) => {
  const dispute = await Dispute.findById(req.params.id).populate('orderId');
  if (!dispute) return res.redirect('/admin/disputes');

  const outcomes = ['refund_full', 'refund_partial', 'release_to_seller', 'return_and_refund', 'rejected'];
  const outcome = outcomes.includes(req.body.outcome) ? req.body.outcome : 'rejected';
  const score = parseInt(req.body.conditionScore, 10);

  dispute.assessment = {
    assessorId: req.user._id,
    conditionScore: score >= 0 && score <= 100 ? score : undefined,
    findings: String(req.body.findings || '').slice(0, 2000),
    assessedAt: new Date()
  };
  dispute.resolution = {
    outcome,
    refundAmount: parseInt(String(req.body.refundAmount || '').replace(/\D/g, ''), 10) || 0,
    rationale: String(req.body.rationale || '').slice(0, 2000),
    decidedBy: req.user._id,
    decidedAt: new Date()
  };
  dispute.status = 'resolved';
  await dispute.save();

  if (dispute.orderId) {
    const isRefund = outcome.startsWith('refund') || outcome === 'return_and_refund';
    await Order.updateOne({ _id: dispute.orderId._id }, {
      $set: { status: isRefund ? 'refunded' : 'completed', completedAt: new Date() },
      $push: { statusHistory: { status: isRefund ? 'refunded' : 'completed', note: `Dispute: ${outcome}`, byUserId: req.user._id, at: new Date() } }
    });
    if (isRefund && dispute.resolution.refundAmount > 0) {
      await Payment.create({
        orderId: dispute.orderId._id,
        userId: dispute.raisedBy,
        direction: 'refund',
        amount: dispute.resolution.refundAmount,
        method: dispute.orderId.paymentInfo?.method || 'bank_transfer',
        status: 'succeeded',
        reference: `REFUND-${dispute.orderId.orderNumber}`,
        confirmedBy: req.user._id,
        confirmedAt: new Date()
      });
    }
  }

  await audit(req, 'dispute_resolve', 'dispute', dispute._id, { after: { outcome } });
  for (const uid of [dispute.raisedBy, dispute.against]) {
    await notify(uid, {
      type: 'dispute_update',
      title: 'Dispute resolved',
      body: dispute.resolution.rationale || outcome.replace(/_/g, ' '),
      linkUrl: dispute.orderId ? `/orders/${dispute.orderId._id}` : '/orders',
      priority: 'high'
    });
  }

  req.flash('success', 'Dispute resolved.');
  res.redirect('/admin/disputes');
}));

// ── Content Moderation ────────────────────────────────────────────
router.get('/moderation', requireStaff, asyncH(async (req, res) => {
  const status = ['pending', 'under_review', 'actioned', 'dismissed'].includes(req.query.status)
    ? req.query.status : 'pending';

  const reports = await ModerationReport.find({ status }).sort({ createdAt: 1 }).limit(60)
    .populate('reporterId', 'username').lean();

  // Load a short preview of whatever each report points at.
  const loaders = {
    product: id => Product.findById(id).select('title slug status').lean(),
    review: id => Review.findById(id).select('comment rating status').lean(),
    forum_post: id => ForumPost.findById(id).select('title slug status').lean(),
    forum_reply: id => ForumReply.findById(id).select('bodyHtml status').lean(),
    blog_post: id => BlogPost.findById(id).select('title slug status').lean(),
    blog_comment: id => BlogComment.findById(id).select('body status').lean(),
    user: id => User.findById(id).select('username status').lean(),
    studio: id => Studio.findById(id).select('name slug status').lean()
  };
  for (const r of reports) {
    r.target = loaders[r.targetType] ? await loaders[r.targetType](r.targetId) : null;
  }

  res.render('admin/moderation', {
    title: 'Content Moderation',
    breadcrumb: 'Home / Administration / Content Moderation',
    reports, status
  });
}));

router.post('/moderation/:id/act', requireStaff, asyncH(async (req, res) => {
  const report = await ModerationReport.findById(req.params.id);
  if (!report) return res.redirect('/admin/moderation');

  const actions = ['none', 'content_hidden', 'content_removed', 'user_warned', 'user_suspended', 'user_banned'];
  const action = actions.includes(req.body.action) ? req.body.action : 'none';

  report.status = action === 'none' ? 'dismissed' : 'actioned';
  report.resolution = {
    moderatorId: req.user._id, action,
    note: String(req.body.note || '').slice(0, 500),
    resolvedAt: new Date()
  };
  await report.save();

  const hide = action === 'content_hidden';
  const remove = action === 'content_removed';
  if (hide || remove) {
    const setters = {
      product: () => Product.updateOne({ _id: report.targetId }, { $set: { status: remove ? 'removed' : 'paused' } }),
      review: () => Review.updateOne({ _id: report.targetId }, { $set: { status: remove ? 'removed' : 'hidden' } }),
      forum_post: () => ForumPost.updateOne({ _id: report.targetId }, { $set: { status: remove ? 'removed' : 'flagged' } }),
      forum_reply: () => ForumReply.updateOne({ _id: report.targetId }, { $set: { status: remove ? 'removed' : 'hidden' } }),
      blog_post: () => BlogPost.updateOne({ _id: report.targetId }, { $set: { status: 'archived' } }),
      blog_comment: () => BlogComment.updateOne({ _id: report.targetId }, { $set: { status: remove ? 'removed' : 'hidden' } }),
      studio: () => Studio.updateOne({ _id: report.targetId }, { $set: { status: remove ? 'removed' : 'suspended' } })
    };
    if (setters[report.targetType]) await setters[report.targetType]();
    // A removed review changes the product's rating summary.
    if (report.targetType === 'review') {
      const rev = await Review.findById(report.targetId).lean();
      if (rev) await Review.recomputeSummary(rev.productId);
    }
  }

  if (action === 'user_suspended' || action === 'user_banned') {
    const targetUserId = report.targetType === 'user' ? report.targetId : null;
    if (targetUserId) {
      await User.updateOne({ _id: targetUserId }, {
        $set: {
          status: action === 'user_banned' ? 'banned' : 'suspended',
          suspension: { reason: report.resolution.note, until: new Date(Date.now() + 7 * 86400000), byAdminId: req.user._id }
        }
      });
    }
  }

  await audit(req, 'content_moderate', report.targetType, report.targetId, { after: { action } });
  req.flash('success', 'Report actioned.');
  res.redirect('/admin/moderation');
}));

// ── Listing moderation ────────────────────────────────────────────
router.get('/listings', requireStaff, asyncH(async (req, res) => {
  const status = req.query.status || 'active';
  const listings = await Product.find({ status }).sort({ createdAt: -1 }).limit(60)
    .populate('sellerId', 'username').lean();
  res.render('admin/listings', {
    title: 'Listings',
    breadcrumb: 'Home / Administration / Listings',
    listings, status
  });
}));

router.post('/listings/:id/remove', requireStaff, asyncH(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.redirect('/admin/listings');
  product.status = 'removed';
  product.moderation = { reviewedBy: req.user._id, reviewedAt: new Date(), note: String(req.body.reason || '') };
  await product.save();
  await audit(req, 'listing_remove', 'product', product._id);
  await notify(product.sellerId, {
    type: 'moderation_action',
    title: 'Your listing was removed',
    body: `${product.title}: ${req.body.reason || 'policy violation'}`,
    linkUrl: '/sell/listings'
  });
  req.flash('success', 'Listing removed.');
  res.redirect('/admin/listings');
}));

// ── Studio verification ───────────────────────────────────────────
router.get('/studios', requireStaff, asyncH(async (req, res) => {
  const studios = await Studio.find({ status: { $ne: 'removed' } })
    .sort({ 'verification.status': 1, createdAt: -1 }).limit(60)
    .populate('ownerId', 'username').lean();
  res.render('admin/studios', {
    title: 'Studio Verification',
    breadcrumb: 'Home / Administration / Studios',
    studios
  });
}));

router.post('/studios/:id/verify', requireStaff, asyncH(async (req, res) => {
  const decision = req.body.decision === 'verified' ? 'verified' : 'rejected';
  const studio = await Studio.findById(req.params.id);
  if (!studio) return res.redirect('/admin/studios');

  studio.verification.status = decision;
  studio.verification.verifiedBy = req.user._id;
  studio.verification.verifiedAt = new Date();
  await studio.save();

  await notify(studio.ownerId, {
    type: 'moderation_action',
    title: `Studio ${decision}`,
    body: studio.name,
    linkUrl: `/studios/${studio.slug}`
  });
  req.flash('success', `Studio marked ${decision}.`);
  res.redirect('/admin/studios');
}));

// ── FAQ management ────────────────────────────────────────────────
router.get('/faq', requireStaff, asyncH(async (req, res) => {
  const [categories, entries, submissions] = await Promise.all([
    FaqCategory.find({}).sort({ displayOrder: 1 }).lean(),
    FaqEntry.find({}).sort({ categoryId: 1, displayOrder: 1 }).lean(),
    FaqSubmission.find({}).sort({ status: 1, createdAt: 1 }).limit(50)
      .populate('userId', 'username email').lean()
  ]);
  res.render('admin/faq', {
    title: 'FAQ Management',
    breadcrumb: 'Home / Administration / FAQ',
    categories, entries, submissions
  });
}));

router.post('/faq/entries', requireStaff, asyncH(async (req, res) => {
  const question = String(req.body.question || '').trim().slice(0, 300);
  const answer = String(req.body.answer || '').trim();
  if (question.length < 8 || answer.length < 10 || !isObjectId(req.body.categoryId)) {
    req.flash('error', 'A question, an answer and a category are all required.');
    return res.redirect('/admin/faq');
  }
  await FaqEntry.create({
    categoryId: req.body.categoryId,
    question,
    answerHtml: req.body.isHtml === 'on' ? cleanHtml(answer) : textToHtml(answer),
    slug: `${slugify(question)}-${Date.now().toString(36)}`,
    displayOrder: parseInt(req.body.displayOrder, 10) || 0,
    isPublished: req.body.isPublished !== 'off',
    authorId: req.user._id
  });
  await audit(req, 'faq_publish', 'faq_entry', null);
  req.flash('success', 'FAQ entry published.');
  res.redirect('/admin/faq');
}));

router.post('/faq/entries/:id/delete', requireStaff, asyncH(async (req, res) => {
  await FaqEntry.deleteOne({ _id: req.params.id });
  req.flash('success', 'FAQ entry deleted.');
  res.redirect('/admin/faq');
}));

// ── Analytics Dashboard ───────────────────────────────────────────
router.get('/analytics', requireStaff, asyncH(async (req, res) => {
  const since = new Date(Date.now() - 30 * 86400000);

  const [
    totalUsers, newUsers, activeListings, soldListings,
    orderRows, reviewRows, offerRows, forumCount, blogCount,
    topCategories, dailySignups
  ] = await Promise.all([
    User.countDocuments({ status: { $ne: 'deleted' } }),
    User.countDocuments({ createdAt: { $gte: since } }),
    Product.countDocuments({ status: 'active' }),
    Product.countDocuments({ status: 'sold' }),
    Order.aggregate([
      { $group: { _id: '$status', n: { $sum: 1 }, value: { $sum: '$totals.grandTotal' } } }
    ]),
    Review.aggregate([
      { $match: { status: 'published' } },
      { $group: { _id: null, n: { $sum: 1 }, avg: { $avg: '$rating' } } }
    ]),
    Offer.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ForumPost.countDocuments({ status: { $ne: 'removed' } }),
    BlogPost.countDocuments(),
    Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', orders: { $sum: 1 }, gmv: { $sum: '$items.lineTotal' } } },
      { $sort: { gmv: -1 } },
      { $limit: 8 }
    ]),
    User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  ]);

  const ordersByStatus = {};
  let gmv = 0, orderCount = 0;
  orderRows.forEach(r => {
    ordersByStatus[r._id] = r.n;
    orderCount += r.n;
    if (r._id === 'completed') gmv += r.value;
  });

  const offersByStatus = {};
  offerRows.forEach(r => { offersByStatus[r._id] = r.n; });

  const topProductIds = topCategories.map(t => t._id).filter(Boolean);
  const topProducts = topProductIds.length
    ? await Product.find({ _id: { $in: topProductIds } }).select('title slug').lean()
    : [];
  const titleById = new Map(topProducts.map(p => [String(p._id), p.title]));

  res.render('admin/analytics', {
    title: 'Analytics Dashboard',
    breadcrumb: 'Home / Administration / Analytics',
    totalUsers, newUsers, activeListings, soldListings,
    orderCount, gmv, ordersByStatus, offersByStatus,
    reviewCount: reviewRows[0]?.n || 0,
    avgRating: reviewRows[0] ? Math.round(reviewRows[0].avg * 10) / 10 : 0,
    forumCount, blogCount,
    topSellers: topCategories.map(t => ({ ...t, title: titleById.get(String(t._id)) || 'Removed listing' })),
    dailySignups
  });
}));

// ── Audit log ─────────────────────────────────────────────────────
router.get('/audit', requireAdmin, asyncH(async (req, res) => {
  const actions = await AdminAction.find({}).sort({ createdAt: -1 }).limit(100)
    .populate('adminId', 'username').lean();
  res.render('admin/audit', {
    title: 'Admin Audit Log',
    breadcrumb: 'Home / Administration / Audit Log',
    actions
  });
}));

module.exports = router;
