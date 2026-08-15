const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Set it in your environment or .env file.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

module.exports = connectDB;
