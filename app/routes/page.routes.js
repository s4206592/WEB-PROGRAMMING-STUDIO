const express = require('express');
const Product = require('../models/product.model');
const { BlogPost } = require('../models/blogPost.model');
const { ForumPost } = require('../models/forumPost.model');

const router = express.Router();

router.get('/', async (req, res) => {
  let recentProducts = [];
  try {
    recentProducts = await Product.find({ status: 'active' }).sort({ createdAt: -1 }).limit(8).lean();
  } catch (e) { /* products module unavailable — home page still renders */ }
  res.render('home', { recentProducts });
});

// Sitemap module: generated from a static route registry, not from data,
// so it never depends on any other module's collections existing.
router.get('/sitemap', (req, res) => {
  const structure = [
    { module: 'Marketplace', links: [['Product Listing', '/products'], ['List an item', '/products/new']] },
    { module: 'Shopping Cart', links: [['Cart', '/cart'], ['Checkout', '/checkout'], ['My orders', '/orders'], ['Orders to fulfill', '/orders/selling']] },
    { module: 'Buyer-Seller Chat & Negotiation', links: [['Messages', '/messages']] },
    { module: 'Wishlist', links: [['Wishlist', '/wishlist']] },
    { module: 'Discussion Forum & FAQ', links: [['FAQ', '/faq'], ['Forum', '/forum'], ['Studios', '/forum/studios']] },
    { module: 'Blog', links: [['Blog', '/blog'], ['Submit an article', '/blog/submit']] },
    { module: 'Account', links: [['Register', '/register'], ['Log in', '/login'], ['Profile', '/profile']] },
    { module: 'Administration', links: [['Admin dashboard', '/admin']] }
  ];
  res.render('sitemap', { structure });
});

module.exports = router;
