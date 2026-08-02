const mongoose = require('mongoose');
const sitemapEntrySchema = new mongoose.Schema({
  path:  { type: String, required: true, unique: true },
  title: String,
  module: { type: String, enum: ['home', 'account', 'catalog', 'cart', 'wishlist', 'blog', 'forum', 'faq', 'studios', 'admin', 'static'], default: 'static' },
  parentPath: String,
  depth: { type: Number, default: 1 },
  isDynamic: { type: Boolean, default: false },
  sourceType: { type: String, enum: ['product', 'blog_post', 'forum_post', 'studio', 'category', null], default: null },
  sourceId: mongoose.Schema.Types.ObjectId,
  seo: {
    changeFreq: { type: String, enum: ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly'], default: 'weekly' },
    priority:   { type: Number, default: 0.5 },
    lastmod:    Date,
    noIndex:    { type: Boolean, default: false }
  },
  requiresAuth:  { type: Boolean, default: false },
  requiredRoles: [String],
  isActive: { type: Boolean, default: true },
  lastGeneratedAt: Date
}, { timestamps: true });
sitemapEntrySchema.index({ module: 1, depth: 1 });
sitemapEntrySchema.index({ parentPath: 1 });
sitemapEntrySchema.index({ isActive: 1, 'seo.noIndex': 1 });
sitemapEntrySchema.index({ title: 'text', path: 'text' });
module.exports = mongoose.model('SitemapEntry', sitemapEntrySchema);
