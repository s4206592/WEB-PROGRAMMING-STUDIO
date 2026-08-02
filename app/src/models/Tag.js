const mongoose = require('mongoose');
const tagSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  usageCount: { type: Number, default: 0 },
  isModeratorOnly: { type: Boolean, default: false }
}, { timestamps: true });
tagSchema.index({ usageCount: -1 });
module.exports = mongoose.model('Tag', tagSchema);
