const mongoose = require('mongoose');
const { Schema } = mongoose;

// Own collection, separate from wishlists.items — a saved search has no
// specific product attached, just a filter to re-run later.
const savedSearchSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  queryParams: {
    q: String,
    category: String,
    condition: String,
    minPrice: Number,
    maxPrice: Number
  },
  label: { type: String, default: '' }, // short human-readable summary, e.g. "Cameras under ₫20,000,000"
  alertsEnabled: { type: Boolean, default: true },
  lastNotifiedAt: Date,
  createdAt: { type: Date, default: Date.now },
  sampleData: { type: Boolean, default: false }
});

savedSearchSchema.index({ userId: 1 });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
