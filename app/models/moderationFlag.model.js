const mongoose = require('mongoose');
const { Schema } = mongoose;

const moderationFlagSchema = new Schema({
  targetType: { type: String, enum: ['review', 'forum_post', 'forum_reply', 'blog_post', 'blog_comment', 'studio', 'studio_review'] },
  targetId: Schema.Types.ObjectId,
  targetSnapshot: Schema.Types.Mixed,
  flaggedBy: Schema.Types.ObjectId,
  reason: String,
  status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
  sampleData: { type: Boolean, default: false }
});

moderationFlagSchema.index({ status: 1, targetType: 1 });
moderationFlagSchema.index({ flaggedBy: 1 });

module.exports = mongoose.model('ModerationFlag', moderationFlagSchema);
