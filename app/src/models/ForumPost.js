const mongoose = require('mongoose');

const forumPostSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:    { type: String, required: true, maxlength: 200 },
  slug:     { type: String, required: true, unique: true },
  bodyHtml: String,            // sanitised server-side
  attachments: [{ url: String, type: String, name: String }],
  tags: [String],

  score:      { type: Number, default: 0 },
  upvotes:    { type: Number, default: 0 },
  downvotes:  { type: Number, default: 0 },
  replyCount: { type: Number, default: 0 },
  viewCount:  { type: Number, default: 0 },
  acceptedAnswerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumReply', default: null },

  isPinned: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
  lastActivityAt: { type: Date, default: Date.now },

  status: { type: String, enum: ['open', 'answered', 'closed', 'flagged', 'removed'], default: 'open' },
  moderation: {
    reportCount: { type: Number, default: 0 },
    reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:  Date,
    action: { type: String, enum: ['none', 'edited', 'locked', 'removed'], default: 'none' }
  }
}, { timestamps: true });

forumPostSchema.index({ status: 1, lastActivityAt: -1 });
forumPostSchema.index({ status: 1, score: -1, createdAt: -1 });
forumPostSchema.index({ tags: 1, status: 1, lastActivityAt: -1 });
forumPostSchema.index({ authorId: 1, createdAt: -1 });
forumPostSchema.index({ title: 'text', bodyHtml: 'text' });

module.exports = mongoose.model('ForumPost', forumPostSchema);
