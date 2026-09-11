const mongoose = require('mongoose');
const { Schema } = mongoose;

const blogPostSchema = new Schema({
  authorId: { type: Schema.Types.ObjectId, required: true },
  authorSnapshot: { username: String },
  title: { type: String, required: true },
  category: { type: String, required: true },
  coverImage: String,
  body: { type: String, required: true },
  // Optional link back to the listing that inspired this post — set when
  // the author started writing from a product page's "Write a blog about
  // this" button rather than the standalone /blog/submit flow.
  relatedProductId: Schema.Types.ObjectId,
  relatedProductSnapshot: { title: String, image: String },
  status: { type: String, enum: ['pending_review', 'published', 'rejected'], default: 'pending_review' },
  publishedAt: Date,
  viewCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const blogCommentSchema = new Schema({
  postId: { type: Schema.Types.ObjectId, required: true },
  postSnapshot: { title: String },
  authorId: { type: Schema.Types.ObjectId, required: true },
  authorSnapshot: { username: String },
  body: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = {
  BlogPost: mongoose.model('BlogPost', blogPostSchema),
  BlogComment: mongoose.model('BlogComment', blogCommentSchema)
};
