
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
    logger.info("🚀 Starting import from Neon DB to Local Hostinger DB...");

    const sourceUrl = process.env.NEON_SOURCE_URL;
    const destUrl = process.env.DATABASE_URL;

    if (!sourceUrl) {
        logger.error("❌ NEON_SOURCE_URL is missing in .env");
        process.exit(1);
    }
    if (!destUrl) {
        logger.error("❌ DATABASE_URL is missing in .env");
        process.exit(1);
    }

    logger.info(`🔌 Connecting to source: ${sourceUrl.substring(0, 20)}...`);
    const sourcePool = new Pool({ connectionString: sourceUrl, ssl: true });

    logger.info(`🔌 Connecting to destination: ${destUrl.substring(0, 20)}...`);
    const destPool = new Pool({ connectionString: destUrl });

    // Helper to list tables could be useful, but we have a defined order.
    // List of tables in dependency order (parents first)
    const tables = [
        { name: 'users', pk: 'id' },
        { name: 'system_prompts', pk: 'id' },
        { name: 'html_files', pk: 'id' }, // depends on users
        { name: 'email_subscriptions', pk: 'id' }, // depends on users
        { name: 'extra_email_addresses', pk: 'id' }, // depends on users
        { name: 'email_logs', pk: 'id' }, // depends on html_files
        { name: 'ai_generation_requests', pk: 'id' }, // depends on users
        { name: 'push_subscriptions', pk: 'id' }, // depends on users
        { name: 'backups', pk: 'id' },
        { name: 'material_views', pk: 'id' }, // depends on users, html_files
        { name: 'tags', pk: 'id' },
        { name: 'material_tags', pk: 'id' }, // depends on html_files, tags
        { name: 'material_stats', pk: 'material_id' }, // depends on html_files
        { name: 'material_likes', pk: 'id' }, // depends on html_files
        { name: 'material_ratings', pk: 'id' }, // depends on html_files
        { name: 'scheduled_jobs', pk: 'id' }, // depends on users
        { name: 'material_comments', pk: 'id' }, // depends on users, html_files
        { name: 'weekly_email_reports', pk: 'id' }
    ];

    try {
        for (const table of tables) {
            logger.info(`\n📦 Processing table: ${table.name}...`);

            // Fetch from source
            let rows = [];
            try {
                const res = await sourcePool.query(`SELECT * FROM "${table.name}"`);
                rows = res.rows;
                logger.info(`   Found ${rows.length} rows in source.`);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                logger.warn(`   ⚠️ Could not read from source table ${table.name}: ${msg} (Skipping)`);
                continue;
            }

            if (rows.length === 0) continue;

            let inserted = 0;
            let skipped = 0;
            let failed = 0;

            for (const row of rows) {
                const keys = Object.keys(row);
                if (keys.length === 0) continue;

                const columns = keys.map(k => `"${k}"`).join(', ');
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
                const values = Object.values(row);

                // UPSERT strategy: DO NOTHING on conflict
                const query = `
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
                    // Try to catch missing column errors (schema drift)
                    const msg = e instanceof Error ? e.message : String(e);
                    logger.error(`   ❌ Error inserting ID ${row[table.pk]}: ${msg}`);
                    failed++;
                }
            }
            logger.info(`   ✅ Inserted: ${inserted}, ⏭️ Skipped: ${skipped}, ❌ Failed: ${failed}`);
        }

        logger.info("\n🎉 Import finished!");
    } catch (err) {
        logger.error("🔥 Fatal error during import:", err);
    } finally {
        await sourcePool.end();
        await destPool.end();
    }
}

main();
