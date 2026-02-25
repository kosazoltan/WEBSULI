/**
 * Automatic Database Migration Runner
 * 
 * Runs all pending SQL migrations from the /migrations folder.
 * Safe to run multiple times - uses IF NOT EXISTS and tracks applied migrations.
 * 
 * Called:
 *   1. During Render build (buildCommand in render.yaml)
 *   2. At server startup (imported in index.ts)
 *   3. Manually: npx tsx server/migrate.ts
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run all SQL migration files in order.
 * Each migration file is split on `-->statement-breakpoint` and executed individually.
 * Errors on "already exists" are silently skipped (idempotent).
 */
export async function runMigrations(databaseUrl?: string): Promise<void> {
  const dbUrl = databaseUrl || process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.warn('[MIGRATE] ⚠️ No DATABASE_URL set - skipping migrations');
    return;
  }

  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('neon.tech') || dbUrl.includes('render.com') || dbUrl.includes('supabase')
      ? { rejectUnauthorized: false }
      : undefined,
    connectionTimeoutMillis: 15000,
  });

  const client = await pool.connect();

  try {
    console.log('[MIGRATE] 🔄 Checking for pending migrations...');

    // 1. Create migration tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // 2. Get list of already-applied migrations
    const appliedResult = await client.query(
      'SELECT migration_name FROM "_drizzle_migrations" ORDER BY id'
    );
    const appliedMigrations = new Set(appliedResult.rows.map(r => r.migration_name));

    // 3. Read migration files from disk
    const migrationsDir = path.resolve(__dirname, '..', 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('[MIGRATE] ⚠️ No migrations directory found, skipping');
      return;
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Alphabetical order = chronological (0000_, 0001_, ...)

    if (migrationFiles.length === 0) {
      console.log('[MIGRATE] ✅ No migration files found');
      return;
    }

    // 4. Run each pending migration
    let applied = 0;
    let skipped = 0;

    for (const fileName of migrationFiles) {
      if (appliedMigrations.has(fileName)) {
        skipped++;
        continue;
      }

      const filePath = path.join(migrationsDir, fileName);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Split on drizzle's statement-breakpoint delimiter
      const statements = sql
        .split('--\x3e statement-breakpoint')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      console.log(`[MIGRATE] 📝 Running: ${fileName} (${statements.length} statements)`);

      // Execute each statement in a transaction
      await client.query('BEGIN');
      try {
        for (const stmt of statements) {
          try {
            await client.query(stmt);
          } catch (err: any) {
            // Skip "already exists" errors (idempotent migrations)
            if (err.message.includes('already exists') || 
                err.message.includes('duplicate key')) {
              console.log(`[MIGRATE]   ⚠️ Skipped (already exists): ${stmt.substring(0, 60)}...`);
            } else {
              throw err;
            }
          }
        }

        // Record this migration as applied
        await client.query(
          'INSERT INTO "_drizzle_migrations" (migration_name) VALUES ($1) ON CONFLICT DO NOTHING',
          [fileName]
        );
        await client.query('COMMIT');
        applied++;
        console.log(`[MIGRATE]   ✅ ${fileName} applied successfully`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[MIGRATE]   ❌ ${fileName} FAILED:`, err);
        throw err;
      }
    }

    if (applied > 0) {
      console.log(`[MIGRATE] ✅ Done! ${applied} migration(s) applied, ${skipped} already applied`);
    } else {
      console.log(`[MIGRATE] ✅ Database is up to date (${skipped} migration(s) already applied)`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

// Allow running directly: npx tsx server/migrate.ts
// Check if this file is being run directly (not imported)
const isDirectRun = process.argv[1]?.includes('migrate');
if (isDirectRun) {
  runMigrations()
    .then(() => {
      console.log('[MIGRATE] ✅ Migration complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('[MIGRATE] ❌ Migration failed:', err.message);
      process.exit(1);
    });
}
