const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  price:     { type: Number, required: true },
  changedBy: { type: String, enum: ['seller', 'system', 'promotion'], default: 'seller' }
}, { timestamps: { createdAt: true, updatedAt: false } });

priceHistorySchema.index({ productId: 1, createdAt: -1 });

module.exports = mongoose.model('PriceHistory', priceHistorySchema);
