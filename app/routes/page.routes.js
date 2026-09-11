const express = require('express');
const Product = require('../models/product.model');
const { BlogPost } = require('../models/blogPost.model');
const { ForumPost } = require('../models/forumPost.model');

const router = express.Router();

router.get('/', async (req, res) => {
  // Product-centric home page: everything on it is driven by real product
  // data (recent listings, top-rated picks, live counts, categories) rather
  // than generic marketing copy. Every query is wrapped so the page still
  // renders if the Product module's collection is ever unavailable.
  let recentProducts = [];
  let featuredProducts = [];
  let categories = [];
  let stats = { listingCount: 0, categoryCount: 0, sellerCount: 0, avgRating: 0 };
  let personalized = null;

  try {
    recentProducts = await Product.find({ status: 'active' }).sort({ createdAt: -1 }).limit(8).lean();
    featuredProducts = await Product.find({ status: 'active', 'ratingSummary.count': { $gt: 0 } })
      .sort({ 'ratingSummary.avg': -1, viewCount: -1 }).limit(6).lean();
    if (featuredProducts.length < 3) {
      // Not enough rated listings yet — fall back to most-viewed so the
      // featured strip still has something worth showing.
      const fallback = await Product.find({ status: 'active' }).sort({ viewCount: -1, createdAt: -1 }).limit(6).lean();
      const seen = new Set(featuredProducts.map(p => String(p._id)));
      featuredProducts = featuredProducts.concat(fallback.filter(p => !seen.has(String(p._id)))).slice(0, 6);
    }
    categories = await Product.distinct('category', { status: 'active' });

    const [listingCount, sellerIds, ratingAgg] = await Promise.all([
      Product.countDocuments({ status: 'active' }),
      Product.distinct('sellerId', { status: 'active' }),
      Product.aggregate([
        { $match: { status: 'active', 'ratingSummary.count': { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$ratingSummary.avg' } } }
      ])
    ]);
    stats = {
      listingCount,
      categoryCount: categories.length,
      sellerCount: sellerIds.length,
      avgRating: ratingAgg[0] ? Math.round(ratingAgg[0].avg * 10) / 10 : 0
    };
  } catch (e) { /* products module unavailable — home page still renders */ }

  // Personalized greeting for logged-in users — cart size and active-order
  // count, read directly rather than through the Cart/Order modules'
  // routers, but defensively: if either collection is unavailable the
  // greeting still renders with whatever counts it did get.
  if (req.session.user) {
    try {
      const Cart = require('../models/cart.model');
      const Order = require('../models/order.model');
      const [cart, activeOrderCount] = await Promise.all([
        Cart.findOne({ userId: req.session.user.id }).lean(),
        Order.countDocuments({ buyerId: req.session.user.id, status: { $nin: ['delivered', 'cancelled'] } })
      ]);
      personalized = {
        cartItemCount: cart ? cart.items.reduce((n, i) => n + i.quantity, 0) : 0,
        activeOrderCount
      };
    } catch (e) { personalized = { cartItemCount: 0, activeOrderCount: 0 }; }
  }

  res.render('home', { recentProducts, featuredProducts, categories, stats, personalized });
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
