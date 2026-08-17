const mongoose = require('mongoose');
const { Schema } = mongoose;

const reviewSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, required: true },
  productSnapshot: { title: String, image: String },
  orderId: { type: Schema.Types.ObjectId },
  reviewerId: { type: Schema.Types.ObjectId, required: true },
  reviewerSnapshot: { username: String, avatarUrl: String },
  rating: { type: Number, min: 1, max: 5, required: true },
  title: String,
  comment: { type: String, required: true },
  media: [String],
  helpfulVotes: { type: Number, default: 0 },
  status: { type: String, enum: ['published', 'flagged', 'removed'], default: 'published' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', reviewSchema);
