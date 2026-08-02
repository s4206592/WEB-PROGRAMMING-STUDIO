const mongoose = require('mongoose');
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:   { type: String, required: true },
  title:  String,
  body:   String,
  linkUrl: String,
  targetType: String,
  targetId: mongoose.Schema.Types.ObjectId,
  imageUrl: String,
  priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
  isRead: { type: Boolean, default: false },
  readAt: Date,
  channels: { type: [String], default: ['in_app'] }
}, { timestamps: { createdAt: true, updatedAt: false } });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
module.exports = mongoose.model('Notification', notificationSchema);
