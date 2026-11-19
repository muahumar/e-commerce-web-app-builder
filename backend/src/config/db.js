const dns = require('dns');
const mongoose = require('mongoose');

let cachedPromise = null;

async function connectDB(uri = process.env.MONGO_URI) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (cachedPromise) return cachedPromise;
  if (!uri) throw new Error('MONGO_URI is not set');
  // Windows/local DNS resolvers sometimes fail SRV lookups for mongodb+srv:// URIs
  if (uri.startsWith('mongodb+srv://') && process.platform === 'win32') {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
  mongoose.set('strictQuery', true);
  cachedPromise = mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 }).then((m) => {
    console.log(`MongoDB connected: ${m.connection.host}/${m.connection.name}`);
    return m.connection;
  }).catch((err) => {
    cachedPromise = null;
    throw err;
  });
  return cachedPromise;
}

module.exports = connectDB;
