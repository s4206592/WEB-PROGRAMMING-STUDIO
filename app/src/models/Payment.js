const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // payer
  sellerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // payee (P2P)
  direction: { type: String, enum: ['charge', 'refund', 'payout'], default: 'charge' },
  amount:    Number,
  method:    { type: String, enum: ['cod', 'bank_transfer', 'card_sim'] },
  status: {
    type: String,
    enum: ['pending', 'submitted_by_buyer', 'confirmed_by_seller', 'succeeded', 'failed', 'reversed', 'contested'],
    default: 'pending'
  },
  reference: String,
  proof: [{ url: String, uploadedBy: mongoose.Schema.Types.ObjectId, uploadedAt: Date }],
  confirmedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmedAt:   Date,
  failureReason: String,
  processedAt:   Date
}, { timestamps: { createdAt: true, updatedAt: false } });

paymentSchema.index({ orderId: 1, createdAt: -1 });
paymentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
