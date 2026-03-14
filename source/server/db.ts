import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from "@shared/schema";

const { Pool } = pg;

// Select database URL based on environment with fallback
const isDevelopment = process.env.NODE_ENV === 'development';

let DATABASE_URL: string;

// Determine which database URL to use
if (isDevelopment && process.env.DEV_DATABASE_URL) {
  DATABASE_URL = process.env.DEV_DATABASE_URL;
} else if (process.env.DATABASE_URL) {
  DATABASE_URL = process.env.DATABASE_URL;
} else {
  // Warn but don't crash immediately, let the pool try to connect
  console.warn('DATABASE_URL environment variable is not set. Database connection will fail.');
  DATABASE_URL = "postgres://postgres:postgres@localhost:5432/websuli"; // Default fallback
}

// Create PG Pool with proper configuration
// SSL: Auto-detect Neon/Render/Supabase URLs OR sslmode= param in connection string
const requiresSSL = DATABASE_URL.includes('neon.tech') || DATABASE_URL.includes('render.com') || DATABASE_URL.includes('supabase') || DATABASE_URL.includes('sslmode=');

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10, // Reduced for Neon free tier (max ~100 connections shared across all clients)
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // 10s timeout — Neon cold start can take 3-5s
  ...(requiresSSL && { ssl: { rejectUnauthorized: false } }),
});

// Test connection on startup with retry for Neon cold starts
async function testConnectionWithRetry(maxRetries = 3, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      console.log(`[DB] ✅ Database connected successfully (${isDevelopment ? 'DEV' : 'PRODUCTION'})`);
      client.release();
      return;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt) {
        console.error(`[DB] ❌ Database connection failed after ${maxRetries} attempts:`, errMsg);
        console.error(`[DB] 🔧 Ellenőrizd: DATABASE_URL helyesen van-e beállítva a Render environment variables-ban`);
        console.error(`[DB] 🔧 Neon console: https://console.neon.tech — endpoint aktív-e?`);
      } else {
        console.warn(`[DB] ⚠️ Connection attempt ${attempt}/${maxRetries} failed: ${errMsg} — retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
      }
    }
  }
}

testConnectionWithRetry();

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Export helper for other modules if they need the pool
export const dbPool = pool;
