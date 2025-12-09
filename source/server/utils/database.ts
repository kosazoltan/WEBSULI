import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

/**
 * Get DATABASE_URL from environment variable
 * Unified database for both development and production
 * @throws Error if DATABASE_URL is not configured
 */
function getDatabaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not found in environment variables');
  }
  
  console.log('[DATABASE] Using unified DATABASE_URL from environment variable');
  return process.env.DATABASE_URL;
}

/**
 * Check if Neon endpoint is active and wake it up if suspended
 * Based on solution from neon_adatbazis_hiba_megoldasok.txt - Section 2
 */
async function ensureEndpointActive(databaseUrl: string): Promise<void> {
  try {
    // Extract endpoint ID from DATABASE_URL
    const match = databaseUrl.match(/ep-[a-z0-9-]+/);
    if (!match) {
      console.log('[NEON] Could not extract endpoint ID from DATABASE_URL');
      return;
    }
    
    const endpointId = match[0];
    console.log(`[NEON] Checking endpoint status: ${endpointId}`);
    
    // Test connection with a simple query
    const testClient = neon(databaseUrl);
    await testClient`SELECT 1 as test`;
    
    console.log('[NEON] ✅ Endpoint is active and responsive');
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    
    if (errorMessage.includes('endpoint has been disabled') || 
        errorMessage.includes('suspended') ||
        errorMessage.includes('not active')) {
      console.error('[NEON] ⚠️ Endpoint is DISABLED/SUSPENDED!');
      console.error('[NEON] 🔧 MEGOLDÁS:');
      console.error('[NEON]    1. Nyisd meg: https://console.neon.tech');
      console.error('[NEON]    2. Válaszd ki a projektet');
      console.error('[NEON]    3. Endpoints menü → Resume/Enable gomb');
      console.error('[NEON]    4. Várj 1-2 percet');
      console.error('[NEON]    5. Restart-eld a Replit alkalmazást');
      throw new Error('Neon endpoint disabled - follow instructions above to enable it');
    }
    
    // Other errors - just log and continue
    console.warn('[NEON] Connection test warning:', errorMessage);
  }
}

/**
 * Get a Neon database client with automatic endpoint activation check
 * Uses unified DATABASE_URL for both development and production
 * @throws Error if DATABASE_URL is not configured or endpoint is disabled
 */
export function getDatabaseClient() {
  const databaseUrl = getDatabaseUrl();
  
  // Check endpoint status on first connection (async, non-blocking for initialization)
  ensureEndpointActive(databaseUrl).catch(err => {
    console.error('[NEON] Endpoint check failed:', err.message);
  });
  
  return neon(databaseUrl);
}

/**
 * Get a Drizzle ORM instance with proper error handling
 * @throws Error if DATABASE_URL is not configured
 */
export function getDrizzleDb() {
  const client = getDatabaseClient();
  return drizzle(client);
}
