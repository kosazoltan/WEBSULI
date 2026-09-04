/**
 * Sync Production Database to Development
 * 
 * Ez a script a production (Hostinger) adatbázis tartalmát szinkronizálja
 * a helyi development adatbázisba.
 * 
 * Használat:
 *   npx tsx server/scripts/syncFromProduction.ts
 * 
 * Szükséges .env változók:
 *   PRODUCTION_DATABASE_URL - a production adatbázis connection string
 *   DATABASE_URL - a helyi development adatbázis connection string
 */

import { config } from "dotenv";
import pg from "pg";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { logger } from "../lib/logger";

// Manually load env from root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../.env") });

const { Pool } = pg;

async function main() {
    logger.info("🔄 Starting sync from PRODUCTION to DEVELOPMENT...\n");
    logger.info("=".repeat(60));

    // A production URL lehet a PRODUCTION_DATABASE_URL vagy NEON_SOURCE_URL
    const sourceUrl = process.env.PRODUCTION_DATABASE_URL || process.env.NEON_SOURCE_URL;
    const destUrl = process.env.DATABASE_URL;

    if (!sourceUrl) {
        logger.error("❌ PRODUCTION_DATABASE_URL or NEON_SOURCE_URL is missing in .env");
        logger.error("   Add one of these to your .env file with the production connection string");
        process.exit(1);
    }
    if (!destUrl) {
        logger.error("❌ DATABASE_URL is missing in .env");
        process.exit(1);
    }

    // Ellenőrizzük, hogy nem azonosak-e a URL-ek
    if (sourceUrl === destUrl) {
        logger.error("❌ SOURCE and DESTINATION URLs are the same! Aborting to prevent data loss.");
        process.exit(1);
    }

    logger.info(`📤 SOURCE (Production): ${sourceUrl.replace(/:[^:@]+@/, ':****@').substring(0, 60)}...`);
    logger.info(`📥 DESTINATION (Dev):   ${destUrl.replace(/:[^:@]+@/, ':****@').substring(0, 60)}...`);
    logger.info("=".repeat(60));

    // SSL beállítás a production adatbázishoz
    const sourcePool = new Pool({
        connectionString: sourceUrl,
        ssl: sourceUrl.includes('neon.tech') || sourceUrl.includes('hostinger')
            ? { rejectUnauthorized: false }
            : false
    });

    const destPool = new Pool({ connectionString: destUrl });

    // Táblák függőségi sorrendben (szülő táblák előbb)
    const tables = [
        { name: 'users', pk: 'id' },
        { name: 'system_prompts', pk: 'id' },
        { name: 'html_files', pk: 'id' },
        { name: 'email_subscriptions', pk: 'id' },
        { name: 'extra_email_addresses', pk: 'id' },
        { name: 'email_logs', pk: 'id' },
        { name: 'ai_generation_requests', pk: 'id' },
        { name: 'push_subscriptions', pk: 'id' },
        { name: 'backups', pk: 'id' },
        { name: 'material_views', pk: 'id' },
        { name: 'tags', pk: 'id' },
        { name: 'material_tags', pk: 'id' },
        { name: 'material_stats', pk: 'material_id' },
        { name: 'material_likes', pk: 'id' },
        { name: 'material_ratings', pk: 'id' },
        { name: 'scheduled_jobs', pk: 'id' },
        { name: 'material_comments', pk: 'id' },
        { name: 'weekly_email_reports', pk: 'id' }
    ];

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    try {
        // Teszt kapcsolatok
        logger.info("\n🔌 Testing connections...");
        await sourcePool.query("SELECT 1");
        logger.info("   ✅ Source (Production) connected!");
        await destPool.query("SELECT 1");
        logger.info("   ✅ Destination (Dev) connected!");

        for (const table of tables) {
            logger.info(`\n📦 Processing: ${table.name}`);
            logger.info("   " + "-".repeat(40));

            // Fetch from source
            let rows: Array<Record<string, unknown>> = [];
            try {
                const res = await sourcePool.query(`SELECT * FROM "${table.name}"`);
                rows = res.rows;
                logger.info(`   📊 Found ${rows.length} rows in production`);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.includes('does not exist')) {
                    logger.info(`   ⚠️ Table doesn't exist in production (Skipping)`);
                } else {
                    logger.warn(`   ⚠️ Could not read: ${msg} (Skipping)`);
                }
                continue;
            }

            if (rows.length === 0) {
                logger.info(`   ℹ️ No data to sync`);
                continue;
            }

            let inserted = 0;
            let skipped = 0;
            let failed = 0;

            for (const row of rows) {
                const keys = Object.keys(row);
                if (keys.length === 0) continue;

                const columns = keys.map(k => `"${k}"`).join(', ');
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
                const values = Object.values(row);

                // UPSERT: UPDATE on conflict (teljes szinkronizálás)
                const updateSet = keys
                    .filter(k => k !== table.pk)
                    .map(k => `"${k}" = EXCLUDED."${k}"`)
                    .join(', ');

                const query = updateSet
                    ? `
                        INSERT INTO "${table.name}" (${columns})
                        VALUES (${placeholders})
                        ON CONFLICT ("${table.pk}") DO UPDATE SET ${updateSet}
                    `
                    : `
                        INSERT INTO "${table.name}" (${columns})
                        VALUES (${placeholders})
                        ON CONFLICT ("${table.pk}") DO NOTHING
                    `;

                try {
                    const insertRes = await destPool.query(query, values);
                    if ((insertRes.rowCount ?? 0) > 0) {
                        inserted++;
                    } else {
                        skipped++;
                    }
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    if (!msg.includes('already exists')) {
                        logger.error(`   ❌ Error on row ${row[table.pk]}: ${msg.substring(0, 80)}`);
                    }
                    failed++;
                }
            }

            logger.info(`   ✅ Inserted/Updated: ${inserted}`);
            if (skipped > 0) logger.info(`   ⏭️ Skipped: ${skipped}`);
            if (failed > 0) logger.info(`   ❌ Failed: ${failed}`);

            totalInserted += inserted;
            totalSkipped += skipped;
            totalFailed += failed;
        }

        logger.info("\n" + "=".repeat(60));
        logger.info("🎉 SYNC COMPLETE!");
        logger.info("=".repeat(60));
        logger.info(`   📥 Total Inserted/Updated: ${totalInserted}`);
        logger.info(`   ⏭️ Total Skipped: ${totalSkipped}`);
        logger.info(`   ❌ Total Failed: ${totalFailed}`);
        logger.info("=".repeat(60));

    } catch (err) {
        logger.error("\n🔥 Fatal error during sync:", err);
        process.exit(1);
    } finally {
        await sourcePool.end();
        await destPool.end();
    }
}

main();
