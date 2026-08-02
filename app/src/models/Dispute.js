const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema({
  orderId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  against:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: {
    type: String,
    enum: ['not_received', 'not_as_described', 'damaged', 'counterfeit', 'missing_parts', 'wrong_item', 'other']
  },
  description: { type: String, maxlength: 2000 },
  evidence: [{ url: String, type: String, uploadedBy: mongoose.Schema.Types.ObjectId, at: Date }],
  responses: [{ userId: mongoose.Schema.Types.ObjectId, message: String, at: { type: Date, default: Date.now } }],

  assessment: {
    assessorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    conditionScore: Number,   // 0–100 rubric
    findings:       String,
    assessedAt:     Date
  },

  resolution: {
    outcome: { type: String, enum: ['refund_full', 'refund_partial', 'release_to_seller', 'return_and_refund', 'rejected'] },
    refundAmount: Number,
    rationale:    String,
    decidedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt:    Date
  },

  status: { type: String, enum: ['open', 'under_review', 'awaiting_evidence', 'resolved', 'escalated', 'closed'], default: 'open' },
  slaDueAt: Date
}, { timestamps: true });

disputeSchema.index({ status: 1, slaDueAt: 1 });
disputeSchema.index({ orderId: 1 });

module.exports = mongoose.model('Dispute', disputeSchema);
