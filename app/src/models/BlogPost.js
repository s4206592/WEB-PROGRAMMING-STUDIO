const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  title:   { type: String, required: true, maxlength: 160 },
  slug:    { type: String, required: true, unique: true },
  excerpt: { type: String, maxlength: 300 },
  bodyHtml: String,             // sanitised server-side before insert
  coverImageUrl: String,

  authorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorType: { type: String, enum: ['staff', 'community'], default: 'community' },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogCategory' },
  tags: [String],

  linkedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  linkedStudios:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Studio' }],

  status: { type: String, enum: ['draft', 'pending_review', 'approved', 'published', 'rejected', 'archived'], default: 'pending_review' },
  review: {
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    decision:   { type: String, enum: ['approve', 'reject', 'request_changes'] },
    feedback:   String,
    editNotes:  String
  },

  isFeatured:    { type: Boolean, default: false },
  featuredOrder: { type: Number, default: 0 },

  metadata: {
    readTimeMinutes: { type: Number, default: 1 },
    views:        { type: Number, default: 0 },
    likes:        { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    shares:       { type: Number, default: 0 }
  },

  seo: { metaTitle: String, metaDescription: String, ogImageUrl: String },
  publishedAt: Date
}, { timestamps: true });

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ status: 1, categoryId: 1, publishedAt: -1 });
blogPostSchema.index({ authorId: 1, status: 1 });
blogPostSchema.index({ title: 'text', excerpt: 'text', tags: 'text' });

module.exports = mongoose.model('BlogPost', blogPostSchema);
