const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:   { type: String, required: true },
  query: {
    keywords:   String,
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    minPrice:   Number,
    maxPrice:   Number,
    conditions: [String],
    brands:     [String],
    province:   String,
    isNegotiable: Boolean
  },
  alertFrequency: { type: String, enum: ['instant', 'daily', 'weekly', 'off'], default: 'daily' },
  lastRunAt: Date,
  lastSeenProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  matchCount: { type: Number, default: 0 },
  isActive:   { type: Boolean, default: true }
}, { timestamps: true });

savedSearchSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
