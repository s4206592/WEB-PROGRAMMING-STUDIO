const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  sellerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  listingType: { type: String, enum: ['sale', 'wanted'], default: 'sale' },
  title:       { type: String, required: true, maxlength: 140, trim: true },
  slug:        { type: String, required: true, unique: true },
  description: { type: String, maxlength: 5000 },
  categoryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  categoryPath: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

  condition:    { type: String, enum: ['new', 'like_new', 'good', 'fair', 'for_parts'], default: 'good' },
  isSecondhand: { type: Boolean, default: true },
  brand:        String,
  model:        String,
  yearMade:     Number,
  attributes:   { type: Object, default: {} },

  price:         { type: Number, default: 0 },   // integer VND
  currency:      { type: String, default: 'VND' },
  originalPrice: Number,
  isNegotiable:  { type: Boolean, default: true },
  minAcceptable: Number,                         // seller-private floor — never send to client

  bulkPricing: [{ minQty: Number, unitPrice: Number }],

  quantity:     { type: Number, default: 1, min: 0 },
  quantitySold: { type: Number, default: 0 },

  media: [{
    url: String,
    type: { type: String, enum: ['image', 'video'], default: 'image' },
    isPrimary: { type: Boolean, default: false },
    order: { type: Number, default: 0 }
  }],

  location: {
    province: String,
    district: String
  },

  shipping: {
    methods:        { type: [String], default: ['standard'] },
    feeFlat:        { type: Number, default: 0 },
    freeOverAmount: Number,
    handlingDays:   { type: Number, default: 2 }
  },

  ratingSummary: {
    average: { type: Number, default: 0 },
    count:   { type: Number, default: 0 },
    distribution: {
      '1': { type: Number, default: 0 }, '2': { type: Number, default: 0 },
      '3': { type: Number, default: 0 }, '4': { type: Number, default: 0 },
      '5': { type: Number, default: 0 }
    }
  },

  stats: {
    views:      { type: Number, default: 0 },
    wishlisted: { type: Number, default: 0 },
    offers:     { type: Number, default: 0 }
  },

  status: {
    type: String,
    enum: ['draft', 'pending_review', 'active', 'reserved', 'sold', 'paused', 'rejected', 'removed'],
    default: 'active'
  },
  reservedForOfferId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
  reservedUntil:      Date,

  wanted: {
    budgetMin: Number,
    budgetMax: Number,
    acceptableConditions: [String],
    offeringInReturn: String
  },

  moderation: {
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    note:       String
  },

  isFeatured:    { type: Boolean, default: false },
  featuredUntil: Date,
  publishedAt:   Date
}, { timestamps: true });

productSchema.index({ status: 1, categoryPath: 1, price: 1 });
productSchema.index({ status: 1, publishedAt: -1 });
productSchema.index({ sellerId: 1, status: 1 });
productSchema.index({ 'ratingSummary.average': -1, 'ratingSummary.count': -1 });
productSchema.index({ title: 'text', description: 'text', brand: 'text' });

productSchema.virtual('primaryImage').get(function () {
  if (!this.media || !this.media.length) return null;
  const p = this.media.find(m => m.isPrimary) || this.media[0];
  return p ? p.url : null;
});
productSchema.virtual('available').get(function () {
  return Math.max(0, (this.quantity || 0) - (this.quantitySold || 0));
});
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
