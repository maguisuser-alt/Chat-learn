import mongoose from "mongoose";
import { buildMongoUri } from "@/lib/dbUri";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  /** Momento y motivo del último fallo, para no reintentar a cada petición. */
  failedAt: number;
  failure: Error | null;
}

// Se guarda en globalThis para sobrevivir al hot reload y reutilizar la
// conexión entre invocaciones en entornos serverless.
const globalWithMongoose = globalThis as typeof globalThis & {
  _mongoose?: MongooseCache;
};

const cache: MongooseCache = (globalWithMongoose._mongoose ??= {
  conn: null,
  promise: null,
  failedAt: 0,
  failure: null,
});

/** Tras un fallo, durante este tiempo se responde error al instante en vez de esperar al timeout. */
const FAIL_COOLDOWN_MS = 30_000;

/** ¿Hay datos de conexión configurados? (no comprueba que el servidor responda) */
export function isDbConfigured(): boolean {
  return buildMongoUri() !== null;
}

export async function connectDB(): Promise<typeof mongoose> {
  const uri = buildMongoUri();
  if (!uri) {
    throw new Error("MongoDB no está configurado: falta MONGODB_HOST (o MONGODB_URI) en .env.local");
  }
  if (cache.conn) return cache.conn;
  if (cache.failure && Date.now() - cache.failedAt < FAIL_COOLDOWN_MS) throw cache.failure;

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, {
      bufferCommands: false,
      maxPoolSize: 10,
      // Sin esto, una base caída bloquea cada petición ~30 s.
      serverSelectionTimeoutMS: 6_000,
    });
  }

  try {
    cache.conn = await cache.promise;
    cache.failure = null;
  } catch (err) {
    cache.promise = null; // permite reintentar tras el enfriamiento
    cache.failedAt = Date.now();
    cache.failure = err instanceof Error ? err : new Error(String(err));
    throw cache.failure;
  }
  return cache.conn;
}
