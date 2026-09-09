const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderSchema = new Schema({
  orderNumber: { type: String, required: true, unique: true },
  buyerId: { type: Schema.Types.ObjectId, required: true },
  buyerSnapshot: { username: String, contact: Schema.Types.Mixed },
  items: [{
    productId: Schema.Types.ObjectId,
    productSnapshot: { title: String, image: String, sellerId: Schema.Types.ObjectId, sellerName: String },
    quantity: Number,
    priceAtPurchase: Number
  }],
  delivery: { address: String, contactPhone: String, shippingMethod: String },
  payment: {
    // Cash on Delivery is the only method for now. status stays 'pending'
    // until the seller marks the order delivered — that's the real moment
    // cash changes hands, not the moment the order is placed.
    method: { type: String, enum: ['cod'], default: 'cod' },
    status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' }
  },
  totals: { subtotal: Number, shippingFee: Number, total: Number },
  status: {
    type: String,
    enum: ['placed', 'confirmed', 'shipped', 'delivered', 'received', 'cancelled', 'disputed', 'completed'],
    default: 'placed'
  },
  deliveryMilestones: [{ stage: String, at: { type: Date, default: Date.now } }],
  returnWindow: { deliveredAt: Date, eligibleUntil: Date, disputeRaised: { type: Boolean, default: false } },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
