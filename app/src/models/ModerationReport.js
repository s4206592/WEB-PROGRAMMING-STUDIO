const mongoose = require('mongoose');
const moderationReportSchema = new mongoose.Schema({
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: {
    type: String,
    enum: ['product', 'review', 'forum_post', 'forum_reply', 'blog_post', 'blog_comment', 'message', 'user', 'studio'],
    required: true
  },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: {
    type: String,
    enum: ['spam', 'scam', 'counterfeit', 'offensive', 'harassment', 'off_topic', 'duplicate', 'illegal', 'other'],
    default: 'other'
  },
  details: String,
  status: { type: String, enum: ['pending', 'under_review', 'actioned', 'dismissed'], default: 'pending' },
  resolution: {
    moderatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, enum: ['none', 'content_hidden', 'content_removed', 'user_warned', 'user_suspended', 'user_banned'] },
    note: String,
    resolvedAt: Date
  }
}, { timestamps: true });
moderationReportSchema.index({ status: 1, createdAt: 1 });
moderationReportSchema.index({ targetType: 1, targetId: 1 });
moderationReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
module.exports = mongoose.model('ModerationReport', moderationReportSchema);
