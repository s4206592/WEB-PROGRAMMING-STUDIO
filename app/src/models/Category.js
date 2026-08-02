const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name:      { type: String, required: true },
  slug:      { type: String, required: true, unique: true },
  parentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  ancestors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  iconUrl:     String,
  description: String,
  attributeSchema: [{
    key: String, label: String,
    type: { type: String, enum: ['string', 'number', 'boolean', 'enum'], default: 'string' },
    options: [String],
    filterable: { type: Boolean, default: true }
  }],
  displayOrder: { type: Number, default: 0 },
  isActive:     { type: Boolean, default: true }
}, { timestamps: true });

categorySchema.index({ parentId: 1, displayOrder: 1 });
categorySchema.index({ ancestors: 1 });

module.exports = mongoose.model('Category', categorySchema);
