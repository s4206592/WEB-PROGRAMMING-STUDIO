const express = require('express');
const Review = require('../models/review.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const { requireLogin } = require('../middleware/auth.middleware');

// Product Review & Rating module (PR). Only reads Orders to confirm
// eligibility; never writes to Orders/Products directly (ratingSummary is
// refreshed here as a best-effort cache update, not a requirement).
const router = express.Router();

router.get('/products/:id/review', requireLogin, async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).render('404', { message: 'Product not found.' });

  const eligibleOrder = await Order.findOne({
    buyerId: req.session.user.id, status: 'delivered', 'items.productId': product._id
  }).lean();

  if (!eligibleOrder) {
    return res.render('reviews/submit', { product, error: 'You can only review items from an order the seller has marked delivered.', notEligible: true });
  }
  res.render('reviews/submit', { product, error: null, notEligible: false, orderId: eligibleOrder._id });
});

router.post('/products/:id/review', requireLogin, async (req, res) => {
  try {
    const { rating, title, comment, orderId } = req.body;
    const product = await Product.findById(req.params.id).lean();
    if (!rating || !comment) {
      return res.render('reviews/submit', { product, error: 'A star rating and a comment are required.', notEligible: false, orderId });
    }
    await Review.create({
      productId: product._id,
      productSnapshot: { title: product.title, image: product.images[0] || '' },
      orderId,
      reviewerId: req.session.user.id,
      reviewerSnapshot: { username: req.session.user.username },
      rating: Number(rating), title, comment
    });

    // Best-effort cache refresh — if this fails the review is still saved.
    try {
      const stats = await Review.aggregate([
        { $match: { productId: product._id, status: 'published' } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
      ]);
      if (stats[0]) {
        await Product.findByIdAndUpdate(product._id, {
          'ratingSummary.avg': Math.round(stats[0].avg * 10) / 10,
          'ratingSummary.count': stats[0].count
        });
      }
    } catch (e) { /* rating cache refresh is optional */ }

    res.redirect(`/products/${product._id}`);
  } catch (err) {
    console.error(err);
    res.redirect(`/products/${req.params.id}`);
  }
});

module.exports = router;
