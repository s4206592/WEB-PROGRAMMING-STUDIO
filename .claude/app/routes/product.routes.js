const express = require('express');
const Product = require('../models/product.model');
const User = require('../models/user.model');
const { requireLogin } = require('../middleware/auth.middleware');

// Product Listing (PL) + Individual Product (IP) are the shared backbone.
// This router never imports anything from cart/wishlist/review routers —
// it only exposes the product data; other modules read it defensively.
const router = express.Router();

const SORT_OPTIONS = {
  newest: { createdAt: -1 },
  price_asc: { 'pricing.listPrice': 1 },
  price_desc: { 'pricing.listPrice': -1 },
  rating: { 'ratingSummary.avg': -1 }
};

router.get('/products', async (req, res) => {
  const { q, category, condition, minPrice, maxPrice, sort } = req.query;
  const filter = { status: 'active' };
  if (category) filter.category = category;
  if (condition) filter.condition = condition;
  if (minPrice || maxPrice) {
    filter['pricing.listPrice'] = {};
    if (minPrice) filter['pricing.listPrice'].$gte = Number(minPrice);
    if (maxPrice) filter['pricing.listPrice'].$lte = Number(maxPrice);
  }
  if (q) filter.$text = { $search: q };

  const sortKey = SORT_OPTIONS[sort] ? sort : 'newest';
  const products = await Product.find(filter).sort(SORT_OPTIONS[sortKey]).lean();
  const categories = await Product.distinct('category');
  res.render('products/listing', { products, categories, query: req.query, sortKey });
});

const EMPTY_ROW = { title: '', description: '', category: '', condition: 'secondhand', listPrice: '', quantity: 1, images: '', tags: '' };

router.get('/products/new', requireLogin, (req, res) => {
  res.render('products/new-listing', { error: null, items: [EMPTY_ROW] });
});

// Lists any number of items in one submission — each row keeps its own
// price/condition/etc. Form fields arrive as items[0][title], items[1][title]…
router.post('/products/new', requireLogin, async (req, res) => {
  try {
    const rawItems = req.body.items && typeof req.body.items === 'object' ? Object.values(req.body.items) : [];
    if (rawItems.length === 0) {
      return res.render('products/new-listing', { error: 'Add at least one item.', items: [EMPTY_ROW] });
    }

    const invalidIndex = rawItems.findIndex(i => !i.title || !i.description || !i.category || !i.listPrice);
    if (invalidIndex !== -1) {
      return res.render('products/new-listing', {
        error: `Item ${invalidIndex + 1} is missing a required field (title, description, category, or price).`,
        items: rawItems
      });
    }

    const seller = await User.findById(req.session.user.id).lean();
    const docs = rawItems.map(i => ({
      sellerId: seller._id,
      sellerSnapshot: { username: seller.username, avatarUrl: seller.profile.avatarUrl, reputationScore: seller.reputation.score },
      title: i.title, description: i.description, category: i.category,
      condition: i.condition === 'new' ? 'new' : 'secondhand',
      images: i.images ? i.images.split(',').map(s => s.trim()).filter(Boolean) : [],
      tags: i.tags ? i.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
      pricing: { listPrice: Number(i.listPrice), negotiable: i.negotiable === 'on' },
      quantityAvailable: Number(i.quantity) || 1
    }));

    await Product.insertMany(docs);
    res.redirect('/products');
  } catch (err) {
    console.error(err);
    res.render('products/new-listing', { error: 'Could not create listing(s). Please try again.', items: [EMPTY_ROW] });
  }
});

const REVIEW_SORT_OPTIONS = {
  newest: { createdAt: -1 },
  highest: { rating: -1, createdAt: -1 },
  lowest: { rating: 1, createdAt: -1 }
};

router.get('/products/:id', async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).render('404', { message: 'That listing could not be found.' });
  Product.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec();

  // Reviews are read defensively: if the Review module/collection is gone,
  // the product page still renders with an empty reviews list.
  const reviewSortKey = REVIEW_SORT_OPTIONS[req.query.reviewSort] ? req.query.reviewSort : 'newest';
  let reviews = [];
  try {
    reviews = await require('../models/review.model').find({ productId: product._id, status: 'published' })
      .sort(REVIEW_SORT_OPTIONS[reviewSortKey]).lean();
  } catch (e) { /* review module unavailable */ }

  const isOwner = req.session.user && String(product.sellerId) === String(req.session.user.id);
  const isAdmin = req.session.user && req.session.user.role === 'admin';
  res.render('products/individual', { product, reviews, reviewSortKey, canManage: isOwner || isAdmin });
});

function canManageListing(req, product) {
  if (!req.session.user) return false;
  return String(product.sellerId) === String(req.session.user.id) || req.session.user.role === 'admin';
}

router.get('/products/:id/edit', requireLogin, async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).render('404', { message: 'That listing could not be found.' });
  if (!canManageListing(req, product)) return res.status(403).render('404', { message: "You don't have access to edit this listing." });
  res.render('products/edit-listing', { product, error: null });
});

router.post('/products/:id/edit', requireLogin, async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).render('404', { message: 'That listing could not be found.' });
  if (!canManageListing(req, product)) return res.status(403).render('404', { message: "You don't have access to edit this listing." });

  const { title, description, category, condition, listPrice, negotiable, quantity, images, tags } = req.body;
  if (!title || !description || !category || !listPrice) {
    return res.render('products/edit-listing', { product: { ...product.toObject(), ...req.body }, error: 'Please fill in all required fields.' });
  }
  product.title = title;
  product.description = description;
  product.category = category;
  product.condition = condition === 'new' ? 'new' : 'secondhand';
  product.pricing.listPrice = Number(listPrice);
  product.pricing.negotiable = negotiable === 'on';
  product.quantityAvailable = Number(quantity) || 1;
  product.images = images ? images.split(',').map(s => s.trim()).filter(Boolean) : [];
  product.tags = tags ? tags.split(',').map(s => s.trim()).filter(Boolean) : [];
  await product.save();
  res.redirect(`/products/${product._id}`);
});

router.post('/products/:id/delete', requireLogin, async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.redirect('/products');
  if (!canManageListing(req, product)) return res.status(403).render('404', { message: "You don't have access to delete this listing." });
  await Product.deleteOne({ _id: product._id });
  res.redirect('/products');
});

module.exports = router;
