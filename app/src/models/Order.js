const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  orderType:   { type: String, enum: ['purchase', 'trade'], default: 'purchase' },
  buyerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    sellerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title:     String,
    imageUrl:  String,
    condition: String,
    quantity:  { type: Number, default: 1 },
    unitPrice: Number,
    lineTotal: Number,
    offerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
    reviewId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Review' },
    itemStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'shipped', 'delivered', 'received', 'cancelled', 'refunded'],
      default: 'pending'
    }
  }],

  deliveryInfo: {
    recipient: String, phone: String, line1: String,
    ward: String, district: String, province: String,
    country: { type: String, default: 'VN' },
    method: { type: String, enum: ['standard', 'express', 'pickup'], default: 'standard' },
    notes: String
  },

  paymentInfo: {
    method: { type: String, enum: ['cod', 'bank_transfer', 'card_sim'], default: 'cod' },
    status: {
      type: String,
      enum: ['unpaid', 'submitted_by_buyer', 'confirmed_by_seller', 'auto_confirmed', 'paid', 'refunded', 'failed', 'contested'],
      default: 'unpaid'
    },
    maskedRef: String,               // NEVER a real card number
    buyerMarkedPaidAt: Date,
    buyerProof: [{ url: String, uploadedAt: Date }],
    sellerConfirmedAt: Date,
    sellerConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    confirmationMethod: { type: String, enum: ['seller_manual', 'cod_none'] },
    confirmationDueAt: Date,
    contestedReason: String
  },

  totals: {
    subtotal:    { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    discount:    { type: Number, default: 0 },
    tax:         { type: Number, default: 0 },
    grandTotal:  { type: Number, default: 0 }
  },

  status: {
    type: String,
    enum: ['awaiting_payment', 'payment_submitted', 'payment_confirmed', 'confirmed',
           'partially_shipped', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed'],
    default: 'awaiting_payment'
  },
  statusHistory: [{ status: String, note: String, byUserId: mongoose.Schema.Types.ObjectId, at: { type: Date, default: Date.now } }],
  cancellation: { reason: String, byUserId: mongoose.Schema.Types.ObjectId, at: Date },

  // The 15-day rule: a RETURN / DISPUTE eligibility window, NOT a money hold.
  returnWindow: {
    opensAt:  Date,      // = deliveries.deliveredAt, never receivedAt
    closesAt: Date,      // opensAt + 15 days
    status: {
      type: String,
      enum: ['not_open', 'locked_in_transit', 'open', 'closed_by_confirmation', 'closed_by_expiry', 'closed_by_dispute'],
      default: 'not_open'
    },
    closedAt: Date,
    closedBy: { type: String, enum: ['buyer_confirmation', 'timer', 'admin'] }
  },

  placedAt:    { type: Date, default: Date.now },
  completedAt: Date
}, { timestamps: true });

orderSchema.index({ buyerId: 1, placedAt: -1 });
orderSchema.index({ 'items.sellerId': 1, status: 1 });
orderSchema.index({ status: 1, placedAt: -1 });

// daysRemaining is computed, never stored.
orderSchema.virtual('daysRemaining').get(function () {
  if (this.returnWindow?.status !== 'open' || !this.returnWindow.closesAt) return null;
  const ms = this.returnWindow.closesAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
});
orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema);
