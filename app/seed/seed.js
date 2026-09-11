// Seeds one admin account (from ADMIN_* env vars) plus realistic sample
// data across every collection in the schema — not just Users and
// Products — so the implemented database can be inspected end-to-end
// against studiotrade-database-schema.md. Every seeded document is flagged
// `sampleData: true` (cascaded to child records by parent id where the
// child collection has no flag of its own) so `npm run unseed` can remove
// exactly this data without touching real accounts or content.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/user.model');
const Product = require('../models/product.model');
const Faq = require('../models/faq.model');
const Order = require('../models/order.model');
const Review = require('../models/review.model');
const Wishlist = require('../models/wishlist.model');
const SavedSearch = require('../models/savedSearch.model');
const { ForumPost, ForumReply } = require('../models/forumPost.model');
const { BlogPost, BlogComment } = require('../models/blogPost.model');
const { Studio, StudioReview } = require('../models/studio.model');
const { Conversation, Message, findOrCreateConversation } = require('../models/chat.model');
const Notification = require('../models/notification.model');
const ModerationFlag = require('../models/moderationFlag.model');

const FAQ_SEED = [
  { category: 'Purchasing & Shipping', question: 'How do I buy an item?', answer: 'Open a listing, make an offer or buy at the listed price, then complete checkout.', order: 1 },
  { category: 'Returns & Refunds', question: 'What is the 15-day window?', answer: 'You have 15 days after delivery to raise a dispute before the sale is treated as final.', order: 1 },
  { category: 'Payments', question: 'How does payment work?', answer: 'Payment goes directly to the seller at checkout; there is no platform-held escrow.', order: 1 },
  { category: 'Account & General', question: 'How do I reset my password?', answer: 'Use "Forgot password?" on the log in page.', order: 1 }
];

// phone is required on User now — every account created below must pass one.
const SAMPLE_USERS = [
  { username: 'minh_studio', email: 'minh@example.com', phone: '0901111111', password: 'SamplePass123!', displayName: 'Minh (Seller)' },
  { username: 'lananh_buys', email: 'lananh@example.com', phone: '0902222222', password: 'SamplePass123!', displayName: 'Lan Anh (Buyer)' }
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
  const phone = process.env.ADMIN_PHONE || '0900000000';

  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    console.log('An admin account already exists:', existingAdmin.username);
    return existingAdmin;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await User.create({
    username, email, phone, passwordHash, role: 'admin',
    profile: { displayName: 'StudioTrade Admin' }
  });
  console.log('Admin account created:');
  console.log('  username:', admin.username, '| email:', admin.email, '| password:', password);
  return admin;
}

async function seedFaqs() {
  const faqCount = await Faq.countDocuments();
  if (faqCount === 0) {
    await Faq.insertMany(FAQ_SEED);
    console.log('Seeded starter FAQ entries.');
  }
}

async function seed() {
  await connectDB();
  await seedAdmin();
  await seedFaqs();

  const existingSamples = await User.countDocuments({ sampleData: true });
  if (existingSamples > 0) {
    console.log('Sample data already exists — skipping (run `npm run unseed` first to reset).');
    console.log('Done.');
    process.exit(0);
  }

  // --- Users -------------------------------------------------------------
  const createdUsers = [];
  for (const s of SAMPLE_USERS) {
    const passwordHash = await bcrypt.hash(s.password, 10);
    const user = await User.create({
      username: s.username, email: s.email, phone: s.phone, passwordHash,
      profile: { displayName: s.displayName },
      reputation: { score: 4, badges: [] },
      sampleData: true
    });
    createdUsers.push(user);
    console.log(`Sample user created: username=${s.username}  password=${s.password}`);
  }
  const [seller, buyer] = createdUsers;

  // --- Products ------------------------------------------------------------
  const productDocs = SAMPLE_LISTINGS.map(item => ({
    sellerId: seller._id,
    sellerSnapshot: { username: seller.username, avatarUrl: '', reputationScore: 4 },
    title: item.title, description: item.description, category: item.category,
    condition: item.condition,
    pricing: { listPrice: item.listPrice, negotiable: true },
    quantityAvailable: 1,
    sampleData: true
  }));
  const products = await Product.insertMany(productDocs);
  console.log(`Seeded ${products.length} sample listings under ${seller.username}.`);
  const [lightProduct, cameraProduct, softboxProduct, standProduct, micProduct] = products;

  // --- Order (delivered, so it can unlock a review) ------------------------
  const now = new Date();
  const deliveredAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
  const eligibleUntil = new Date(deliveredAt.getTime() + 15 * 24 * 60 * 60 * 1000);
  const order = await Order.create({
    orderNumber: 'ST-SAMPLE-' + Date.now(),
    buyerId: buyer._id,
    buyerSnapshot: { username: buyer.username, contact: { address: '123 Nguyen Hue, District 1, Ho Chi Minh City', contactPhone: buyer.phone } },
    items: [{
      productId: lightProduct._id,
      productSnapshot: { title: lightProduct.title, image: '', sellerId: seller._id, sellerName: seller.username },
      quantity: 1, priceAtPurchase: lightProduct.pricing.listPrice
    }],
    delivery: { address: '123 Nguyen Hue, District 1, Ho Chi Minh City', contactPhone: buyer.phone, shippingMethod: 'Standard' },
    payment: { method: 'cod', status: 'paid' },
    totals: { subtotal: lightProduct.pricing.listPrice, shippingFee: 30000, total: lightProduct.pricing.listPrice + 30000 },
    status: 'delivered',
    deliveryMilestones: [
      { stage: 'placed', at: new Date(deliveredAt.getTime() - 4 * 24 * 60 * 60 * 1000) },
      { stage: 'confirmed', at: new Date(deliveredAt.getTime() - 3 * 24 * 60 * 60 * 1000) },
      { stage: 'shipped', at: new Date(deliveredAt.getTime() - 1 * 24 * 60 * 60 * 1000) },
      { stage: 'delivered', at: deliveredAt }
    ],
    returnWindow: { deliveredAt, eligibleUntil, disputeRaised: false },
    sampleData: true
  });
  console.log('Seeded 1 delivered sample order:', order.orderNumber);

  // --- Review (unlocked by the delivered order above) -----------------------
  const review = await Review.create({
    productId: lightProduct._id,
    productSnapshot: { title: lightProduct.title, image: '' },
    orderId: order._id,
    reviewerId: buyer._id,
    reviewerSnapshot: { username: buyer.username, avatarUrl: '' },
    rating: 5, title: 'Exactly as described',
    comment: 'Light output is strong and even, arrived well packaged. Would buy from this seller again.',
    sampleData: true
  });
  await Product.findByIdAndUpdate(lightProduct._id, { 'ratingSummary.avg': 5, 'ratingSummary.count': 1 });
  console.log('Seeded 1 sample review.');

  // --- Wishlist (buyer saves two other listings) -----------------------------
  await Wishlist.create({
    userId: buyer._id,
    items: [
      {
        productId: cameraProduct._id,
        productSnapshot: { title: cameraProduct.title, image: '', price: cameraProduct.pricing.listPrice, sellerName: seller.username, availability: cameraProduct.status },
        priceHistory: [{ price: cameraProduct.pricing.listPrice, at: now }],
        inspectionNotes: 'Ask about shutter count history before buying.'
      },
      {
        productId: micProduct._id,
        productSnapshot: { title: micProduct.title, image: '', price: micProduct.pricing.listPrice, sellerName: seller.username, availability: micProduct.status },
        priceHistory: [{ price: micProduct.pricing.listPrice, at: now }]
      }
    ],
    sampleData: true
  });
  console.log('Seeded 1 sample wishlist (2 items).');

  // --- Saved search ----------------------------------------------------------
  await SavedSearch.create({
    userId: buyer._id,
    queryParams: { category: 'Lighting', condition: 'secondhand' },
    label: 'Secondhand lighting gear',
    sampleData: true
  });
  console.log('Seeded 1 sample saved search.');

  // --- Forum post + reply -----------------------------------------------------
  const forumPost = await ForumPost.create({
    authorId: seller._id, authorSnapshot: { username: seller.username },
    title: 'Best way to ship a monolight without damaging the bulb?',
    body: 'Sending a strobe head interstate for the first time — any packing tips beyond the original box foam?',
    tags: ['shipping', 'lighting'],
    sampleData: true
  });
  await ForumReply.create({
    postId: forumPost._id, postSnapshot: { title: forumPost.title },
    authorId: buyer._id, authorSnapshot: { username: buyer.username },
    body: 'Double-box it and remove the bulb/tube separately in its own padded case if the head allows — that\'s what broke mine last time.'
  });
  console.log('Seeded 1 sample forum post + 1 reply.');

  // --- Blog posts + comment ----------------------------------------------------
  const blogPost = await BlogPost.create({
    authorId: seller._id, authorSnapshot: { username: seller.username },
    title: 'Buying secondhand lighting: 5 things to check before you pay',
    category: 'Buying Guides',
    body: 'Test every bulb/tube in person, check for dust inside softboxes, confirm the mount type matches your stands, ask for the original charger/cables, and always meet in a well-lit space to spot cosmetic damage.',
    status: 'published', publishedAt: now, viewCount: 12,
    sampleData: true
  });
  await BlogComment.create({
    postId: blogPost._id, postSnapshot: { title: blogPost.title },
    authorId: buyer._id, authorSnapshot: { username: buyer.username },
    body: 'Checking the mount type before buying saved me from an incompatible purchase last month — good call including that.'
  });
  await BlogPost.create({
    authorId: buyer._id, authorSnapshot: { username: buyer.username },
    title: 'My first cash-on-delivery purchase on StudioTrade',
    category: 'Community Stories',
    body: 'Wanted to share how the delivery + review flow went as a first-time buyer, for anyone still deciding whether to trust a secondhand marketplace for gear this expensive.',
    status: 'pending_review',
    sampleData: true
  });
  console.log('Seeded 2 sample blog posts (1 published + 1 pending review) + 1 comment.');

  // --- Studios + review --------------------------------------------------------
  const studio = await Studio.create({
    ownerId: seller._id, ownerSnapshot: { username: seller.username, avatarUrl: '' },
    ownerContact: { businessName: 'Minh Studio Rentals', phone: seller.phone, contactEmail: seller.email },
    name: 'Minh Studio Rentals — District 1',
    description: 'Small daylight studio with a cyclorama wall, available hourly or by the day.',
    equipmentHighlights: ['Cyclorama wall', '2x Godox SL60W', 'Rolling backdrop stand'],
    rates: { hourly: 250000, daily: 1500000 },
    location: { formattedAddress: '123 Nguyen Hue, District 1, Ho Chi Minh City, Vietnam', osmId: 'sample-osm-1', lat: 10.7769, lng: 106.7009 },
    status: 'approved', reviewedBy: null, reviewedAt: now,
    reviewHistory: [{ action: 'submitted', at: now }, { action: 'approved', note: 'Address verified, listing looks legitimate.', at: now }],
    ratingSummary: { avg: 4, count: 1 },
    sampleData: true
  });
  await StudioReview.create({
    studioId: studio._id, studioSnapshot: { name: studio.name, photo: '' },
    reviewerId: buyer._id, reviewerSnapshot: { username: buyer.username, avatarUrl: '' },
    rating: 4, title: 'Good light, a bit small',
    comment: 'Cyclorama wall was clean and well lit. Space is tight for a full crew but fine solo or with one assistant.'
  });
  await Studio.create({
    ownerId: seller._id, ownerSnapshot: { username: seller.username, avatarUrl: '' },
    ownerContact: { businessName: 'Minh Studio Rentals', phone: seller.phone, contactEmail: seller.email },
    name: 'Minh Studio Rentals — District 7 (new location)',
    description: 'Second location, larger space with natural light from floor-to-ceiling windows.',
    equipmentHighlights: ['Floor-to-ceiling windows', '3x C-stands'],
    rates: { hourly: 300000, daily: 1800000 },
    location: { formattedAddress: '456 Nguyen Van Linh, District 7, Ho Chi Minh City, Vietnam', osmId: 'sample-osm-2', lat: 10.7291, lng: 106.7217 },
    status: 'pending_review',
    reviewHistory: [{ action: 'submitted', at: now }],
    sampleData: true
  });
  console.log('Seeded 2 sample studios (1 approved + 1 pending review) + 1 studio review.');

  // --- Chat & negotiation --------------------------------------------------
  const convo = await findOrCreateConversation({
    buyer: { id: buyer._id, username: buyer.username },
    seller: { id: seller._id, username: seller.username },
    relatedProductId: cameraProduct._id,
    relatedProductSnapshot: { title: cameraProduct.title, image: '', listPrice: cameraProduct.pricing.listPrice }
  });
  await Message.create({ conversationId: convo._id, senderId: buyer._id, senderSnapshot: { username: buyer.username }, body: `Would you take 19,000,000 for the ${cameraProduct.title}?`, sentAt: new Date(now.getTime() - 60 * 60 * 1000) });
  await Message.create({ conversationId: convo._id, senderId: seller._id, senderSnapshot: { username: seller.username }, body: 'I can do 19,500,000 if you can pick up in person.', sentAt: new Date(now.getTime() - 55 * 60 * 1000) });
  convo.negotiation = { agreedPrice: 19500000, confirmedAt: new Date(now.getTime() - 50 * 60 * 1000) };
  convo.lastMessageAt = new Date(now.getTime() - 50 * 60 * 1000);
  convo.lastMessagePreview = 'Seller confirmed a price of ₫19,500,000.';
  await convo.save();
  console.log('Seeded 1 sample conversation (2 messages, negotiated price confirmed).');

  // --- Notifications ---------------------------------------------------------
  await Notification.insertMany([
    { userId: buyer._id, type: 'order_update', title: 'Order delivered', body: `Your order ${order.orderNumber} was marked delivered.`, linkUrl: `/orders/${order._id}/delivery`, isRead: false, sampleData: true },
    { userId: seller._id, type: 'forum_reply', title: 'New reply to your post', body: 'Lan Anh replied to "Best way to ship a monolight without damaging the bulb?"', linkUrl: `/forum/${forumPost._id}`, isRead: false, sampleData: true }
  ]);
  console.log('Seeded 2 sample notifications.');

  // --- Moderation flag ---------------------------------------------------------
  await ModerationFlag.create({
    targetType: 'forum_reply', targetId: forumPost._id,
    targetSnapshot: { excerpt: 'Double-box it and remove the bulb/tube separately...' },
    flaggedBy: seller._id, reason: 'Marked as a test flag for demonstrating the moderation queue.',
    status: 'open',
    sampleData: true
  });
  console.log('Seeded 1 sample moderation flag (open).');

  console.log('Done. Every collection in the schema now has at least one sample record.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
