const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, unique: true },
  items: [{
    productId: { type: Schema.Types.ObjectId },
    productSnapshot: {
      title: String, image: String, price: Number, sellerId: Schema.Types.ObjectId, sellerName: String
    },
    quantity: { type: Number, default: 1 },
    addedAt: { type: Date, default: Date.now }
  }],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cart', cartSchema);
