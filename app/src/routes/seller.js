const express = require('express');
const {
  Product, Category, PriceHistory, User, SitemapEntry, ActivityLog, Wishlist, Notification
} = require('../models');
const { requireAuth } = require('../middleware/auth');
const { asyncH, uniqueSlug, parseVND, isObjectId } = require('../utils/helpers');

const router = express.Router();

/** Collect image URLs from the repeated mediaUrl[] inputs. */
function collectMedia(body) {
  return [].concat(body.mediaUrl || [])
    .map(u => String(u).trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((url, i) => ({ url, type: 'image', isPrimary: i === 0, order: i }));
}

function collectBulk(body) {
  const qtys = [].concat(body.bulkMinQty || []);
  const prices = [].concat(body.bulkUnitPrice || []);
  const tiers = [];
  for (let i = 0; i < qtys.length; i++) {
    const minQty = parseInt(qtys[i], 10);
    const unitPrice = parseVND(prices[i]);
    if (minQty > 1 && unitPrice > 0) tiers.push({ minQty, unitPrice });
  }
  return tiers.sort((a, b) => a.minQty - b.minQty);
}

async function categoryOptions() {
  const cats = await Category.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
  const roots = cats.filter(c => !c.parentId);
  return roots.map(r => ({
    ...r,
    children: cats.filter(c => String(c.parentId) === String(r._id))
  }));
}

/** Read + validate the listing form. Returns { data, errors }. */
function readListingForm(body) {
  const errors = [];
  const listingType = body.listingType === 'wanted' ? 'wanted' : 'sale';
  const title = String(body.title || '').trim().slice(0, 140);
  const price = parseVND(body.price);
  const media = collectMedia(body);
  const minAcceptable = parseVND(body.minAcceptable);

  if (title.length < 5) errors.push('Give the listing a title of at least 5 characters.');
  if (!isObjectId(body.categoryId)) errors.push('Choose a category.');
  if (listingType === 'sale' && price <= 0) errors.push('Set a price above 0₫.');
  if (listingType === 'sale' && !media.length) errors.push('Add at least one image URL.');
  if (minAcceptable && minAcceptable > price) errors.push('The minimum you will accept cannot be above your asking price.');

  const data = {
    listingType, title, price, media, minAcceptable: minAcceptable || undefined,
    description: String(body.description || '').trim().slice(0, 5000),
    categoryId: isObjectId(body.categoryId) ? body.categoryId : undefined,
    condition: ['new', 'like_new', 'good', 'fair', 'for_parts'].includes(body.condition) ? body.condition : 'good',
    isSecondhand: body.condition !== 'new',
    brand: String(body.brand || '').trim().slice(0, 60),
    model: String(body.model || '').trim().slice(0, 60),
    yearMade: parseInt(body.yearMade, 10) || undefined,
    originalPrice: parseVND(body.originalPrice) || undefined,
    isNegotiable: body.isNegotiable === 'on',
    quantity: Math.max(1, parseInt(body.quantity, 10) || 1),
    bulkPricing: collectBulk(body),
    location: {
      province: String(body.province || '').trim(),
      district: String(body.district || '').trim()
    },
    shipping: {
      methods: [].concat(body.shippingMethod || ['standard']),
      feeFlat: parseVND(body.shippingFee),
      handlingDays: parseInt(body.handlingDays, 10) || 2
    },
    wanted: listingType === 'wanted' ? {
      budgetMin: parseVND(body.budgetMin),
      budgetMax: parseVND(body.budgetMax),
      offeringInReturn: String(body.offeringInReturn || '').slice(0, 300)
    } : undefined
  };
  return { data, errors };
}

// ── My listings ───────────────────────────────────────────────────
router.get('/listings', requireAuth, asyncH(async (req, res) => {
  const listings = await Product.find({ sellerId: req.user._id, status: { $ne: 'removed' } })
    .sort({ createdAt: -1 }).lean();
  res.render('seller/my-listings', {
    title: 'My Listings',
    breadcrumb: 'Home / My Listings',
    listings
  });
}));

// ── Create ────────────────────────────────────────────────────────
router.get('/new', requireAuth, asyncH(async (req, res) => {
  res.render('seller/listing-form', {
    title: 'Create a Listing',
    breadcrumb: 'Home / Product Listing / New Listing',
    categories: await categoryOptions(),
    product: null, form: {}, errors: []
  });
}));

router.post('/new', requireAuth, asyncH(async (req, res) => {
  const { data, errors } = readListingForm(req.body);
  if (errors.length) {
    return res.status(400).render('seller/listing-form', {
      title: 'Create a Listing',
      breadcrumb: 'Home / Product Listing / New Listing',
      categories: await categoryOptions(),
      product: null, form: req.body, errors
    });
  }

  const category = await Category.findById(data.categoryId).lean();
  const product = await Product.create({
    ...data,
    sellerId: req.user._id,
    slug: uniqueSlug(data.title),
    categoryPath: category ? [...(category.ancestors || []), category._id] : [],
    status: 'active',           // this build publishes directly; no staff gate
    publishedAt: new Date()
  });

  await PriceHistory.create({ productId: product._id, price: product.price, changedBy: 'seller' });

  // First published listing lazily initialises the seller profile.
  if (!req.user.sellerProfile?.joinedAsSellerAt) {
    req.user.sellerProfile = {
      displayName: req.user.fullName || req.user.username,
      rating: 0, ratingCount: 0, totalSales: 0, responseRatePct: 100,
      joinedAsSellerAt: new Date()
    };
    if (!req.user.roles.includes('seller')) req.user.roles.push('seller');
    await req.user.save();
  }

  // Sitemap auto-generation: a new public page means a new entry.
  await SitemapEntry.updateOne(
    { path: `/products/${product.slug}` },
    {
      $set: {
        title: product.title, module: 'catalog', parentPath: '/products', depth: 3,
        isDynamic: true, sourceType: 'product', sourceId: product._id,
        seo: { changeFreq: 'weekly', priority: 0.6, lastmod: new Date(), noIndex: false },
        isActive: true, lastGeneratedAt: new Date()
      }
    },
    { upsert: true }
  );

  ActivityLog.create({
    userId: req.user._id, action: 'listing_created',
    targetType: 'product', targetId: product._id
  }).catch(() => {});

  req.flash('success', 'Listing published.');
  res.redirect(`/products/${product.slug}`);
}));

// ── Edit ──────────────────────────────────────────────────────────
router.get('/:id/edit', requireAuth, asyncH(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, sellerId: req.user._id });
  if (!product) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'That listing is not yours, or no longer exists.' });
  }
  res.render('seller/listing-form', {
    title: 'Edit Listing',
    breadcrumb: `Home / My Listings / ${product.title}`,
    categories: await categoryOptions(),
    product, form: {}, errors: []
  });
}));

router.post('/:id/edit', requireAuth, asyncH(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, sellerId: req.user._id });
  if (!product) {
    return res.status(404).render('error', { title: 'Not found', status: 404, message: 'That listing is not yours.' });
  }
  const { data, errors } = readListingForm(req.body);
  if (errors.length) {
    return res.status(400).render('seller/listing-form', {
      title: 'Edit Listing',
      breadcrumb: `Home / My Listings / ${product.title}`,
      categories: await categoryOptions(),
      product, form: req.body, errors
    });
  }

  const oldPrice = product.price;
  const category = await Category.findById(data.categoryId).lean();
  Object.assign(product, data);
  product.categoryPath = category ? [...(category.ancestors || []), category._id] : [];
  await product.save();

  // Price change and price_history are written together — never one without
  // the other, or the Wishlist price-drop alerts go blind.
  if (oldPrice !== product.price) {
    await PriceHistory.create({ productId: product._id, price: product.price, changedBy: 'seller' });
    if (product.price < oldPrice) await fanOutPriceDrop(product, oldPrice);
  }

  req.flash('success', 'Listing updated.');
  res.redirect(`/products/${product.slug}`);
}));

/** Price-drop pipeline: notify every wishlist watching this product. */
async function fanOutPriceDrop(product, oldPrice) {
  const watchers = await Wishlist.find({
    'items.productId': product._id,
    'items.alerts.onPriceDrop': true
  }).lean();

  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);   // debounce, 24h
  const docs = [];
  for (const w of watchers) {
    const item = w.items.find(i => String(i.productId) === String(product._id));
    if (!item || !item.alerts?.onPriceDrop) continue;
    if (item.lastNotifiedAt && item.lastNotifiedAt > cutoff) continue;
    if (item.priceAtSave != null && product.price >= item.priceAtSave) continue;
    if (item.alerts.priceThreshold && product.price > item.alerts.priceThreshold) continue;
    if (String(w.userId) === String(product.sellerId)) continue;   // no self-alerts

    docs.push({
      userId: w.userId,
      type: 'price_drop',
      title: 'Price drop on a saved item',
      body: `${product.title} is now cheaper than when you saved it.`,
      linkUrl: `/products/${product.slug}`,
      targetType: 'product', targetId: product._id
    });
  }
  if (docs.length) {
    await Notification.insertMany(docs);
    await Wishlist.updateMany(
      { 'items.productId': product._id },
      { $set: { 'items.$[el].lastNotifiedAt': new Date(), 'items.$[el].lowestSeenPrice': product.price } },
      { arrayFilters: [{ 'el.productId': product._id }] }
    );
  }
}

// ── Status changes ────────────────────────────────────────────────
router.post('/:id/status', requireAuth, asyncH(async (req, res) => {
  const next = req.body.status;
  if (!['active', 'paused', 'removed'].includes(next)) {
    req.flash('error', 'Unknown status.');
    return res.redirect('/sell/listings');
  }
  const product = await Product.findOne({ _id: req.params.id, sellerId: req.user._id });
  if (!product) {
    req.flash('error', 'That listing is not yours.');
    return res.redirect('/sell/listings');
  }
  if (product.status === 'reserved' || product.status === 'sold') {
    req.flash('error', 'A reserved or sold listing cannot be changed here.');
    return res.redirect('/sell/listings');
  }
  product.status = next;
  if (next === 'active' && !product.publishedAt) product.publishedAt = new Date();
  await product.save();

  await SitemapEntry.updateOne(
    { path: `/products/${product.slug}` },
    { $set: { isActive: next === 'active' } }
  );

  req.flash('success', next === 'removed' ? 'Listing taken down.' : `Listing set to ${next}.`);
  res.redirect('/sell/listings');
}));

module.exports = router;
