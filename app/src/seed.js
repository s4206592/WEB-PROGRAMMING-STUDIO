/**
 * Seeding policy for this project
 * --------------------------------
 * User-generated collections stay EMPTY — no demo listings, orders, reviews,
 * forum threads, blog posts or extra accounts. The site launches the way a real
 * marketplace does on day one: nothing in it until someone signs up and posts.
 *
 * Two things ARE seeded, because they are configuration rather than content:
 *   1. The admin account (so the features can be walked through end to end).
 *   2. Taxonomy — product categories, blog categories, FAQ categories. Without
 *      these the "create a listing" and "write an article" forms have empty
 *      dropdowns and nothing can be posted at all.
 *
 * Both are idempotent: safe to run on every boot, and safe to re-run by hand
 * with `npm run seed`.
 */

const { slugify } = require('./utils/helpers');
const {
  User, Category, BlogCategory, FaqCategory, SitemapEntry
} = require('./models');

// ── Product categories (two levels, matching the wireframe filters) ──
const CATEGORY_TREE = [
  { name: 'Lighting', children: ['Studio Lights', 'Softboxes', 'Ring Lights', 'Reflectors', 'Light Stands'] },
  { name: 'Cameras',  children: ['Mirrorless Bodies', 'DSLR Bodies', 'Lenses', 'Cinema Cameras'] },
  { name: 'Audio',    children: ['Microphones', 'Recorders', 'Audio Interfaces'] },
  { name: 'Support',  children: ['Tripods', 'Gimbals', 'Sliders', 'Backdrop Stands'] },
  { name: 'Backdrops', children: ['Paper Backdrops', 'Fabric Backdrops', 'Green Screens'] },
  { name: 'Accessories', children: ['Batteries & Chargers', 'Memory Cards', 'Bags & Cases', 'Cables'] }
];

const BLOG_CATEGORIES = [
  ['Buying Guides', 'How to choose gear without overpaying.'],
  ['Selling Tips', 'Photograph, price and describe your listing well.'],
  ['Equipment Reviews', 'Hands-on write-ups from the community.'],
  ['Tutorials', 'Lighting, audio and studio technique.'],
  ['Marketplace Safety', 'Spotting fakes, avoiding scams, meeting safely.'],
  ['Community Stories', 'What people are building with their kit.']
];

const FAQ_CATEGORIES = [
  ['Purchasing & Shipping', 'Placing orders, delivery times, tracking.'],
  ['Returns & Refunds', 'The 15-day return window and how disputes work.'],
  ['Payments', 'Bank transfer, cash on delivery, confirming payment.'],
  ['Hardware', 'Condition grades, compatibility, testing used gear.'],
  ['Rentals', 'Renting studio space and equipment.'],
  ['Account & General', 'Sign-up, verification, notifications, privacy.'],
  ['Studios', 'Listing a studio and handling booking enquiries.']
];

// ── Static routes registered in the sitemap on boot ──
const STATIC_ROUTES = [
  ['/', 'Home', 'home', null, 1, { priority: 1.0, changeFreq: 'daily' }],
  ['/products', 'Product Listing', 'catalog', '/', 2, { priority: 0.9, changeFreq: 'hourly' }],
  ['/register', 'Register', 'account', '/', 2, { priority: 0.5 }],
  ['/login', 'Login', 'account', '/', 2, { priority: 0.5 }],
  ['/account/profile', 'Profile', 'account', '/', 2, { noIndex: true }, true],
  ['/account/settings', 'Account Settings', 'account', '/account/profile', 3, { noIndex: true }, true],
  ['/account/activity', 'Activity History', 'account', '/account/profile', 3, { noIndex: true }, true],
  ['/sell/new', 'Create a Listing', 'catalog', '/products', 3, { noIndex: true }, true],
  ['/sell/listings', 'My Listings', 'catalog', '/products', 3, { noIndex: true }, true],
  ['/cart', 'Shopping Cart', 'cart', '/', 2, { noIndex: true }, true],
  ['/checkout/delivery', 'Checkout — Delivery', 'cart', '/cart', 3, { noIndex: true }, true],
  ['/checkout/payment', 'Checkout — Payment', 'cart', '/cart', 3, { noIndex: true }, true],
  ['/checkout/review', 'Checkout — Review Order', 'cart', '/cart', 3, { noIndex: true }, true],
  ['/orders', 'My Orders', 'cart', '/', 2, { noIndex: true }, true],
  ['/orders/sales', 'Sales (Seller Queue)', 'cart', '/orders', 3, { noIndex: true }, true],
  ['/wishlist', 'Wishlist', 'wishlist', '/', 2, { noIndex: true }, true],
  ['/wishlist/saved-searches', 'Saved Searches', 'wishlist', '/wishlist', 3, { noIndex: true }, true],
  ['/offers', 'Offers', 'catalog', '/', 2, { noIndex: true }, true],
  ['/messages', 'Messages', 'account', '/', 2, { noIndex: true }, true],
  ['/notifications', 'Notification Center', 'account', '/', 2, { noIndex: true }, true],
  ['/blog', 'Blog Listing', 'blog', '/', 2, { priority: 0.8, changeFreq: 'daily' }],
  ['/blog/search', 'Search Articles', 'blog', '/blog', 3, { priority: 0.4 }],
  ['/blog/submit', 'Blog Submission', 'blog', '/blog', 3, { noIndex: true }, true],
  ['/blog/review-dashboard', 'Staff Review Dashboard', 'blog', '/blog', 3, { noIndex: true }, true],
  ['/forum', 'Forum Landing', 'forum', '/', 2, { priority: 0.8, changeFreq: 'hourly' }],
  ['/forum/new', 'New Post', 'forum', '/forum', 3, { noIndex: true }, true],
  ['/forum/manage', 'Post Management', 'forum', '/forum', 3, { noIndex: true }, true],
  ['/forum/moderation', 'Moderation Dashboard', 'forum', '/forum', 3, { noIndex: true }, true],
  ['/faq', 'FAQ', 'faq', '/', 2, { priority: 0.7 }],
  ['/faq/submit', 'Submit a Question', 'faq', '/faq', 3, { priority: 0.4 }],
  ['/studios', 'Studios', 'studios', '/', 2, { priority: 0.7 }],
  ['/studios/dashboard', 'Studio Owner Dashboard', 'studios', '/studios', 3, { noIndex: true }, true],
  ['/admin', 'Administration', 'admin', '/', 2, { noIndex: true }, true],
  ['/admin/users', 'User Management', 'admin', '/admin', 3, { noIndex: true }, true],
  ['/admin/transactions', 'Transaction Records', 'admin', '/admin', 3, { noIndex: true }, true],
  ['/admin/moderation', 'Content Moderation', 'admin', '/admin', 3, { noIndex: true }, true],
  ['/admin/analytics', 'Analytics Dashboard', 'admin', '/admin', 3, { noIndex: true }, true],
  ['/sitemap', 'Sitemap', 'static', '/', 2, { priority: 0.3 }],
  ['/sitemap/search', 'Search Sitemap', 'static', '/sitemap', 3, { priority: 0.2 }],
  ['/sitemap/seo', 'SEO Integration', 'static', '/sitemap', 3, { noIndex: true }]
];

async function ensureReferenceData() {
  // Product categories
  if (await Category.countDocuments() === 0) {
    for (let i = 0; i < CATEGORY_TREE.length; i++) {
      const node = CATEGORY_TREE[i];
      const parent = await Category.create({
        name: node.name, slug: slugify(node.name), parentId: null,
        ancestors: [], displayOrder: i, isActive: true
      });
      for (let j = 0; j < node.children.length; j++) {
        const child = node.children[j];
        await Category.create({
          name: child, slug: slugify(child), parentId: parent._id,
          ancestors: [parent._id], displayOrder: j, isActive: true
        });
      }
    }
    console.log('✓ Seeded product categories');
  }

  if (await BlogCategory.countDocuments() === 0) {
    await BlogCategory.insertMany(BLOG_CATEGORIES.map(([name, description], i) => ({
      name, slug: slugify(name), description, displayOrder: i, isActive: true
    })));
    console.log('✓ Seeded blog categories');
  }

  if (await FaqCategory.countDocuments() === 0) {
    await FaqCategory.insertMany(FAQ_CATEGORIES.map(([name, description], i) => ({
      name, slug: slugify(name), description, displayOrder: i, isActive: true
    })));
    console.log('✓ Seeded FAQ categories (no questions yet — add them from /admin)');
  }

  // Sitemap: static routes are upserted on every boot so the map never drifts
  // from the route table. Dynamic entries are added as content is created.
  for (const [path, title, mod, parentPath, depth, seo, requiresAuth] of STATIC_ROUTES) {
    await SitemapEntry.updateOne(
      { path },
      {
        $set: {
          title, module: mod, parentPath, depth,
          isDynamic: false, sourceType: null,
          seo: {
            changeFreq: seo.changeFreq || 'weekly',
            priority: seo.priority != null ? seo.priority : 0.5,
            lastmod: new Date(),
            noIndex: !!seo.noIndex
          },
          requiresAuth: !!requiresAuth,
          isActive: true,
          lastGeneratedAt: new Date()
        }
      },
      { upsert: true }
    );
  }
}

async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@studiotrade.local').toLowerCase();
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const phone = process.env.ADMIN_PHONE || '+84900000000';

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    // Keep the roles correct even if the account was edited by hand.
    const needed = ['admin', 'staff', 'moderator', 'buyer', 'seller'];
    const missing = needed.filter(r => !existing.roles.includes(r));
    if (missing.length) {
      existing.roles.push(...missing);
      await existing.save();
      console.log('✓ Admin roles repaired for', existing.email);
    }
    return existing;
  }

  const admin = new User({
    username, email, phone,
    fullName: 'StudioTrade Administrator',
    roles: ['admin', 'staff', 'moderator', 'buyer', 'seller'],
    verification: { emailVerified: true, phoneVerified: true, identityStatus: 'verified' },
    status: 'active'
  });
  await admin.setPassword(password);
  await admin.save();

  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  Admin account created                      │');
  console.log('  ├─────────────────────────────────────────────┤');
  console.log('  │  Email:    ' + email.padEnd(33) + '│');
  console.log('  │  Password: ' + password.padEnd(33) + '│');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('  Change this password after your first sign-in.');
  console.log('');
  return admin;
}

module.exports = { ensureAdmin, ensureReferenceData };

// Allow `npm run seed` to run this standalone.
if (require.main === module) {
  require('dotenv').config();
  const { connectDB } = require('./config/db');
  (async () => {
    await connectDB();
    await ensureReferenceData();
    await ensureAdmin();
    console.log('✓ Seed complete.');
    process.exit(0);
  })().catch(err => { console.error(err); process.exit(1); });
}
