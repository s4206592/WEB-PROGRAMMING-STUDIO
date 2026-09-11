const mongoose = require('mongoose');
const { Schema } = mongoose;

const blogPostSchema = new Schema({
  authorId: { type: Schema.Types.ObjectId, required: true },
  authorSnapshot: { username: String },
  title: { type: String, required: true },
  category: { type: String, required: true },
  coverImage: String,
  body: { type: String, required: true },
  status: { type: String, enum: ['pending_review', 'published', 'rejected'], default: 'pending_review' },
  publishedAt: Date,
  viewCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  sampleData: { type: Boolean, default: false }
});

const blogCommentSchema = new Schema({
  postId: { type: Schema.Types.ObjectId, required: true },
  postSnapshot: { title: String },
  authorId: { type: Schema.Types.ObjectId, required: true },
  authorSnapshot: { username: String },
  body: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ status: 1, viewCount: -1 });
blogPostSchema.index({ category: 1, status: 1 });
blogPostSchema.index({ authorId: 1 });
blogPostSchema.index({ title: 'text', body: 'text' });
blogCommentSchema.index({ postId: 1, createdAt: 1 });
blogCommentSchema.index({ authorId: 1 });

module.exports = {
  BlogPost: mongoose.model('BlogPost', blogPostSchema),
  BlogComment: mongoose.model('BlogComment', blogCommentSchema)
};
