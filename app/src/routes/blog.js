const express = require('express');
const {
  BlogPost, BlogCategory, BlogComment, Product, ModerationReport, SitemapEntry, ActivityLog
} = require('../models');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { asyncH, uniqueSlug, isObjectId } = require('../utils/helpers');
const { cleanHtml, textToHtml, stripHtml } = require('../utils/sanitize');
const { notify } = require('../utils/notify');

const router = express.Router();
const PER_PAGE = 9;

function readTime(html) {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// ── Blog Listing / Home ───────────────────────────────────────────
router.get('/', asyncH(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const filter = { status: 'published' };
  if (isObjectId(req.query.category)) filter.categoryId = req.query.category;

  const [posts, total, categories, featured] = await Promise.all([
    BlogPost.find(filter).sort({ publishedAt: -1 })
      .skip((page - 1) * PER_PAGE).limit(PER_PAGE)
      .populate('authorId', 'username fullName')
      .populate('categoryId', 'name slug').lean(),
    BlogPost.countDocuments(filter),
    BlogCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean(),
    BlogPost.find({ status: 'published', isFeatured: true })
      .sort({ featuredOrder: 1 }).limit(3).populate('authorId', 'username').lean()
  ]);

  res.render('blog/listing', {
    title: 'Blog',
    breadcrumb: 'Home / Blog',
    posts, categories, featured, total,
    activeCategory: req.query.category || '',
    page, totalPages: Math.max(1, Math.ceil(total / PER_PAGE)),
    baseUrl: '/blog',
    qsExtra: req.query.category ? `&category=${req.query.category}` : ''
  });
}));

// ── Search Article Page ───────────────────────────────────────────
router.get('/search', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const categories = await BlogCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean();

  let posts = [];
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const filter = {
      status: 'published',
      $or: [{ title: rx }, { excerpt: rx }, { tags: rx }, { bodyHtml: rx }]
    };
    if (isObjectId(req.query.category)) filter.categoryId = req.query.category;
    posts = await BlogPost.find(filter).sort({ publishedAt: -1 }).limit(40)
      .populate('authorId', 'username').populate('categoryId', 'name').lean();
  }

  res.render('blog/search', {
    title: 'Search Articles',
    breadcrumb: 'Home / Blog / Search',
    q, posts, categories,
    activeCategory: req.query.category || ''
  });
}));

// ── Blog Submission ───────────────────────────────────────────────
router.get('/submit', requireAuth, asyncH(async (req, res) => {
  const [categories, myPosts] = await Promise.all([
    BlogCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean(),
    BlogPost.find({ authorId: req.user._id }).sort({ createdAt: -1 }).limit(20).lean()
  ]);
  res.render('blog/submit', {
    title: 'Blog Submission',
    breadcrumb: 'Home / Blog / Submit an Article',
    categories, myPosts, form: {}, errors: []
  });
}));

router.post('/submit', requireAuth, asyncH(async (req, res) => {
  const categories = await BlogCategory.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
  const title = String(req.body.title || '').trim().slice(0, 160);
  const body = String(req.body.body || '').trim();
  const errors = [];

  if (title.length < 8) errors.push('Give the article a title of at least 8 characters.');
  if (body.length < 100) errors.push('The article body should be at least 100 characters.');
  if (!isObjectId(req.body.categoryId)) errors.push('Choose a category.');

  if (errors.length) {
    const myPosts = await BlogPost.find({ authorId: req.user._id }).sort({ createdAt: -1 }).limit(20).lean();
    return res.status(400).render('blog/submit', {
      title: 'Blog Submission',
      breadcrumb: 'Home / Blog / Submit an Article',
      categories, myPosts, form: req.body, errors
    });
  }

  // Sanitised BEFORE insert, not escaped at render.
  const bodyHtml = req.body.isHtml === 'on' ? cleanHtml(body) : textToHtml(body);
  const isStaff = req.user.hasRole('staff', 'admin');

  const post = await BlogPost.create({
    title,
    slug: uniqueSlug(title),
    excerpt: String(req.body.excerpt || stripHtml(bodyHtml).slice(0, 280)).slice(0, 300),
    bodyHtml,
    coverImageUrl: String(req.body.coverImageUrl || '').trim(),
    authorId: req.user._id,
    authorType: isStaff ? 'staff' : 'community',
    categoryId: req.body.categoryId,
    tags: String(req.body.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 8),
    linkedProducts: [].concat(req.body.linkedProduct || []).filter(isObjectId),
    // Staff publish directly; community submissions queue for review.
    status: isStaff ? 'published' : 'pending_review',
    publishedAt: isStaff ? new Date() : undefined,
    metadata: { readTimeMinutes: readTime(bodyHtml) }
  });

  if (post.status === 'published') await addSitemapEntry(post);

  ActivityLog.create({
    userId: req.user._id, action: 'post_created',
    targetType: 'blog_post', targetId: post._id
  }).catch(() => {});

  req.flash('success', isStaff
    ? 'Article published.'
    : 'Submitted for review. You will be notified once a staff member decides.');
  res.redirect(isStaff ? `/blog/${post.slug}` : '/blog/submit');
}));

async function addSitemapEntry(post) {
  await SitemapEntry.updateOne(
    { path: `/blog/${post.slug}` },
    {
      $set: {
        title: post.title, module: 'blog', parentPath: '/blog', depth: 3,
        isDynamic: true, sourceType: 'blog_post', sourceId: post._id,
        seo: { changeFreq: 'monthly', priority: 0.5, lastmod: new Date(), noIndex: false },
        isActive: true, lastGeneratedAt: new Date()
      }
    },
    { upsert: true }
  );
}

// ── Staff Review Dashboard ────────────────────────────────────────
router.get('/review-dashboard', requireStaff, asyncH(async (req, res) => {
  const status = ['pending_review', 'published', 'rejected'].includes(req.query.status)
    ? req.query.status : 'pending_review';
  const posts = await BlogPost.find({ status }).sort({ createdAt: 1 }).limit(60)
    .populate('authorId', 'username fullName')
    .populate('categoryId', 'name').lean();
  const pendingCount = await BlogPost.countDocuments({ status: 'pending_review' });

  res.render('blog/review-dashboard', {
    title: 'Staff Review Dashboard',
    breadcrumb: 'Home / Blog / Staff Review Dashboard',
    posts, status, pendingCount
  });
}));

router.post('/review-dashboard/:id/decide', requireStaff, asyncH(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (!post) return res.redirect('/blog/review-dashboard');

  const decision = ['approve', 'reject', 'request_changes'].includes(req.body.decision)
    ? req.body.decision : 'reject';
  const feedback = String(req.body.feedback || '').slice(0, 1000);

  post.review = { reviewerId: req.user._id, reviewedAt: new Date(), decision, feedback };
  if (decision === 'approve') {
    post.status = 'published';
    post.publishedAt = post.publishedAt || new Date();
    await addSitemapEntry(post);
  } else if (decision === 'reject') {
    post.status = 'rejected';
  } else {
    post.status = 'draft';
  }
  await post.save();

  await notify(post.authorId, {
    type: decision === 'approve' ? 'blog_approved' : 'blog_rejected',
    title: decision === 'approve' ? 'Your article was published' : 'Your article needs work',
    body: decision === 'approve' ? post.title : (feedback || 'A staff member left feedback on your submission.'),
    linkUrl: decision === 'approve' ? `/blog/${post.slug}` : '/blog/submit',
    targetType: 'blog_post', targetId: post._id
  });

  req.flash('success', `Article ${decision === 'approve' ? 'published' : 'sent back to the author'}.`);
  res.redirect('/blog/review-dashboard');
}));

// ── Discussion Post Page (comments view) ──────────────────────────
router.get('/:slug/discussion', asyncH(async (req, res) => {
  const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' })
    .populate('authorId', 'username fullName avatarUrl').lean();
  if (!post) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such article.' });
  }
  const comments = await BlogComment.find({ postId: post._id, status: 'published' })
    .sort({ createdAt: 1 }).populate('authorId', 'username fullName avatarUrl').lean();

  const top = comments.filter(c => !c.parentId);
  const repliesByParent = {};
  comments.filter(c => c.parentId).forEach(c => {
    (repliesByParent[c.parentId] = repliesByParent[c.parentId] || []).push(c);
  });

  res.render('blog/discussion', {
    title: `Discussion — ${post.title}`,
    breadcrumb: `Home / Blog / ${post.title} / Discussion`,
    post, top, repliesByParent, commentCount: comments.length
  });
}));

// ── Blog Post ─────────────────────────────────────────────────────
router.get('/:slug', asyncH(async (req, res) => {
  const post = await BlogPost.findOne({ slug: req.params.slug })
    .populate('authorId', 'username fullName avatarUrl bio')
    .populate('categoryId', 'name slug')
    .populate('linkedProducts', 'title slug price media status');
  if (!post) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'No such article.' });
  }
  // Drafts and pending submissions are visible only to their author and staff.
  const canPreview = req.user && (String(post.authorId._id) === String(req.user._id) || req.user.hasRole('staff', 'admin'));
  if (post.status !== 'published' && !canPreview) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'That article is not published.' });
  }

  const [comments, related] = await Promise.all([
    BlogComment.find({ postId: post._id, status: 'published', parentId: null })
      .sort({ createdAt: -1 }).limit(10).populate('authorId', 'username fullName').lean(),
    BlogPost.find({ status: 'published', categoryId: post.categoryId, _id: { $ne: post._id } })
      .sort({ publishedAt: -1 }).limit(3).lean()
  ]);

  BlogPost.updateOne({ _id: post._id }, { $inc: { 'metadata.views': 1 } }).catch(() => {});

  res.render('blog/post', {
    title: post.title,
    breadcrumb: `Home / Blog / ${post.title}`,
    post, comments, related,
    isPreview: post.status !== 'published'
  });
}));

// ── Comments ──────────────────────────────────────────────────────
router.post('/:slug/comments', requireAuth, asyncH(async (req, res) => {
  const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' });
  if (!post) return res.redirect('/blog');

  const body = String(req.body.body || '').trim().slice(0, 1500);
  if (!body) {
    req.flash('error', 'Write something first.');
    return res.redirect(`/blog/${post.slug}/discussion`);
  }

  await BlogComment.create({
    postId: post._id,
    authorId: req.user._id,
    parentId: isObjectId(req.body.parentId) ? req.body.parentId : null,
    body
  });
  await BlogPost.updateOne({ _id: post._id }, { $inc: { 'metadata.commentCount': 1 } });

  if (String(post.authorId) !== String(req.user._id)) {
    await notify(post.authorId, {
      type: 'blog_comment',
      title: 'New comment on your article',
      body: `${req.user.username}: ${body.slice(0, 100)}`,
      linkUrl: `/blog/${post.slug}/discussion`,
      targetType: 'blog_post', targetId: post._id
    });
  }

  res.redirect(`/blog/${post.slug}/discussion`);
}));

router.post('/comments/:id/delete', requireAuth, asyncH(async (req, res) => {
  const comment = await BlogComment.findById(req.params.id);
  if (!comment) return res.redirect('/blog');
  const canDelete = String(comment.authorId) === String(req.user._id) || req.user.hasRole('moderator', 'staff', 'admin');
  if (!canDelete) {
    req.flash('error', 'That comment is not yours.');
    return res.redirect(req.get('Referer') || '/blog');
  }
  comment.status = 'removed';
  await comment.save();
  await BlogPost.updateOne({ _id: comment.postId }, { $inc: { 'metadata.commentCount': -1 } });
  req.flash('success', 'Comment removed.');
  res.redirect(req.get('Referer') || '/blog');
}));

router.post('/comments/:id/report', requireAuth, asyncH(async (req, res) => {
  try {
    await ModerationReport.create({
      reporterId: req.user._id, targetType: 'blog_comment', targetId: req.params.id,
      reason: req.body.reason || 'other'
    });
    await BlogComment.updateOne({ _id: req.params.id }, { $inc: { reportCount: 1 }, $set: { status: 'flagged' } });
    req.flash('success', 'Comment reported.');
  } catch (err) {
    if (err.code === 11000) req.flash('error', 'You already reported that comment.');
    else throw err;
  }
  res.redirect(req.get('Referer') || '/blog');
}));

// ── Like ──────────────────────────────────────────────────────────
router.post('/:slug/like', requireAuth, asyncH(async (req, res) => {
  await BlogPost.updateOne({ slug: req.params.slug }, { $inc: { 'metadata.likes': 1 } });
  res.redirect(`/blog/${req.params.slug}`);
}));

module.exports = router;
