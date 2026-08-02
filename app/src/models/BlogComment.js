const mongoose = require('mongoose');
const blogCommentSchema = new mongoose.Schema({
  postId:   { type: mongoose.Schema.Types.ObjectId, ref: 'BlogPost', required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogComment', default: null },
  body:     { type: String, maxlength: 1500, required: true },
  likeCount: { type: Number, default: 0 },
  status:   { type: String, enum: ['published', 'flagged', 'hidden', 'removed'], default: 'published' },
  reportCount: { type: Number, default: 0 },
  editedAt: Date
}, { timestamps: true });
blogCommentSchema.index({ postId: 1, parentId: 1, createdAt: 1 });
blogCommentSchema.index({ authorId: 1, createdAt: -1 });
module.exports = mongoose.model('BlogComment', blogCommentSchema);
