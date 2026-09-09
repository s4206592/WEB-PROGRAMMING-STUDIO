const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  // required: trading on the platform means a buyer/seller needs to be
  // reachable by phone. sparse stays on so the one pre-existing account
  // without a phone (created before this became mandatory) doesn't collide
  // with the unique index.
  phone: { type: String, required: true, unique: true, sparse: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['buyer_seller', 'moderator', 'staff', 'admin'], default: 'buyer_seller' },
  profile: {
    displayName: String,
    avatarUrl: { type: String, default: '' },
    bio: { type: String, default: '' }
  },
  contact: {
    address: String,
    city: String
  },
  reputation: {
    score: { type: Number, default: 0 },
    badges: [String]
  },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  sampleData: { type: Boolean, default: false }, // true for seeded test accounts — makes later cleanup a one-line query
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
