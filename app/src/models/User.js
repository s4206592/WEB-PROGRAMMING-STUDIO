const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  label:     { type: String, default: 'Home' },
  recipient: String,
  phone:     String,
  line1:     String,
  ward:      String,
  district:  String,
  province:  String,
  country:   { type: String, default: 'VN' },
  isDefault: { type: Boolean, default: false }
}, { _id: true });

const userSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30, lowercase: true },
  email:        { type: String, required: true, unique: true, trim: true, lowercase: true },
  phone:        { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
  fullName:     { type: String, trim: true },
  avatarUrl:    String,
  bio:          { type: String, maxlength: 500 },

  roles: {
    type: [String],
    enum: ['buyer', 'seller', 'studio_owner', 'moderator', 'staff', 'admin'],
    default: ['buyer']
  },

  verification: {
    emailVerified:  { type: Boolean, default: false },
    phoneVerified:  { type: Boolean, default: false },
    identityStatus: { type: String, enum: ['none', 'pending', 'verified', 'rejected'], default: 'none' }
  },

  addresses: [addressSchema],

  sellerProfile: {
    displayName:      String,
    rating:           { type: Number, default: 0 },
    ratingCount:      { type: Number, default: 0 },
    totalSales:       { type: Number, default: 0 },
    responseRatePct:  { type: Number, default: 100 },
    joinedAsSellerAt: Date
  },

  reputation: {
    points: { type: Number, default: 0 },
    badges: [{ code: String, label: String, awardedAt: Date }]
  },

  notificationPrefs: {
    email:        { type: Boolean, default: true },
    inApp:        { type: Boolean, default: true },
    priceDrops:   { type: Boolean, default: true },
    savedSearch:  { type: Boolean, default: true },
    orderUpdates: { type: Boolean, default: true },
    forumReplies: { type: Boolean, default: true },
    blogStatus:   { type: Boolean, default: true },
    marketing:    { type: Boolean, default: false }
  },

  status: { type: String, enum: ['active', 'suspended', 'banned', 'deleted'], default: 'active' },
  suspension: {
    reason:    String,
    until:     Date,
    byAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },

  lastLoginAt:   Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil:     Date
}, { timestamps: true });

userSchema.index({ status: 1, createdAt: -1 });
userSchema.index({ 'sellerProfile.rating': -1 });

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};
userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};
userSchema.methods.hasRole = function (...roles) {
  return roles.some(r => this.roles.includes(r));
};
userSchema.virtual('displayName').get(function () {
  return this.fullName || this.username;
});
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
