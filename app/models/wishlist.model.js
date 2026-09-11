const mongoose = require('mongoose');
const { Schema } = mongoose;

const wishlistSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, unique: true },
  items: [{
    productId: Schema.Types.ObjectId,
    productSnapshot: { title: String, image: String, price: Number, sellerName: String, availability: String },
    priceHistory: [{ price: Number, at: { type: Date, default: Date.now } }],
    inspectionNotes: String,
    addedAt: { type: Date, default: Date.now }
  }],
  sampleData: { type: Boolean, default: false }
});

wishlistSchema.index({ 'items.productId': 1 });

module.exports = mongoose.model('Wishlist', wishlistSchema);
