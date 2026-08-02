const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('✗ MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('✓ MongoDB connected:', mongoose.connection.name);
  return mongoose.connection;
}

module.exports = { connectDB };
