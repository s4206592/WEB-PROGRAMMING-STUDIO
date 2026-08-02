const mongoose = require('mongoose');
const adminActionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action:  { type: String, required: true },
  targetType: String,
  targetId: mongoose.Schema.Types.ObjectId,
  before: Object,
  after:  Object,
  reason: String,
  ip: String
}, { timestamps: { createdAt: true, updatedAt: false } });
adminActionSchema.index({ adminId: 1, createdAt: -1 });
adminActionSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
adminActionSchema.index({ action: 1, createdAt: -1 });
module.exports = mongoose.model('AdminAction', adminActionSchema);
