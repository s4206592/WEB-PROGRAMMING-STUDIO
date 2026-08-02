const express = require('express');
const { FaqCategory, FaqEntry, FaqSubmission } = require('../models');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { asyncH, isObjectId } = require('../utils/helpers');
const { notify } = require('../utils/notify');

const router = express.Router();

// ── FAQ Page ──────────────────────────────────────────────────────
router.get('/', asyncH(async (req, res) => {
  const categories = await FaqCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean();

  const filter = { isPublished: true };
  if (isObjectId(req.query.category)) filter.categoryId = req.query.category;
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ question: rx }, { answerHtml: rx }];
  }

  const entries = await FaqEntry.find(filter).sort({ displayOrder: 1, createdAt: 1 }).lean();
  const byCategory = {};
  entries.forEach(e => {
    (byCategory[e.categoryId] = byCategory[e.categoryId] || []).push(e);
  });

  res.render('forum/faq', {
    title: 'FAQ',
    breadcrumb: 'Home / FAQ',
    categories, byCategory,
    total: entries.length,
    q: req.query.q || '',
    activeCategory: req.query.category || ''
  });
}));

// ── Submit Question ───────────────────────────────────────────────
router.get('/submit', asyncH(async (req, res) => {
  const categories = await FaqCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
  const mine = req.user
    ? await FaqSubmission.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(10).lean()
    : [];
  res.render('forum/submit-question', {
    title: 'Submit a Question',
    breadcrumb: 'Home / FAQ / Submit a Question',
    categories, mine, form: {}, errors: []
  });
}));

router.post('/submit', asyncH(async (req, res) => {
  const question = String(req.body.question || '').trim().slice(0, 2000);
  const guestEmail = String(req.body.guestEmail || '').trim().toLowerCase();
  const errors = [];

  if (question.length < 15) errors.push('Give us a bit more detail — at least 15 characters.');
  if (!req.user && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guestEmail)) {
    errors.push('Leave an email address so staff can reply.');
  }

  if (errors.length) {
    const categories = await FaqCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
    return res.status(400).render('forum/submit-question', {
      title: 'Submit a Question',
      breadcrumb: 'Home / FAQ / Submit a Question',
      categories, mine: [], form: req.body, errors
    });
  }

  await FaqSubmission.create({
    userId: req.user ? req.user._id : null,
    guestEmail: req.user ? undefined : guestEmail,
    categoryId: isObjectId(req.body.categoryId) ? req.body.categoryId : undefined,
    subject: String(req.body.subject || '').slice(0, 160),
    question,
    status: 'new'
  });

  req.flash('success', 'Question sent to staff. Answers appear on this page and may be added to the public FAQ.');
  res.redirect('/faq/submit');
}));

// ── Helpful votes ─────────────────────────────────────────────────
router.post('/:id/helpful', asyncH(async (req, res) => {
  const field = req.body.value === 'no' ? 'helpfulNo' : 'helpfulYes';
  await FaqEntry.updateOne({ _id: req.params.id }, { $inc: { [field]: 1 } });
  res.redirect(req.get('Referer') || '/faq');
}));

// ── Staff: answer a submission ────────────────────────────────────
router.post('/submissions/:id/answer', requireStaff, asyncH(async (req, res) => {
  const sub = await FaqSubmission.findById(req.params.id);
  if (!sub) return res.redirect('/admin');

  const body = String(req.body.body || '').trim().slice(0, 4000);
  if (!body) {
    req.flash('error', 'Write an answer first.');
    return res.redirect('/admin/faq');
  }

  sub.answer = { body, byUserId: req.user._id, answeredAt: new Date() };
  sub.status = 'answered';
  sub.assignedTo = req.user._id;
  await sub.save();

  if (sub.userId) {
    await notify(sub.userId, {
      type: 'system',
      title: 'Staff answered your question',
      body: body.slice(0, 140),
      linkUrl: '/faq/submit'
    });
  }

  req.flash('success', 'Answer sent.');
  res.redirect('/admin/faq');
}));

module.exports = router;
