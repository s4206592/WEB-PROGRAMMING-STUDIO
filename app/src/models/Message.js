const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  body:           { type: String, maxlength: 2000 },
  attachments:    [{ url: String, type: String, name: String }],
  readBy:         [{ userId: mongoose.Schema.Types.ObjectId, readAt: Date }],

  isSystem: { type: Boolean, default: false },
  systemEvent: {
    type:   { type: String },
    refId:  mongoose.Schema.Types.ObjectId,
    amount: Number
  },

  status:      { type: String, enum: ['sent', 'edited', 'deleted_by_sender', 'removed_by_mod'], default: 'sent' },
  reportCount: { type: Number, default: 0 }
}, { timestamps: { createdAt: true, updatedAt: false } });

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
