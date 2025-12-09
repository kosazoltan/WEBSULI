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

// Manually load env from root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../.env") });

const { Pool } = pg;

async function main() {
    console.log("🔄 Starting sync from PRODUCTION to DEVELOPMENT...\n");
    console.log("=".repeat(60));

    // A production URL lehet a PRODUCTION_DATABASE_URL vagy NEON_SOURCE_URL
    const sourceUrl = process.env.PRODUCTION_DATABASE_URL || process.env.NEON_SOURCE_URL;
    const destUrl = process.env.DATABASE_URL;

    if (!sourceUrl) {
        console.error("❌ PRODUCTION_DATABASE_URL or NEON_SOURCE_URL is missing in .env");
        console.error("   Add one of these to your .env file with the production connection string");
        process.exit(1);
    }
    if (!destUrl) {
        console.error("❌ DATABASE_URL is missing in .env");
        process.exit(1);
    }

    // Ellenőrizzük, hogy nem azonosak-e a URL-ek
    if (sourceUrl === destUrl) {
        console.error("❌ SOURCE and DESTINATION URLs are the same! Aborting to prevent data loss.");
        process.exit(1);
    }

    console.log(`📤 SOURCE (Production): ${sourceUrl.replace(/:[^:@]+@/, ':****@').substring(0, 60)}...`);
    console.log(`📥 DESTINATION (Dev):   ${destUrl.replace(/:[^:@]+@/, ':****@').substring(0, 60)}...`);
    console.log("=".repeat(60));

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
        console.log("\n🔌 Testing connections...");
        await sourcePool.query("SELECT 1");
        console.log("   ✅ Source (Production) connected!");
        await destPool.query("SELECT 1");
        console.log("   ✅ Destination (Dev) connected!");

        for (const table of tables) {
            console.log(`\n📦 Processing: ${table.name}`);
            console.log("   " + "-".repeat(40));

            // Fetch from source
            let rows: any[] = [];
            try {
                const res = await sourcePool.query(`SELECT * FROM "${table.name}"`);
                rows = res.rows;
                console.log(`   📊 Found ${rows.length} rows in production`);
            } catch (e: any) {
                if (e.message.includes('does not exist')) {
                    console.log(`   ⚠️ Table doesn't exist in production (Skipping)`);
                } else {
                    console.warn(`   ⚠️ Could not read: ${e.message} (Skipping)`);
                }
                continue;
            }

            if (rows.length === 0) {
                console.log(`   ℹ️ No data to sync`);
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
                    if ((insertRes as any).rowCount > 0) {
                        inserted++;
                    } else {
                        skipped++;
                    }
                } catch (e: any) {
                    if (!e.message.includes('already exists')) {
                        console.error(`   ❌ Error on row ${row[table.pk]}: ${e.message.substring(0, 80)}`);
                    }
                    failed++;
                }
            }

            console.log(`   ✅ Inserted/Updated: ${inserted}`);
            if (skipped > 0) console.log(`   ⏭️ Skipped: ${skipped}`);
            if (failed > 0) console.log(`   ❌ Failed: ${failed}`);

            totalInserted += inserted;
            totalSkipped += skipped;
            totalFailed += failed;
        }

        console.log("\n" + "=".repeat(60));
        console.log("🎉 SYNC COMPLETE!");
        console.log("=".repeat(60));
        console.log(`   📥 Total Inserted/Updated: ${totalInserted}`);
        console.log(`   ⏭️ Total Skipped: ${totalSkipped}`);
        console.log(`   ❌ Total Failed: ${totalFailed}`);
        console.log("=".repeat(60));

    } catch (err) {
        console.error("\n🔥 Fatal error during sync:", err);
        process.exit(1);
    } finally {
        await sourcePool.end();
        await destPool.end();
    }
}

main();
