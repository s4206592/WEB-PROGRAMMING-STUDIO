const mongoose = require('mongoose');
const faqSubmissionSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  guestEmail: String,
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FaqCategory' },
  subject:    String,
  question:   { type: String, maxlength: 2000, required: true },
  status: { type: String, enum: ['new', 'in_progress', 'answered', 'published_as_faq', 'closed', 'spam'], default: 'new' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  answer: { body: String, byUserId: mongoose.Schema.Types.ObjectId, answeredAt: Date },
  publishedEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FaqEntry' }
}, { timestamps: true });
faqSubmissionSchema.index({ status: 1, createdAt: 1 });
faqSubmissionSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('FaqSubmission', faqSubmissionSchema);
