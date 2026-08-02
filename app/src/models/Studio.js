const mongoose = require('mongoose');
const studioSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:    { type: String, required: true },
  slug:    { type: String, required: true, unique: true },
  description: String,
  coverImageUrl: String,
  gallery: [{ url: String, caption: String, order: Number }],

  address: {
    line1: String, ward: String, district: String,
    province: String, country: { type: String, default: 'VN' }
  },
  contact: { phone: String, email: String, website: String, facebook: String, instagram: String },

  equipment: [{ name: String, category: String, quantity: Number, productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' } }],
  amenities: [String],
  areaSqm:  Number,
  capacity: Number,
  pricing: [{ unit: { type: String, enum: ['hour', 'half_day', 'day'] }, price: Number, note: String }],
  openingHours: [{ day: Number, open: String, close: String, closed: Boolean }],

  verification: {
    status: { type: String, enum: ['unverified', 'pending', 'verified', 'rejected'], default: 'unverified' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    documents: [{ url: String, type: String }]
  },

  ratingSummary: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  status: { type: String, enum: ['draft', 'active', 'paused', 'suspended', 'removed'], default: 'active' },
  isFeatured: { type: Boolean, default: false }
}, { timestamps: true });

studioSchema.index({ status: 1, 'address.province': 1 });
studioSchema.index({ ownerId: 1 });
studioSchema.index({ name: 'text', description: 'text' });
module.exports = mongoose.model('Studio', studioSchema);
