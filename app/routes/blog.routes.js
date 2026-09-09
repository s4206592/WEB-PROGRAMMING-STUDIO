const express = require('express');
const { BlogPost, BlogComment } = require('../models/blogPost.model');
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

router.get('/blog/submit', requireLogin, (req, res) => {
  res.render('blog/submit', { error: null, old: {} });
});

router.post('/blog/submit', requireLogin, async (req, res) => {
  const { title, category, body } = req.body;
  if (!title || !category || !body) {
    return res.render('blog/submit', { error: 'All fields are required.', old: req.body });
  }
  try {
    await BlogPost.create({
      authorId: req.session.user.id, authorSnapshot: { username: req.session.user.username },
      title, category, body
    });
    res.render('blog/submit', { error: null, old: {}, success: true });
  } catch (err) {
    console.error(err);
    res.render('blog/submit', { error: 'Could not submit your article. Please try again.', old: req.body });
  }
});

// Staff Review Dashboard — staff/admin only, reachable even if the public
// blog listing were somehow broken, since it's a separate route.
router.get('/blog/staff', requireAdmin, async (req, res) => {
  const pending = await BlogPost.find({ status: 'pending_review' }).sort({ createdAt: 1 }).lean();
  res.render('blog/staff-review', { pending });
});

router.post('/blog/staff/:id/approve', requireAdmin, async (req, res) => {
  try { await BlogPost.findByIdAndUpdate(req.params.id, { status: 'published', publishedAt: new Date() }); } catch (err) { console.error(err); }
  res.redirect('/blog/staff');
});

router.post('/blog/staff/:id/reject', requireAdmin, async (req, res) => {
  try { await BlogPost.findByIdAndUpdate(req.params.id, { status: 'rejected' }); } catch (err) { console.error(err); }
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
  const post = await BlogPost.findById(req.params.id).lean();
  if (!post || !req.body.body) return res.redirect(`/blog/${req.params.id}`);
  try {
    await BlogComment.create({
      postId: post._id, postSnapshot: { title: post.title },
      authorId: req.session.user.id, authorSnapshot: { username: req.session.user.username },
      body: req.body.body
    });
  } catch (err) { console.error(err); }
  res.redirect(`/blog/${req.params.id}`);
});

module.exports = router;
