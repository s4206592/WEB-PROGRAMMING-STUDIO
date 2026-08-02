const mongoose = require('mongoose');

const reviewVoteSchema = new mongoose.Schema({
  reviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', required: true },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  value:    { type: Number, enum: [1, -1], required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

reviewVoteSchema.index({ reviewId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('ReviewVote', reviewVoteSchema);
