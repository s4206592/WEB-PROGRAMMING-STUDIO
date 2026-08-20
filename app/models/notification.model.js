const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  type: String,
  title: String,
  body: String,
  linkUrl: String,
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
