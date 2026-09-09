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
  // Purchasing & Shipping
  { category: 'Purchasing & Shipping', question: 'How do I buy an item?', answer: 'Open a listing, add it to your cart (or negotiate a price with the seller first via chat), then complete checkout.', order: 1 },
  { category: 'Purchasing & Shipping', question: 'What happens if my cart has items from different sellers?', answer: 'Checkout automatically splits it into one order per seller, each with its own ₫30,000 shipping — every seller only ever confirms and ships their own order.', order: 2 },
  { category: 'Purchasing & Shipping', question: 'How do I know when my order has shipped?', answer: 'Check "Orders" in the nav for live status. Since there’s no courier integration, the seller manually marks each order confirmed, shipped, and delivered.', order: 3 },
  { category: 'Purchasing & Shipping', question: 'Why can’t I add an item to my cart anymore?', answer: 'It’s sold out — once a seller confirms an order, that item’s stock is deducted and the listing is marked sold when it hits zero.', order: 4 },

  // Payments
  { category: 'Payments', question: 'How does payment work?', answer: 'Cash on Delivery is the only payment method right now — you pay the seller in cash when the order arrives. There’s no platform-held escrow or online payment gateway.', order: 1 },
  { category: 'Payments', question: 'When does my order actually get paid?', answer: 'Payment is marked complete the moment the seller confirms delivery — that’s the real point cash changes hands for a Cash on Delivery order.', order: 2 },
  { category: 'Payments', question: 'Is my order protected if the seller never confirms it?', answer: 'Nothing is charged or deducted from stock until the seller confirms, so there’s no financial risk while it’s pending. If a seller is unresponsive, message them directly from the order’s chat thread.', order: 3 },

  // Returns & Refunds
  { category: 'Returns & Refunds', question: 'What is the 15-day window?', answer: 'You have 15 days after the seller marks your order delivered to raise a dispute before the sale is treated as final.', order: 1 },
  { category: 'Returns & Refunds', question: 'When can I leave a review?', answer: 'Reviewing unlocks once the seller marks your order delivered — go to the product page and click "Review" from your order.', order: 2 },

  // Account & General
  { category: 'Account & General', question: 'How do I reset my password?', answer: 'Use "Forgot password?" on the log in page.', order: 1 },
  { category: 'Account & General', question: 'Why do I need to give a phone number to sign up?', answer: 'A phone number is required for every account since buyers and sellers need a way to coordinate a trade beyond in-app chat.', order: 2 },
  { category: 'Account & General', question: 'What’s the difference between a buyer and a seller account?', answer: 'There isn’t one — every account can both list gear for sale and buy from other sellers. Admin accounts additionally review studio submissions and moderate the forum.', order: 3 },

  // Studios (Discussion Forum sub-feature)
  { category: 'Studios', question: 'What is Studio Map?', answer: 'A forum feature where studio owners promote their space to the community — an admin-approved listing with a map, equipment highlights, and ratings.', order: 1 },
  { category: 'Studios', question: 'How do I list my studio?', answer: 'Go to Forum → Studios → "Submit a studio," fill in the details, and pick your address from the map search suggestions — free-typed addresses aren’t accepted.', order: 2 },
  { category: 'Studios', question: 'How long does approval take?', answer: 'An admin reviews every new submission before it appears on the map or studio list — there’s no fixed turnaround time.', order: 3 },
  { category: 'Studios', question: 'My studio was rejected — can I fix it and resubmit?', answer: 'Yes. Open it from "My studios," you’ll see the admin’s note explaining why, and saving your edits automatically resubmits it for another review.', order: 4 },

  // Messaging & Negotiation
  { category: 'Messaging & Negotiation', question: 'How do I negotiate a price with a seller?', answer: 'On any listing marked "negotiable," click "Negotiate price" to open a chat with the seller. Once you agree on a number, the seller confirms it in the thread and you can check out at that price.', order: 1 },
  { category: 'Messaging & Negotiation', question: 'Can I message a seller without making an offer?', answer: 'Yes — "Message seller" opens the same kind of chat thread without involving price at all.', order: 2 },
  { category: 'Messaging & Negotiation', question: 'Do other buyers see my conversation with a seller?', answer: 'No. Each conversation is private between you and the seller, even if the seller is chatting with several buyers about the same listing at once.', order: 3 }
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
