const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  buyerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quantity:  { type: Number, default: 1 },

  consideration: {
    cash: { type: Number, default: 0 },
    items: [{
      productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      title:       String,
      imageUrl:    String,
      condition:   String,
      quantity:    { type: Number, default: 1 },
      statedValue: { type: Number, default: 0 }
    }],
    totalStatedValue: { type: Number, default: 0 }
  },

  settlement: { type: String, enum: ['cash_checkout', 'trade'], default: 'cash_checkout' },
  turn:       { type: String, enum: ['buyer', 'seller'], default: 'seller' },

  history: [{
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action:  { type: String, enum: ['offer', 'counter', 'accept', 'reject', 'withdraw', 'expire', 'auto_decline'] },
    consideration: Object,
    message: { type: String, maxlength: 500 },
    createdAt: { type: Date, default: Date.now }
  }],

  status: {
    type: String,
    enum: ['pending', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired', 'auto_declined', 'converted'],
    default: 'pending'
  },
  acceptedConsideration: Object,
  acceptedAt: Date,
  expiresAt:  Date,

  visibility: { type: String, enum: ['private', 'public'], default: 'private' },
  isAutoDeclined:    { type: Boolean, default: false },
  autoDeclineReason: { type: String, enum: ['listing_sold', 'rival_accepted', 'below_floor', 'listing_removed'] },
  orderId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }
}, { timestamps: true });

// One OPEN thread per (buyer, listing) — a rejected offer frees the slot.
offerSchema.index(
  { productId: 1, buyerId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'countered'] } } }
);
offerSchema.index({ productId: 1, status: 1, 'consideration.totalStatedValue': -1 });
offerSchema.index({ sellerId: 1, status: 1, updatedAt: -1 });
offerSchema.index({ buyerId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model('Offer', offerSchema);
