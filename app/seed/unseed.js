// Removes everything flagged sampleData: true across every collection it
// exists in, plus the child records of anything removed (forum replies,
// blog comments, studio reviews, chat messages) by matching on their
// parent id — those child collections have no sampleData flag of their
// own, so cascading by parent id is how they stay in sync. Real accounts,
// the admin account, and FAQ entries are never touched.
require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/user.model');
const Product = require('../models/product.model');
const Order = require('../models/order.model');
const Review = require('../models/review.model');
const Wishlist = require('../models/wishlist.model');
const SavedSearch = require('../models/savedSearch.model');
const { ForumPost, ForumReply } = require('../models/forumPost.model');
const { BlogPost, BlogComment } = require('../models/blogPost.model');
const { Studio, StudioReview } = require('../models/studio.model');
const { Conversation, Message } = require('../models/chat.model');
const Notification = require('../models/notification.model');
const ModerationFlag = require('../models/moderationFlag.model');

async function unseed() {
  await connectDB();

  // Collect parent ids first, so we can cascade to their un-flagged children.
  const forumPostIds = (await ForumPost.find({ sampleData: true }, '_id')).map(d => d._id);
  const blogPostIds = (await BlogPost.find({ sampleData: true }, '_id')).map(d => d._id);
  const studioIds = (await Studio.find({ sampleData: true }, '_id')).map(d => d._id);
  const conversationIds = (await Conversation.find({ sampleData: true }, '_id')).map(d => d._id);

  const results = {};
  results.forumReplies = (await ForumReply.deleteMany({ postId: { $in: forumPostIds } })).deletedCount;
  results.blogComments = (await BlogComment.deleteMany({ postId: { $in: blogPostIds } })).deletedCount;
  results.studioReviews = (await StudioReview.deleteMany({ studioId: { $in: studioIds } })).deletedCount;
  results.messages = (await Message.deleteMany({ conversationId: { $in: conversationIds } })).deletedCount;

  results.forumPosts = (await ForumPost.deleteMany({ sampleData: true })).deletedCount;
  results.blogPosts = (await BlogPost.deleteMany({ sampleData: true })).deletedCount;
  results.studios = (await Studio.deleteMany({ sampleData: true })).deletedCount;
  results.conversations = (await Conversation.deleteMany({ sampleData: true })).deletedCount;
  results.notifications = (await Notification.deleteMany({ sampleData: true })).deletedCount;
  results.moderationFlags = (await ModerationFlag.deleteMany({ sampleData: true })).deletedCount;
  results.savedSearches = (await SavedSearch.deleteMany({ sampleData: true })).deletedCount;
  results.wishlists = (await Wishlist.deleteMany({ sampleData: true })).deletedCount;
  results.reviews = (await Review.deleteMany({ sampleData: true })).deletedCount;
  results.orders = (await Order.deleteMany({ sampleData: true })).deletedCount;
  results.products = (await Product.deleteMany({ sampleData: true })).deletedCount;
  results.users = (await User.deleteMany({ sampleData: true })).deletedCount;

  console.log('Removed sample data:');
  for (const [collection, count] of Object.entries(results)) {
    console.log(`  ${collection}: ${count}`);
  }
  process.exit(0);
}

unseed().catch(err => {
  console.error('Unseed failed:', err);
  process.exit(1);
});
