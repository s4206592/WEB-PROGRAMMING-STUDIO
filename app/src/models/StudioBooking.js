const mongoose = require('mongoose');
const studioBookingSchema = new mongoose.Schema({
  studioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Studio', required: true },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:     { type: String, enum: ['enquiry', 'booking'], default: 'enquiry' },
  startAt:  Date,
  endAt:    Date,
  headcount: Number,
  message:  String,
  quotedPrice: Number,
  status: { type: String, enum: ['enquiry', 'pending', 'confirmed', 'declined', 'cancelled', 'completed'], default: 'enquiry' },
  ownerResponse: { message: String, respondedAt: Date }
}, { timestamps: true });
studioBookingSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
studioBookingSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('StudioBooking', studioBookingSchema);
