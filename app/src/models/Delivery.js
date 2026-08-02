const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema({
  orderId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  sellerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  orderItemIds: [mongoose.Schema.Types.ObjectId],
  carrier:        String,
  trackingNumber: String,

  milestones: [{
    code:  { type: String, enum: ['confirmed', 'packed', 'shipped', 'in_transit', 'delivered', 'received'] },
    label: String,
    occurredAt: { type: Date, default: Date.now },
    location: String,
    note: String,
    byUserId: mongoose.Schema.Types.ObjectId
  }],

  currentStatus:    { type: String, default: 'confirmed' },
  estimatedArrival: Date,
  deliveredAt: Date,   // opens the return window
  receivedAt:  Date    // closes it — buyer confirmation is final
}, { timestamps: true });

deliverySchema.index({ orderId: 1 });
deliverySchema.index({ currentStatus: 1, updatedAt: -1 });

module.exports = mongoose.model('Delivery', deliverySchema);
