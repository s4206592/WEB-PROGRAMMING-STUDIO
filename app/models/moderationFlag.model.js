const mongoose = require('mongoose');
const { Schema } = mongoose;

const moderationFlagSchema = new Schema({
  targetType: { type: String, enum: ['review', 'forum_post', 'forum_reply', 'blog_post', 'blog_comment'] },
  targetId: Schema.Types.ObjectId,
  targetSnapshot: Schema.Types.Mixed,
  flaggedBy: Schema.Types.ObjectId,
  reason: String,
  status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ModerationFlag', moderationFlagSchema);
