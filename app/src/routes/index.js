const express = require('express');
const { Product, BlogPost, ForumPost, Category } = require('../models');
const { asyncH } = require('../utils/helpers');

const router = express.Router();

router.get('/', asyncH(async (req, res) => {
  const [latest, featuredPosts, hotThreads, categories, listingCount] = await Promise.all([
    Product.find({ status: 'active' }).sort({ publishedAt: -1, createdAt: -1 }).limit(8).lean(),
    BlogPost.find({ status: 'published' }).sort({ publishedAt: -1 }).limit(3).populate('authorId', 'username fullName').lean(),
    ForumPost.find({ status: { $in: ['open', 'answered'] } }).sort({ lastActivityAt: -1 }).limit(5).lean(),
    Category.find({ parentId: null, isActive: true }).sort({ displayOrder: 1 }).lean(),
    Product.countDocuments({ status: 'active' })
  ]);

  res.render('home', {
    title: 'Home',
    latest, featuredPosts, hotThreads, categories, listingCount
  });
}));

module.exports = router;
