// Removes everything flagged sampleData: true — the 2 sample users and the
// 5 sample listings created by `npm run seed`. The admin account and FAQ
// entries are left untouched (they were never flagged as sample data).
require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/user.model');
const Product = require('../models/product.model');

async function unseed() {
  await connectDB();
  const users = await User.deleteMany({ sampleData: true });
  const products = await Product.deleteMany({ sampleData: true });
  console.log(`Removed ${users.deletedCount} sample user(s) and ${products.deletedCount} sample listing(s).`);
  console.log('Note: this does not remove any carts/orders/reviews/wishlist entries that reference those sample listings — check those collections manually if needed.');
  process.exit(0);
}

unseed().catch(err => {
  console.error('Unseed failed:', err);
  process.exit(1);
});
