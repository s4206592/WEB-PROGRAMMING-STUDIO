const mongoose = require('mongoose');
const { Schema } = mongoose;

// Its own collection, separate from `users`, so this piece of the auth flow
// (and the future "send a real email" version of it) can be reworked or
// wiped without touching account data itself.
const passwordResetTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
