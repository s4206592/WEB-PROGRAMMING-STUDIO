const mongoose = require('mongoose');
const faqEntrySchema = new mongoose.Schema({
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FaqCategory', required: true },
  question:   { type: String, required: true },
  answerHtml: { type: String, required: true },
  slug:       { type: String, required: true, unique: true },
  relatedEntryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FaqEntry' }],
  helpfulYes: { type: Number, default: 0 },
  helpfulNo:  { type: Number, default: 0 },
  displayOrder: { type: Number, default: 0 },
  isPublished:  { type: Boolean, default: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
faqEntrySchema.index({ categoryId: 1, displayOrder: 1 });
faqEntrySchema.index({ question: 'text', answerHtml: 'text' });
module.exports = mongoose.model('FaqEntry', faqEntrySchema);
