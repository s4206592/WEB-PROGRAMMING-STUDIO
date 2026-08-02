const mongoose = require('mongoose');
const voteSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['forum_post', 'forum_reply'], required: true },
  targetId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  value:      { type: Number, enum: [1, -1], required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });
voteSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });
voteSchema.index({ targetType: 1, targetId: 1 });
module.exports = mongoose.model('Vote', voteSchema);
