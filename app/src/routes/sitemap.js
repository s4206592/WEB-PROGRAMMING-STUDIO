const express = require('express');
const { SitemapEntry, Product, BlogPost, ForumPost, Studio, Category } = require('../models');
const { requireStaff } = require('../middleware/auth');
const { asyncH } = require('../utils/helpers');

const router = express.Router();

/**
 * The sitemap is auto-generated: static routes are upserted at boot (see
 * seed.js) and dynamic entries are written whenever a listing, article,
 * thread or studio is published. This route rebuilds the dynamic half on
 * demand so the map never drifts from what is actually on the site.
 */
async function regenerateDynamic() {
  const now = new Date();
  const jobs = [];

  const products = await Product.find({ status: { $in: ['active', 'reserved'] } })
    .select('title slug updatedAt').lean();
  products.forEach(p => jobs.push({
    path: `/products/${p.slug}`, title: p.title, module: 'catalog',
    parentPath: '/products', depth: 3, sourceType: 'product', sourceId: p._id,
    changeFreq: 'weekly', priority: 0.6, lastmod: p.updatedAt
  }));

  const posts = await BlogPost.find({ status: 'published' }).select('title slug updatedAt').lean();
  posts.forEach(p => jobs.push({
    path: `/blog/${p.slug}`, title: p.title, module: 'blog',
    parentPath: '/blog', depth: 3, sourceType: 'blog_post', sourceId: p._id,
    changeFreq: 'monthly', priority: 0.5, lastmod: p.updatedAt
  }));

  const threads = await ForumPost.find({ status: { $in: ['open', 'answered'] } })
    .select('title slug updatedAt').lean();
  threads.forEach(t => jobs.push({
    path: `/forum/${t.slug}`, title: t.title, module: 'forum',
    parentPath: '/forum', depth: 3, sourceType: 'forum_post', sourceId: t._id,
    changeFreq: 'weekly', priority: 0.4, lastmod: t.updatedAt
  }));

  const studios = await Studio.find({ status: 'active' }).select('name slug updatedAt').lean();
  studios.forEach(s => jobs.push({
    path: `/studios/${s.slug}`, title: s.name, module: 'studios',
    parentPath: '/studios', depth: 3, sourceType: 'studio', sourceId: s._id,
    changeFreq: 'monthly', priority: 0.5, lastmod: s.updatedAt
  }));

  const liveDynamicPaths = new Set(jobs.map(j => j.path));

  for (const j of jobs) {
    await SitemapEntry.updateOne(
      { path: j.path },
      {
        $set: {
          title: j.title, module: j.module, parentPath: j.parentPath, depth: j.depth,
          isDynamic: true, sourceType: j.sourceType, sourceId: j.sourceId,
          seo: { changeFreq: j.changeFreq, priority: j.priority, lastmod: j.lastmod || now, noIndex: false },
          isActive: true, lastGeneratedAt: now
        }
      },
      { upsert: true }
    );
  }

  // Anything dynamic that no longer has live content is deactivated, not deleted —
  // the row keeps its history and can come back if the content is restored.
  const stale = await SitemapEntry.find({ isDynamic: true, isActive: true }).select('path').lean();
  const toDeactivate = stale.filter(s => !liveDynamicPaths.has(s.path)).map(s => s.path);
  if (toDeactivate.length) {
    await SitemapEntry.updateMany({ path: { $in: toDeactivate } }, { $set: { isActive: false } });
  }

  return { generated: jobs.length, deactivated: toDeactivate.length };
}

// ── Sitemap page ──────────────────────────────────────────────────
router.get('/sitemap', asyncH(async (req, res) => {
  await regenerateDynamic();

  const entries = await SitemapEntry.find({ isActive: true }).sort({ module: 1, depth: 1, path: 1 }).lean();

  // Only show pages this visitor could actually reach.
  const visible = entries.filter(e => {
    if (!e.requiresAuth) return true;
    if (!req.user) return false;
    if (e.module === 'admin') return req.user.hasRole('admin', 'staff');
    return true;
  });

  const MODULE_LABELS = {
    home: 'Home', account: 'User Account', catalog: 'Products & Listings',
    cart: 'Shopping Cart & Orders', wishlist: 'Wishlist', blog: 'Blog',
    forum: 'Forum', faq: 'FAQ', studios: 'Studios', admin: 'Administration',
    static: 'Site'
  };

  const byModule = {};
  visible.forEach(e => { (byModule[e.module] = byModule[e.module] || []).push(e); });

  res.render('sitemap/sitemap', {
    title: 'Sitemap',
    breadcrumb: 'Home / Sitemap',
    byModule, MODULE_LABELS,
    total: visible.length
  });
}));

// ── Search Sitemap ────────────────────────────────────────────────
router.get('/sitemap/search', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim();
  let results = [];
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    results = await SitemapEntry.find({
      isActive: true,
      $or: [{ title: rx }, { path: rx }]
    }).sort({ depth: 1, path: 1 }).limit(60).lean();

    results = results.filter(e => !e.requiresAuth || (req.user && (e.module !== 'admin' || req.user.hasRole('admin', 'staff'))));
  }
  res.render('sitemap/search', {
    title: 'Search Sitemap',
    breadcrumb: 'Home / Sitemap / Search',
    q, results
  });
}));

// ── SEO Integration ───────────────────────────────────────────────
router.get('/sitemap/seo', requireStaff, asyncH(async (req, res) => {
  const stats = await SitemapEntry.aggregate([
    { $group: {
        _id: { module: '$module', indexable: { $and: ['$isActive', { $not: '$seo.noIndex' }] } },
        n: { $sum: 1 }
    } }
  ]);

  const [indexable, noIndex, inactive, dynamic] = await Promise.all([
    SitemapEntry.countDocuments({ isActive: true, 'seo.noIndex': false }),
    SitemapEntry.countDocuments({ 'seo.noIndex': true }),
    SitemapEntry.countDocuments({ isActive: false }),
    SitemapEntry.countDocuments({ isDynamic: true })
  ]);

  const latest = await SitemapEntry.find({ isActive: true, 'seo.noIndex': false })
    .sort({ 'seo.lastmod': -1 }).limit(20).lean();

  res.render('sitemap/seo', {
    title: 'SEO Integration',
    breadcrumb: 'Home / Sitemap / SEO',
    stats, indexable, noIndex, inactive, dynamic, latest,
    baseUrl: `${req.protocol}://${req.get('host')}`
  });
}));

router.post('/sitemap/regenerate', requireStaff, asyncH(async (req, res) => {
  const result = await regenerateDynamic();
  req.flash('success', `Sitemap rebuilt: ${result.generated} live pages, ${result.deactivated} deactivated.`);
  res.redirect('/sitemap/seo');
}));

// ── sitemap.xml ───────────────────────────────────────────────────
router.get('/sitemap.xml', asyncH(async (req, res) => {
  await regenerateDynamic();
  const entries = await SitemapEntry.find({ isActive: true, 'seo.noIndex': false })
    .sort({ 'seo.priority': -1 }).limit(5000).lean();

  const base = `${req.protocol}://${req.get('host')}`;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const body = entries.map(e => [
    '  <url>',
    `    <loc>${esc(base + e.path)}</loc>`,
    e.seo?.lastmod ? `    <lastmod>${new Date(e.seo.lastmod).toISOString().slice(0, 10)}</lastmod>` : '',
    `    <changefreq>${e.seo?.changeFreq || 'weekly'}</changefreq>`,
    `    <priority>${(e.seo?.priority ?? 0.5).toFixed(1)}</priority>`,
    '  </url>'
  ].filter(Boolean).join('\n')).join('\n');

  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`
  );
}));

// ── robots.txt ────────────────────────────────────────────────────
router.get('/robots.txt', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send([
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /checkout',
    'Disallow: /cart',
    'Disallow: /account',
    'Disallow: /messages',
    'Disallow: /orders',
    'Disallow: /offers',
    'Disallow: /notifications',
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`
  ].join('\n'));
});

module.exports = router;
