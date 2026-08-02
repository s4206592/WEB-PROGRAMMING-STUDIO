const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  participantsKey: { type: String, required: true },
  context: { type: String, enum: ['general', 'listing', 'offer', 'order', 'studio'], default: 'general' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  offerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  studioId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Studio' },

  subject:  String,
  thumbUrl: String,

  lastMessage: { text: String, senderId: mongoose.Schema.Types.ObjectId, sentAt: Date },
  unread: [{ userId: mongoose.Schema.Types.ObjectId, count: { type: Number, default: 0 } }],

  archivedBy: [mongoose.Schema.Types.ObjectId],
  mutedBy:    [mongoose.Schema.Types.ObjectId],
  blockedBy:  [mongoose.Schema.Types.ObjectId],
  status: { type: String, enum: ['open', 'closed', 'removed'], default: 'open' }
}, { timestamps: true });

conversationSchema.index({ participants: 1, updatedAt: -1 });
conversationSchema.index(
  { participantsKey: 1, productId: 1 },
  { unique: true, partialFilterExpression: { productId: { $exists: true, $type: 'objectId' } } }
);

conversationSchema.statics.buildKey = function (a, b) {
  return [String(a), String(b)].sort().join('|');
};

module.exports = mongoose.model('Conversation', conversationSchema);
