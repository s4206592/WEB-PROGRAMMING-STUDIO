const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [{
    productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sellerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    quantity:    { type: Number, default: 1, min: 1 },
    unitPrice:   { type: Number, default: 0 },
    priceSource: { type: String, enum: ['list', 'bulk_tier', 'negotiated'], default: 'list' },
    offerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
    selectedOptions: Object,
    titleSnapshot: String,
    imageSnapshot: String,
    isAvailable:   { type: Boolean, default: true },
    unavailableReason: { type: String, enum: ['sold', 'removed', 'out_of_stock', 'price_changed', null], default: null },
    addedFrom: { type: String, enum: ['product_page', 'listing', 'wishlist', 'blog_link', 'similar_listing', 'offer', 'reorder'], default: 'product_page' },
    wishlistItemId: mongoose.Schema.Types.ObjectId,
    addedAt: { type: Date, default: Date.now }
  }],
  couponCode: String
}, { timestamps: true });

// Cart counter is a virtual — never stored, it drifts.
cartSchema.virtual('itemCount').get(function () {
  return (this.items || []).reduce((n, i) => n + (i.quantity || 0), 0);
});
cartSchema.virtual('subtotal').get(function () {
  return (this.items || []).reduce((n, i) => n + (i.quantity || 0) * (i.unitPrice || 0), 0);
});
cartSchema.set('toJSON', { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Cart', cartSchema);
