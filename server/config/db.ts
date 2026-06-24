import { setServers } from 'node:dns';
import mongoose from 'mongoose';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const mongooseCache = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cached: MongooseCache = mongooseCache.mongooseCache ?? {
  conn: null,
  promise: null,
};

mongooseCache.mongooseCache = cached;

function resetCache() {
  cached.conn = null;
  cached.promise = null;
}

if (!mongoose.connection.listeners('disconnected').length) {
  mongoose.connection.on('disconnected', resetCache);
  mongoose.connection.on('error', resetCache);
}

function configureDnsForMongoSrv() {
  // Node on Windows can fail SRV lookups that work in nslookup.
  // Use public DNS servers so mongodb+srv URIs resolve reliably in dev.
  setServers(['1.1.1.1', '8.8.8.8']);
}

export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not defined');
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  resetCache();

  if (!cached.promise) {
    if (uri.startsWith('mongodb+srv://')) {
      configureDnsForMongoSrv();
    }

    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    resetCache();
    throw error;
  }
}
