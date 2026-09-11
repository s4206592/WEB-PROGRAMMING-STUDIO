const mongoose = require('mongoose');
const { Schema } = mongoose;

const forumPostSchema = new Schema({
  authorId: { type: Schema.Types.ObjectId, required: true },
  authorSnapshot: { username: String },
  title: { type: String, required: true },
  body: { type: String, required: true },
  tags: [String],
  upvotes: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'flagged', 'removed'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  sampleData: { type: Boolean, default: false }
});

const forumReplySchema = new Schema({
  postId: { type: Schema.Types.ObjectId, required: true },
  postSnapshot: { title: String },
  authorId: { type: Schema.Types.ObjectId, required: true },
  authorSnapshot: { username: String },
  body: { type: String, required: true },
  votes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

forumPostSchema.index({ status: 1, createdAt: -1 });
forumPostSchema.index({ authorId: 1 });
forumPostSchema.index({ title: 'text', body: 'text' });
forumReplySchema.index({ postId: 1, createdAt: 1 });
forumReplySchema.index({ authorId: 1 });

module.exports = {
  ForumPost: mongoose.model('ForumPost', forumPostSchema),
  ForumReply: mongoose.model('ForumReply', forumReplySchema)
};
