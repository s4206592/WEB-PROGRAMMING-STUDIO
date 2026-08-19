// Seeds one admin account (from ADMIN_* env vars) plus optional sample data
// for testing: 2 sample buyer/seller accounts and 5 sample listings. Every
// piece of sample data is flagged `sampleData: true` so it can be removed
// cleanly later with `npm run unseed` without touching real user data.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/user.model');
const Product = require('../models/product.model');
const Faq = require('../models/faq.model');

const FAQ_SEED = [
  { category: 'Purchasing & Shipping', question: 'How do I buy an item?', answer: 'Open a listing, make an offer or buy at the listed price, then complete checkout.', order: 1 },
  { category: 'Returns & Refunds', question: 'What is the 15-day window?', answer: 'You have 15 days after delivery to raise a dispute before the sale is treated as final.', order: 1 },
  { category: 'Payments', question: 'How does payment work?', answer: 'Payment goes directly to the seller at checkout; there is no platform-held escrow.', order: 1 },
  { category: 'Account & General', question: 'How do I reset my password?', answer: 'Use "Forgot password?" on the log in page.', order: 1 }
];

const SAMPLE_USERS = [
  { username: 'minh_studio', email: 'minh@example.com', password: 'SamplePass123!', displayName: 'Minh (Seller)' },
  { username: 'lananh_buys', email: 'lananh@example.com', password: 'SamplePass123!', displayName: 'Lan Anh (Buyer)' }
];

const SAMPLE_LISTINGS = [
  { title: 'Godox SL60W Studio Light', category: 'Lighting', condition: 'secondhand', description: 'Reliable 60W LED continuous light, barely used, includes stand.', listPrice: 1800000 },
  { title: 'Canon EOS 6D Mark II', category: 'Cameras', condition: 'secondhand', description: 'Full-frame body, ~15k shutter count, minor cosmetic wear.', listPrice: 21000000 },
  { title: '80x120cm Softbox', category: 'Lighting', condition: 'new', description: 'Unused, still in box, Bowens mount.', listPrice: 650000 },
  { title: 'Manfrotto Light Stand (2-pack)', category: 'Grip', condition: 'secondhand', description: 'Two air-cushioned stands, small rust spot on one leg.', listPrice: 900000 },
  { title: 'Rode NT1-A Condenser Mic', category: 'Audio', condition: 'secondhand', description: 'Studio mic with shock mount and pop filter, great condition.', listPrice: 2200000 }
];

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@studiotrade.local').toLowerCase();
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.log('An admin account already exists:', existingAdmin.username);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await User.create({
    username, email, passwordHash, role: 'admin',
    profile: { displayName: 'StudioTrade Admin' }
  });
  console.log('Admin account created:');
  console.log('  username:', admin.username, '| email:', admin.email, '| password:', password);
}

async function seedFaqs() {
  const faqCount = await Faq.countDocuments();
  if (faqCount === 0) {
    await Faq.insertMany(FAQ_SEED);
    console.log('Seeded starter FAQ entries.');
  }
}

async function seedSampleData() {
  const existingSamples = await User.countDocuments({ sampleData: true });
  if (existingSamples > 0) {
    console.log('Sample users/listings already exist — skipping (run `npm run unseed` first to reset).');
    return;
  }

  const createdUsers = [];
  for (const s of SAMPLE_USERS) {
    const passwordHash = await bcrypt.hash(s.password, 10);
    const user = await User.create({
      username: s.username, email: s.email, passwordHash,
      profile: { displayName: s.displayName },
      sampleData: true
    });
    createdUsers.push(user);
    console.log(`Sample user created: username=${s.username}  password=${s.password}`);
  }

  const seller = createdUsers[0];
  const docs = SAMPLE_LISTINGS.map(item => ({
    sellerId: seller._id,
    sellerSnapshot: { username: seller.username, avatarUrl: '', reputationScore: 0 },
    title: item.title, description: item.description, category: item.category,
    condition: item.condition,
    pricing: { listPrice: item.listPrice, negotiable: true },
    quantityAvailable: 1,
    sampleData: true
  }));
  await Product.insertMany(docs);
  console.log(`Seeded ${docs.length} sample listings under ${seller.username}.`);
}

async function seed() {
  await connectDB();
  await seedAdmin();
  await seedFaqs();
  await seedSampleData();
  console.log('Done. Orders, reviews, wishlists, forum posts, and blog posts were left empty on purpose.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
