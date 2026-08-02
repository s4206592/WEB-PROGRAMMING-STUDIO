const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action:     { type: String, required: true },
  targetType: String,
  targetId:   mongoose.Schema.Types.ObjectId,
  metadata:   Object,
  ip:         String,
  userAgent:  String
}, { timestamps: { createdAt: true, updatedAt: false } });

activityLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
