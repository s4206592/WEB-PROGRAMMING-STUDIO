const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
  sellerId: { type: Schema.Types.ObjectId },
  sellerSnapshot: {
    username: String,
    avatarUrl: String,
    reputationScore: Number
  },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  tags: [String],
  condition: { type: String, enum: ['new', 'secondhand'], default: 'secondhand' },
  images: [String],
  pricing: {
    listPrice: { type: Number, required: true },
    currency: { type: String, default: 'VND' },
    negotiable: { type: Boolean, default: true }
  },
  quantityAvailable: { type: Number, default: 1 },
  status: { type: String, enum: ['active', 'pending', 'sold', 'removed'], default: 'active' },
  ratingSummary: {
    avg: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },
  viewCount: { type: Number, default: 0 },
  sampleData: { type: Boolean, default: false }, // true for seeded test listings
  createdAt: { type: Date, default: Date.now }
});

productSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Product', productSchema);
