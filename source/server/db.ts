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
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Timeout after 5 seconds if connection fails
});

// Test connection on startup
pool.connect().then(client => {
  console.log(`[DB] ✅ Database connected successfully (${isDevelopment ? 'DEV' : 'PRODUCTION'})`);
  client.release();
}).catch(err => {
  console.error(`[DB] ❌ Database connection failed:`, err.message);
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Export helper for other modules if they need the pool
export const dbPool = pool;
