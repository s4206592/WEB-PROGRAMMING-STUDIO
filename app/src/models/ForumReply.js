const mongoose = require('mongoose');
const forumReplySchema = new mongoose.Schema({
  postId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ForumPost', required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumReply', default: null },
  bodyHtml: String,
  attachments: [{ url: String, type: String }],
  score:     { type: Number, default: 0 },
  upvotes:   { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  isAccepted: { type: Boolean, default: false },
  status: { type: String, enum: ['published', 'flagged', 'hidden', 'removed'], default: 'published' },
  reportCount: { type: Number, default: 0 },
  editedAt: Date
}, { timestamps: true });
forumReplySchema.index({ postId: 1, isAccepted: -1, score: -1 });
forumReplySchema.index({ authorId: 1, createdAt: -1 });
module.exports = mongoose.model('ForumReply', forumReplySchema);
