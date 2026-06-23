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

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    if (uri.startsWith('mongodb+srv://')) {
      configureDnsForMongoSrv();
    }

    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
