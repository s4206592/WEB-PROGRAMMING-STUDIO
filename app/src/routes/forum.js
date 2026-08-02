const express = require('express');
const {
  ForumPost, ForumReply, Vote, Tag, User, ModerationReport, SitemapEntry, ActivityLog
} = require('../models');
const { requireAuth, requireModerator } = require('../middleware/auth');
const { asyncH, uniqueSlug, isObjectId } = require('../utils/helpers');
const { cleanHtml, textToHtml, stripHtml } = require('../utils/sanitize');
const { notify } = require('../utils/notify');

const router = express.Router();
const PER_PAGE = 15;

const BADGES = [
  { at: 500, code: 'expert', label: 'Expert' },
  { at: 250, code: 'trusted', label: 'Trusted' },
  { at: 100, code: 'contributor', label: 'Contributor' },
  { at: 25, code: 'newcomer', label: 'Newcomer' }
];

/** Reputation points, plus any badge the new total has just unlocked. */
async function awardReputation(userId, points) {
  if (!userId || !points) return;
  const user = await User.findById(userId);
  if (!user) return;
  user.reputation.points = Math.max(0, (user.reputation.points || 0) + points);

  for (const b of BADGES) {
    if (user.reputation.points >= b.at && !user.reputation.badges.some(x => x.code === b.code)) {
      user.reputation.badges.push({ code: b.code, label: b.label, awardedAt: new Date() });
      await notify(userId, {
        type: 'badge_earned',
        title: `Badge earned: ${b.label}`,
        body: `You reached ${b.at} reputation points.`,
        linkUrl: '/account/profile'
      });
    }
  }
  await user.save();
}

// ── Forum Landing Page ────────────────────────────────────────────
router.get('/', asyncH(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const tab = ['recent', 'trending', 'unanswered'].includes(req.query.tab) ? req.query.tab : 'recent';

  const filter = { status: { $in: ['open', 'answered'] } };
  if (req.query.tag) filter.tags = String(req.query.tag);
  if (tab === 'unanswered') filter.replyCount = 0;

  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { bodyHtml: rx }];
  }

  const sort = tab === 'trending'
    ? { score: -1, createdAt: -1 }
    : { isPinned: -1, lastActivityAt: -1 };

  const [posts, total, trendingTags] = await Promise.all([
    ForumPost.find(filter).sort(sort).skip((page - 1) * PER_PAGE).limit(PER_PAGE)
      .populate('authorId', 'username fullName reputation').lean(),
    ForumPost.countDocuments(filter),
    Tag.find({}).sort({ usageCount: -1 }).limit(12).lean()
  ]);

  const qsExtra = ['tab', 'tag', 'q']
    .filter(k => req.query[k])
    .map(k => `&${k}=${encodeURIComponent(req.query[k])}`).join('');

  res.render('forum/landing', {
    title: 'Forum',
    breadcrumb: 'Home / Forum',
    posts, total, tab, trendingTags,
    q: req.query.q || '', activeTag: req.query.tag || '',
    page, totalPages: Math.max(1, Math.ceil(total / PER_PAGE)),
    baseUrl: '/forum', qsExtra
  });
}));

// ── New Post ──────────────────────────────────────────────────────
router.get('/new', requireAuth, asyncH(async (req, res) => {
  const tags = await Tag.find({ isModeratorOnly: false }).sort({ usageCount: -1 }).limit(30).lean();
  res.render('forum/new-post', {
    title: 'New Post',
    breadcrumb: 'Home / Forum / Ask a Question',
    tags, form: {}, errors: []
  });
}));

router.post('/new', requireAuth, asyncH(async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 200);
  const body = String(req.body.body || '').trim();
  const errors = [];
  if (title.length < 10) errors.push('Give your question a title of at least 10 characters.');
  if (body.length < 20) errors.push('Add some detail — at least 20 characters.');

  if (errors.length) {
    const tags = await Tag.find({ isModeratorOnly: false }).sort({ usageCount: -1 }).limit(30).lean();
    return res.status(400).render('forum/new-post', {
      title: 'New Post',
      breadcrumb: 'Home / Forum / Ask a Question',
      tags, form: req.body, errors
    });
  }

  const tagSlugs = String(req.body.tags || '')
    .split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean).slice(0, 5);

  const attachments = [].concat(req.body.attachmentUrl || [])
    .map(u => String(u).trim()).filter(Boolean).slice(0, 5)
    .map(url => ({ url, type: /\.(mp4|webm|mov)$/i.test(url) ? 'video' : 'image' }));

  const post = await ForumPost.create({
    authorId: req.user._id,
    title,
    slug: uniqueSlug(title),
    bodyHtml: req.body.isHtml === 'on' ? cleanHtml(body) : textToHtml(body),
    attachments,
    tags: tagSlugs,
    lastActivityAt: new Date()
  });

  for (const slug of tagSlugs) {
    await Tag.updateOne(
      { slug },
      { $inc: { usageCount: 1 }, $setOnInsert: { name: slug.replace(/-/g, ' ') } },
      { upsert: true }
    );
  }

  await SitemapEntry.updateOne(
    { path: `/forum/${post.slug}` },
    {
      $set: {
        title: post.title, module: 'forum', parentPath: '/forum', depth: 3,
        isDynamic: true, sourceType: 'forum_post', sourceId: post._id,
        seo: { changeFreq: 'weekly', priority: 0.4, lastmod: new Date(), noIndex: false },
        isActive: true, lastGeneratedAt: new Date()
      }
    },
    { upsert: true }
  );

  await awardReputation(req.user._id, 2);
  ActivityLog.create({
    userId: req.user._id, action: 'post_created',
    targetType: 'forum_post', targetId: post._id
  }).catch(() => {});

  req.flash('success', 'Question posted.');
  res.redirect(`/forum/${post.slug}`);
}));

// ── Post Management (my posts) ────────────────────────────────────
router.get('/manage', requireAuth, asyncH(async (req, res) => {
  const [posts, replies] = await Promise.all([
    ForumPost.find({ authorId: req.user._id, status: { $ne: 'removed' } }).sort({ createdAt: -1 }).lean(),
    ForumReply.find({ authorId: req.user._id, status: { $ne: 'removed' } }).sort({ createdAt: -1 }).limit(50)
      .populate('postId', 'title slug').lean()
  ]);
  res.render('forum/manage', {
    title: 'Post Management',
    breadcrumb: 'Home / Forum / My Posts',
    posts, replies
  });
}));

// ── Moderation Dashboard ──────────────────────────────────────────
router.get('/moderation', requireModerator, asyncH(async (req, res) => {
  const [reports, flaggedPosts, flaggedReplies] = await Promise.all([
    ModerationReport.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(50)
      .populate('reporterId', 'username').lean(),
    ForumPost.find({ $or: [{ status: 'flagged' }, { 'moderation.reportCount': { $gt: 0 } }] })
      .sort({ 'moderation.reportCount': -1 }).limit(30).populate('authorId', 'username').lean(),
    ForumReply.find({ $or: [{ status: 'flagged' }, { reportCount: { $gt: 0 } }] })
      .sort({ reportCount: -1 }).limit(30)
      .populate('authorId', 'username').populate('postId', 'title slug').lean()
  ]);

  res.render('forum/moderation', {
    title: 'Moderation Dashboard',
    breadcrumb: 'Home / Forum / Moderation',
    reports, flaggedPosts, flaggedReplies
  });
}));

router.post('/moderation/:id/resolve', requireModerator, asyncH(async (req, res) => {
  const report = await ModerationReport.findById(req.params.id);
  if (!report) return res.redirect('/forum/moderation');

  const action = ['none', 'content_hidden', 'content_removed', 'user_warned'].includes(req.body.action)
    ? req.body.action : 'none';

  report.status = action === 'none' ? 'dismissed' : 'actioned';
  report.resolution = {
    moderatorId: req.user._id, action,
    note: String(req.body.note || '').slice(0, 500),
    resolvedAt: new Date()
  };
  await report.save();

  if (action === 'content_removed' || action === 'content_hidden') {
    const status = action === 'content_removed' ? 'removed' : 'hidden';
    const map = {
      forum_post: () => ForumPost.updateOne({ _id: report.targetId }, { $set: { status: action === 'content_removed' ? 'removed' : 'flagged' } }),
      forum_reply: () => ForumReply.updateOne({ _id: report.targetId }, { $set: { status } }),
      blog_comment: () => require('../models').BlogComment.updateOne({ _id: report.targetId }, { $set: { status } }),
      blog_post: () => require('../models').BlogPost.updateOne({ _id: report.targetId }, { $set: { status: 'archived' } }),
      review: () => require('../models').Review.updateOne({ _id: report.targetId }, { $set: { status } }),
      product: () => require('../models').Product.updateOne({ _id: report.targetId }, { $set: { status: 'removed' } })
    };
    if (map[report.targetType]) await map[report.targetType]();
  }

  req.flash('success', 'Report resolved.');
  res.redirect('/forum/moderation');
}));

// ── Thread ────────────────────────────────────────────────────────
router.get('/:slug', asyncH(async (req, res) => {
  const post = await ForumPost.findOne({ slug: req.params.slug })
    .populate('authorId', 'username fullName avatarUrl reputation createdAt');
  if (!post || post.status === 'removed') {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'That thread is gone.' });
  }

  const replies = await ForumReply.find({ postId: post._id, status: { $in: ['published', 'flagged'] } })
    .sort({ isAccepted: -1, score: -1, createdAt: 1 })
    .populate('authorId', 'username fullName avatarUrl reputation').lean();

  const answers = replies.filter(r => !r.parentId);
  const commentsByParent = {};
  replies.filter(r => r.parentId).forEach(r => {
    (commentsByParent[r.parentId] = commentsByParent[r.parentId] || []).push(r);
  });

  let myVotes = {};
  if (req.user) {
    const ids = [post._id, ...replies.map(r => r._id)];
    const votes = await Vote.find({ userId: req.user._id, targetId: { $in: ids } }).lean();
    votes.forEach(v => { myVotes[String(v.targetId)] = v.value; });
  }

  ForumPost.updateOne({ _id: post._id }, { $inc: { viewCount: 1 } }).catch(() => {});

  res.render('forum/thread', {
    title: post.title,
    breadcrumb: `Home / Forum / ${post.title}`,
    post, answers, commentsByParent, myVotes,
    isAuthor: req.user && String(post.authorId._id) === String(req.user._id),
    canModerate: req.user && req.user.hasRole('moderator', 'staff', 'admin')
  });
}));

// ── Reply ─────────────────────────────────────────────────────────
router.post('/:slug/reply', requireAuth, asyncH(async (req, res) => {
  const post = await ForumPost.findOne({ slug: req.params.slug });
  if (!post) return res.redirect('/forum');
  if (post.isLocked) {
    req.flash('error', 'This thread is locked.');
    return res.redirect(`/forum/${post.slug}`);
  }

  const body = String(req.body.body || '').trim();
  if (body.length < 5) {
    req.flash('error', 'Write a slightly longer reply.');
    return res.redirect(`/forum/${post.slug}`);
  }

  const reply = await ForumReply.create({
    postId: post._id,
    authorId: req.user._id,
    parentId: isObjectId(req.body.parentId) ? req.body.parentId : null,
    bodyHtml: textToHtml(body)
  });

  // replyCount and lastActivityAt are derived — updated on the same write.
  await ForumPost.updateOne({ _id: post._id }, {
    $inc: { replyCount: 1 },
    $set: { lastActivityAt: new Date() }
  });

  await awardReputation(req.user._id, 1);

  if (String(post.authorId) !== String(req.user._id)) {
    await notify(post.authorId, {
      type: 'forum_reply',
      title: 'New reply to your question',
      body: `${req.user.username}: ${stripHtml(reply.bodyHtml).slice(0, 100)}`,
      linkUrl: `/forum/${post.slug}`,
      targetType: 'forum_post', targetId: post._id
    });
  }

  res.redirect(`/forum/${post.slug}#reply-${reply._id}`);
}));

// ── Vote ──────────────────────────────────────────────────────────
router.post('/vote/:targetType/:id', requireAuth, asyncH(async (req, res) => {
  const targetType = req.params.targetType === 'forum_reply' ? 'forum_reply' : 'forum_post';
  const value = req.body.value === 'down' ? -1 : 1;
  const Model = targetType === 'forum_post' ? ForumPost : ForumReply;

  const target = await Model.findById(req.params.id);
  if (!target) return res.redirect('/forum');
  if (String(target.authorId) === String(req.user._id)) {
    req.flash('error', 'You cannot vote on your own post.');
    return res.redirect(req.get('Referer') || '/forum');
  }

  const existing = await Vote.findOne({ userId: req.user._id, targetType, targetId: target._id });
  let repDelta = 0;

  if (existing) {
    if (existing.value === value) {
      await existing.deleteOne();
      if (value === 1) { target.upvotes -= 1; repDelta = -5; }
      else { target.downvotes -= 1; repDelta = 2; }
    } else {
      existing.value = value;
      await existing.save();
      if (value === 1) { target.upvotes += 1; target.downvotes -= 1; repDelta = 7; }
      else { target.downvotes += 1; target.upvotes -= 1; repDelta = -7; }
    }
  } else {
    await Vote.create({ userId: req.user._id, targetType, targetId: target._id, value });
    if (value === 1) { target.upvotes += 1; repDelta = 5; }
    else { target.downvotes += 1; repDelta = -2; }
  }

  target.upvotes = Math.max(0, target.upvotes);
  target.downvotes = Math.max(0, target.downvotes);
  target.score = target.upvotes - target.downvotes;
  await target.save();
  await awardReputation(target.authorId, repDelta);

  res.redirect(req.get('Referer') || '/forum');
}));

// ── Accept an answer ──────────────────────────────────────────────
router.post('/:slug/accept/:replyId', requireAuth, asyncH(async (req, res) => {
  const post = await ForumPost.findOne({ slug: req.params.slug });
  if (!post) return res.redirect('/forum');
  if (String(post.authorId) !== String(req.user._id)) {
    req.flash('error', 'Only the person who asked can accept an answer.');
    return res.redirect(`/forum/${post.slug}`);
  }

  const reply = await ForumReply.findOne({ _id: req.params.replyId, postId: post._id });
  if (!reply) return res.redirect(`/forum/${post.slug}`);

  // Only one accepted answer at a time.
  if (post.acceptedAnswerId) {
    await ForumReply.updateOne({ _id: post.acceptedAnswerId }, { $set: { isAccepted: false } });
  }
  const toggleOff = String(post.acceptedAnswerId) === String(reply._id);

  post.acceptedAnswerId = toggleOff ? null : reply._id;
  post.status = toggleOff ? 'open' : 'answered';
  await post.save();

  reply.isAccepted = !toggleOff;
  await reply.save();

  if (!toggleOff) {
    await awardReputation(reply.authorId, 15);
    await notify(reply.authorId, {
      type: 'answer_accepted',
      title: 'Your answer was accepted',
      body: post.title,
      linkUrl: `/forum/${post.slug}`,
      targetType: 'forum_post', targetId: post._id
    });
  }

  res.redirect(`/forum/${post.slug}`);
}));

// ── Edit / delete own post ────────────────────────────────────────
router.post('/:id/edit', requireAuth, asyncH(async (req, res) => {
  const post = await ForumPost.findById(req.params.id);
  if (!post) return res.redirect('/forum/manage');
  if (String(post.authorId) !== String(req.user._id) && !req.user.hasRole('moderator', 'staff', 'admin')) {
    req.flash('error', 'That post is not yours.');
    return res.redirect('/forum/manage');
  }
  const title = String(req.body.title || '').trim().slice(0, 200);
  if (title.length >= 10) post.title = title;
  const body = String(req.body.body || '').trim();
  if (body.length >= 20) post.bodyHtml = textToHtml(body);
  await post.save();
  req.flash('success', 'Post updated.');
  res.redirect(`/forum/${post.slug}`);
}));

router.post('/:id/delete', requireAuth, asyncH(async (req, res) => {
  const post = await ForumPost.findById(req.params.id);
  if (!post) return res.redirect('/forum/manage');
  if (String(post.authorId) !== String(req.user._id) && !req.user.hasRole('moderator', 'staff', 'admin')) {
    req.flash('error', 'That post is not yours.');
    return res.redirect('/forum/manage');
  }
  post.status = 'removed';   // soft delete — replies keep their context
  await post.save();
  await SitemapEntry.updateOne({ path: `/forum/${post.slug}` }, { $set: { isActive: false } });
  req.flash('success', 'Post deleted.');
  res.redirect('/forum/manage');
}));

// ── Report ────────────────────────────────────────────────────────
router.post('/report/:targetType/:id', requireAuth, asyncH(async (req, res) => {
  const targetType = req.params.targetType === 'forum_reply' ? 'forum_reply' : 'forum_post';
  try {
    await ModerationReport.create({
      reporterId: req.user._id, targetType, targetId: req.params.id,
      reason: req.body.reason || 'other',
      details: String(req.body.details || '').slice(0, 1000)
    });
    if (targetType === 'forum_post') {
      await ForumPost.updateOne({ _id: req.params.id }, { $inc: { 'moderation.reportCount': 1 } });
    } else {
      await ForumReply.updateOne({ _id: req.params.id }, { $inc: { reportCount: 1 } });
    }
    req.flash('success', 'Reported. A moderator will take a look.');
  } catch (err) {
    if (err.code === 11000) req.flash('error', 'You already reported that.');
    else throw err;
  }
  res.redirect(req.get('Referer') || '/forum');
}));

module.exports = router;
