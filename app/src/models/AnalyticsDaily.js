const mongoose = require('mongoose');
const analyticsDailySchema = new mongoose.Schema({
  date: { type: Date, required: true, unique: true },
  metrics: {
    newUsers: Number, activeUsers: Number,
    newListings: Number, activeListings: Number, soldListings: Number,
    orders: Number, gmv: Number,
    offersCreated: Number, offersAccepted: Number,
    disputesOpened: Number, disputesResolved: Number,
    reviewsPosted: Number, avgRating: Number,
    forumPosts: Number, blogSubmissions: Number
  },
  topCategories: [{ categoryId: mongoose.Schema.Types.ObjectId, orders: Number, gmv: Number }]
}, { timestamps: { createdAt: true, updatedAt: false } });
module.exports = mongoose.model('AnalyticsDaily', analyticsDailySchema);
