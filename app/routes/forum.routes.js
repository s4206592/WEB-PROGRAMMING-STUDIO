const express = require('express');
const Faq = require('../models/faq.model');
const { ForumPost, ForumReply } = require('../models/forumPost.model');
const { requireLogin } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/faq', async (req, res) => {
  const faqs = await Faq.find().sort({ category: 1, order: 1 }).lean();
  const byCategory = {};
  faqs.forEach(f => { (byCategory[f.category] = byCategory[f.category] || []).push(f); });
  res.render('forum/faq', { byCategory });
});

router.get('/forum', async (req, res) => {
  const { q, sort } = req.query;
  const filter = { status: 'active' };
  if (q) filter.title = { $regex: q, $options: 'i' };
  const sortMap = { newest: { createdAt: -1 }, popular: { upvotes: -1 } };
  const sortKey = sortMap[sort] ? sort : 'newest';
  const posts = await ForumPost.find(filter).sort(sortMap[sortKey]).lean();
  res.render('forum/landing', { posts, query: req.query, sortKey });
});

router.get('/forum/new', requireLogin, (req, res) => {
  res.render('forum/new-post', { error: null, old: {} });
});

router.post('/forum/new', requireLogin, async (req, res) => {
  const { title, body, tags } = req.body;
  if (!title || !body) {
    return res.render('forum/new-post', { error: 'Title and body are required.', old: req.body });
  }
  const post = await ForumPost.create({
    authorId: req.session.user.id,
    authorSnapshot: { username: req.session.user.username },
    title, body,
    tags: tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : []
  });
  res.redirect(`/forum/${post._id}`);
});

router.get('/forum/:id', async (req, res) => {
  const post = await ForumPost.findById(req.params.id).lean();
  if (!post) return res.status(404).render('404', { message: 'Post not found.' });
  const replies = await ForumReply.find({ postId: post._id }).sort({ createdAt: 1 }).lean();
  res.render('forum/post', { post, replies });
});

router.post('/forum/:id/reply', requireLogin, async (req, res) => {
  const post = await ForumPost.findById(req.params.id).lean();
  if (!post || !req.body.body) return res.redirect(`/forum/${req.params.id}`);
  await ForumReply.create({
    postId: post._id, postSnapshot: { title: post.title },
    authorId: req.session.user.id, authorSnapshot: { username: req.session.user.username },
    body: req.body.body
  });
  res.redirect(`/forum/${req.params.id}`);
});

module.exports = router;
