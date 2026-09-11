const express = require('express');
const { BlogPost, BlogComment } = require('../models/blogPost.model');
const Product = require('../models/product.model');
const { requireLogin, requireAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/blog', async (req, res) => {
  const { q, category, sort } = req.query;
  const filter = { status: 'published' };
  if (category) filter.category = category;
  if (q) filter.title = { $regex: q, $options: 'i' };
  const sortMap = { newest: { publishedAt: -1 }, popular: { viewCount: -1 } };
  const sortKey = sortMap[sort] ? sort : 'newest';
  const posts = await BlogPost.find(filter).sort(sortMap[sortKey]).lean();
  const categories = await BlogPost.distinct('category', { status: 'published' });
  res.render('blog/listing', { posts, categories, query: req.query, sortKey });
});

// Reads relatedProduct defensively: if the Product module/collection is
// gone, or the id doesn't resolve, the form still renders as a plain
// standalone submission — never blocks writing an article.
router.get('/blog/submit', requireLogin, async (req, res) => {
  let relatedProduct = null;
  if (req.query.productId) {
    try { relatedProduct = await Product.findById(req.query.productId).lean(); } catch (e) { /* product unavailable */ }
  }
  res.render('blog/submit', { error: null, old: {}, relatedProduct });
});

router.post('/blog/submit', requireLogin, async (req, res) => {
  const { title, category, body, relatedProductId } = req.body;
  if (!title || !category || !body) {
    let relatedProduct = null;
    if (relatedProductId) { try { relatedProduct = await Product.findById(relatedProductId).lean(); } catch (e) { /* product unavailable */ } }
    return res.render('blog/submit', { error: 'All fields are required.', old: req.body, relatedProduct });
  }

  // Never trust a client-sent title/image snapshot — re-fetch the product
  // server-side and only store the link if it still resolves to something.
  let relatedProductSnapshot;
  let resolvedProductId;
  if (relatedProductId) {
    try {
      const product = await Product.findById(relatedProductId).lean();
      if (product) {
        resolvedProductId = product._id;
        relatedProductSnapshot = { title: product.title, image: product.images[0] || '' };
      }
    } catch (e) { /* product unavailable — post still gets created without the link */ }
  }

  try {
    await BlogPost.create({
      authorId: req.session.user.id, authorSnapshot: { username: req.session.user.username },
      title, category, body,
      relatedProductId: resolvedProductId, relatedProductSnapshot
    });
    res.render('blog/submit', { error: null, old: {}, relatedProduct: null, success: true });
  } catch (err) {
    console.error(err);
    res.render('blog/submit', { error: 'Could not submit your article. Please try again.', old: req.body, relatedProduct: null });
  }
});

// Staff Review Dashboard — staff/admin only, reachable even if the public
// blog listing were somehow broken, since it's a separate route.
router.get('/blog/staff', requireAdmin, async (req, res) => {
  const pending = await BlogPost.find({ status: 'pending_review' }).sort({ createdAt: 1 }).lean();
  res.render('blog/staff-review', { pending });
});

router.post('/blog/staff/:id/approve', requireAdmin, async (req, res) => {
  try {
    await BlogPost.findByIdAndUpdate(req.params.id, { status: 'published', publishedAt: new Date() });
  } catch (err) { console.error(err); }
  res.redirect('/blog/staff');
});

router.post('/blog/staff/:id/reject', requireAdmin, async (req, res) => {
  try {
    await BlogPost.findByIdAndUpdate(req.params.id, { status: 'rejected' });
  } catch (err) { console.error(err); }
  res.redirect('/blog/staff');
});

router.get('/blog/:id', async (req, res) => {
  const post = await BlogPost.findById(req.params.id).lean();
  if (!post) return res.status(404).render('404', { message: 'Article not found.' });
  BlogPost.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec().catch(err => console.error(err));
  const comments = await BlogComment.find({ postId: post._id }).sort({ createdAt: 1 }).lean();
  res.render('blog/post', { post, comments });
});

router.post('/blog/:id/comment', requireLogin, async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id).lean();
    if (!post || !req.body.body) return res.redirect(`/blog/${req.params.id}`);
    await BlogComment.create({
      postId: post._id, postSnapshot: { title: post.title },
      authorId: req.session.user.id, authorSnapshot: { username: req.session.user.username },
      body: req.body.body
    });
    res.redirect(`/blog/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/blog/${req.params.id}`);
  }
});

module.exports = router;
