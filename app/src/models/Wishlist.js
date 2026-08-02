const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [{
    productId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    priceAtSave:     Number,     // alerting baseline ONLY — never a price the buyer is owed
    lowestSeenPrice: Number,
    inspectionNotes: { type: String, maxlength: 1000 },
    priority:        { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    tags:            [String],
    alerts: {
      onPriceDrop:      { type: Boolean, default: true },
      priceThreshold:   Number,
      onBackInStock:    { type: Boolean, default: false },
      onSimilarListing: { type: Boolean, default: false }
    },
    lastNotifiedAt: Date,
    movedToCartAt:  Date,
    purchasedAt:    Date,
    addedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

wishlistSchema.index({ 'items.productId': 1 });

module.exports = mongoose.model('Wishlist', wishlistSchema);
