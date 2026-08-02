const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  orderId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  orderItemId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  reviewerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  rating:  { type: Number, required: true, min: 1, max: 5 },
  title:   { type: String, maxlength: 120 },
  comment: { type: String, maxlength: 2000 },

  media: [{ url: String, type: { type: String, enum: ['image', 'video'], default: 'image' }, thumbUrl: String, order: Number }],

  aspectRatings: {
    accuracy: Number, condition: Number, communication: Number, shipping: Number
  },

  isVerifiedPurchase: { type: Boolean, default: true },
  helpfulCount:    { type: Number, default: 0 },
  notHelpfulCount: { type: Number, default: 0 },

  sellerReply: { body: String, repliedAt: Date },

  status: { type: String, enum: ['published', 'pending', 'flagged', 'hidden', 'removed'], default: 'published' },
  moderation: {
    reportCount: { type: Number, default: 0 },
    reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:  Date,
    note:        String
  },
  editedAt: Date
}, { timestamps: true });

reviewSchema.index({ productId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ productId: 1, status: 1, rating: -1 });
reviewSchema.index({ productId: 1, status: 1, helpfulCount: -1 });
reviewSchema.index({ reviewerId: 1, createdAt: -1 });
reviewSchema.index({ sellerId: 1, status: 1 });

// Keep products.ratingSummary in sync — one $group per write.
reviewSchema.statics.recomputeSummary = async function (productId) {
  const Product = mongoose.model('Product');
  const rows = await this.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(String(productId)), status: 'published' } },
    { $group: { _id: '$rating', n: { $sum: 1 } } }
  ]);
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0, sum = 0;
  rows.forEach(r => { dist[r._id] = r.n; total += r.n; sum += r._id * r.n; });
  await Product.updateOne({ _id: productId }, {
    $set: {
      'ratingSummary.average': total ? Math.round((sum / total) * 10) / 10 : 0,
      'ratingSummary.count': total,
      'ratingSummary.distribution': dist
    }
  });
};

module.exports = mongoose.model('Review', reviewSchema);
