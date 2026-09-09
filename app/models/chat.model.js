const mongoose = require('mongoose');
const { Schema } = mongoose;

const conversationSchema = new Schema({
  participantIds: [{ type: Schema.Types.ObjectId, required: true }],
  participantSnapshots: [{ userId: Schema.Types.ObjectId, username: String }],
  relatedProductId: Schema.Types.ObjectId,
  relatedProductSnapshot: { title: String, image: String, listPrice: Number },
  relatedOrderId: Schema.Types.ObjectId,   // set when auto-opened from checkout instead of negotiation
  // Only meaningful when relatedProductId is set. The seller "closes the
  // deal" by confirming a price right in the conversation — no separate
  // offer/accept/decline/counter object, negotiation is just the chat.
  negotiation: {
    agreedPrice: Number,
    confirmedAt: Date
  },
  lastMessageAt: { type: Date, default: Date.now },
  lastMessagePreview: String,
  createdAt: { type: Date, default: Date.now }
});
conversationSchema.index({ participantIds: 1, lastMessageAt: -1 });

const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, required: true },
  senderId: { type: Schema.Types.ObjectId, required: true },
  senderSnapshot: { username: String },
  body: { type: String, required: true },
  sentAt: { type: Date, default: Date.now }
});
messageSchema.index({ conversationId: 1, sentAt: 1 });

// Explicit collection names: this DB already has `conversations`/`messages`
// collections with indexes from an unrelated, never-wired-in schema (a
// unique participantsKey+productId index on `conversations` that this
// schema doesn't populate — same "orphaned collection" situation as
// `studios` was for Studio Map). Using dedicated names sidesteps it
// entirely rather than touching indexes on a database described as cloned
// from another one online.
const Conversation = mongoose.model('Conversation', conversationSchema, 'chatConversations');
const Message = mongoose.model('Message', messageSchema, 'chatMessages');

// Used by order.routes.js at checkout to auto-open a buyer<->seller thread
// per order, and by chat.routes.js's "Message seller"/"Negotiate price"
// entry points on a product page.
async function findOrCreateConversation({ buyer, seller, relatedProductId, relatedProductSnapshot, relatedOrderId }) {
  const query = { participantIds: { $all: [buyer.id, seller.id] } };
  if (relatedProductId) query.relatedProductId = relatedProductId;

  let convo = await Conversation.findOne(query);
  if (!convo) {
    convo = await Conversation.create({
      participantIds: [buyer.id, seller.id],
      participantSnapshots: [
        { userId: buyer.id, username: buyer.username },
        { userId: seller.id, username: seller.username }
      ],
      relatedProductId, relatedProductSnapshot, relatedOrderId
    });
  } else if (relatedOrderId && !convo.relatedOrderId) {
    convo.relatedOrderId = relatedOrderId;
    await convo.save();
  }
  return convo;
}

module.exports = { Conversation, Message, findOrCreateConversation };
