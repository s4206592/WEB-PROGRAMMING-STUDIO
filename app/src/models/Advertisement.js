const mongoose = require('mongoose');
const advertisementSchema = new mongoose.Schema({
  advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['featured_listing', 'banner', 'sponsored_studio', 'sidebar', 'newsletter'], default: 'featured_listing' },
  targetType: { type: String, enum: ['product', 'studio', 'blog_post', 'external'] },
  targetId: mongoose.Schema.Types.ObjectId,
  externalUrl: String,
  creative: { imageUrl: String, headline: String, bodyText: String, ctaLabel: String },
  placement: [String],
  categoryTargets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  provinceTargets: [String],
  budget: { type: Number, default: 0 },
  spent:  { type: Number, default: 0 },
  bidModel: { type: String, enum: ['flat', 'cpc', 'cpm'], default: 'flat' },
  startAt: Date,
  endAt:   Date,
  stats: { impressions: { type: Number, default: 0 }, clicks: { type: Number, default: 0 }, conversions: { type: Number, default: 0 } },
  status: { type: String, enum: ['draft', 'pending_approval', 'active', 'paused', 'completed', 'rejected'], default: 'pending_approval' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
advertisementSchema.index({ status: 1, startAt: 1, endAt: 1 });
advertisementSchema.index({ advertiserId: 1, status: 1 });
module.exports = mongoose.model('Advertisement', advertisementSchema);
