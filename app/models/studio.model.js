const mongoose = require('mongoose');
const { Schema } = mongoose;

const studioSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true },
  ownerSnapshot: { username: String, avatarUrl: String },
  ownerContact: { businessName: String, phone: String, contactEmail: String },

  name: { type: String, required: true },
  description: { type: String, required: true },
  equipmentHighlights: [String],
  photos: [String],
  rates: { hourly: Number, daily: Number },

  // Server-confirmed via Nominatim reverse geocoding — never stored from free text.
  location: {
    formattedAddress: { type: String, required: true },
    osmId: String,
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },

  status: { type: String, enum: ['pending_review', 'approved', 'rejected'], default: 'pending_review' },
  reviewNote: String,
  reviewedBy: Schema.Types.ObjectId,
  reviewedAt: Date,
  reviewHistory: [{
    action: { type: String, enum: ['submitted', 'resubmitted', 'approved', 'rejected'] },
    note: String,
    byId: Schema.Types.ObjectId,
    at: { type: Date, default: Date.now }
  }],

  ratingSummary: { avg: { type: Number, default: 0 }, count: { type: Number, default: 0 } },

  createdAt: { type: Date, default: Date.now },
  sampleData: { type: Boolean, default: false }
});

studioSchema.index({ status: 1, createdAt: -1 });
studioSchema.index({ ownerId: 1 }); // "My studios" management page

const studioReviewSchema = new Schema({
  studioId: { type: Schema.Types.ObjectId, required: true },
  studioSnapshot: { name: String, photo: String },
  reviewerId: { type: Schema.Types.ObjectId, required: true },
  reviewerSnapshot: { username: String, avatarUrl: String },
  rating: { type: Number, min: 1, max: 5, required: true },
  title: String,
  comment: { type: String, required: true },
  status: { type: String, enum: ['published', 'flagged', 'removed'], default: 'published' },
  createdAt: { type: Date, default: Date.now }
});

studioReviewSchema.index({ studioId: 1, createdAt: -1 });

// Explicit collection names: the DB already has a `studios` collection with
// leftover indexes (unique `slug`, `status+address.province`) from an
// unrelated, never-wired-in earlier draft that predates this schema — none
// of it is referenced by any code path. Rather than drop indexes on a shared
// cluster sight-unseen, this model uses its own collection so it can never
// collide with that orphaned data.
module.exports = {
  Studio: mongoose.model('Studio', studioSchema, 'studioListings'),
  StudioReview: mongoose.model('StudioReview', studioReviewSchema, 'studioReviews')
};
