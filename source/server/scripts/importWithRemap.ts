
import { config } from "dotenv";
import pg from "pg";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../.env") });

const { Pool } = pg;

async function main() {
    console.log("🚀 Starting SMART Import (with User Remapping)...");

    const sourceUrl = process.env.NEON_SOURCE_URL;
    const destUrl = process.env.DATABASE_URL;

    if (!sourceUrl || !destUrl) process.exit(1);

    const sourcePool = new Pool({ connectionString: sourceUrl, ssl: true });
    const destPool = new Pool({ connectionString: destUrl });

    const userIdMap = new Map<string, string>(); // SourceID -> DestID

    try {
        // 1. Process USERS & build map
        console.log("📦 Processing USERS and building ID map...");

        const destUsers = await destPool.query('SELECT id, email FROM users');
        const emailToDestId = new Map<string, string>();
        destUsers.rows.forEach(r => {
            if (r.email) emailToDestId.set(r.email, r.id);
        });

        const srcUsers = await sourcePool.query('SELECT * FROM users');
        for (const user of srcUsers.rows) {
            const srcId = user.id;
            const email = user.email;

            // Check if email already exists in destination
            if (email && emailToDestId.has(email)) {
                const existingDestId = emailToDestId.get(email)!;
                userIdMap.set(srcId, existingDestId);
                // console.log(`   Users: Remapped ${srcId} -> ${existingDestId} (${email})`);
                continue; // Do not insert, user exists
            }

            // Valid new user? Try to insert
            const keys = Object.keys(user);
            const columns = keys.map(k => `"${k}"`).join(', ');
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            const values = Object.values(user);

            const query = `
                INSERT INTO "users" (${columns}) VALUES (${placeholders})
                ON CONFLICT ("id") DO NOTHING
            `;

            try {
                const res = await destPool.query(query, values);
                // Assuming successful insert or conflict (if conflict on ID, srcId=destId)
                userIdMap.set(srcId, srcId);
            } catch (e: any) {
                if (e.code === '23505') { // Unique violation (should be handled by logic above, but safety net)
                    console.warn(`   Users: Schema constraint conflict for ${email}, skipping.`);
                } else {
                    console.error(`   Users: Error inserting ${email}: ${e.message}`);
                }
            }
        }
        console.log(`   User mapping complete. Mapped ${userIdMap.size} users.`);

        // 2. Process Tables with Mapping
        const tables = [
            { name: 'system_prompts', pk: 'id' }, // No user FK
            { name: 'html_files', pk: 'id', fk: 'user_id' },
            { name: 'email_subscriptions', pk: 'id', fk: 'user_id' },
            { name: 'extra_email_addresses', pk: 'id', fk: 'added_by' },
            { name: 'email_logs', pk: 'id' },
            { name: 'ai_generation_requests', pk: 'id', fk: 'user_id' },
            { name: 'push_subscriptions', pk: 'id', fk: 'user_id' },
            { name: 'backups', pk: 'id', fk: 'created_by' },
            { name: 'material_views', pk: 'id', fk: 'user_id' },
            { name: 'tags', pk: 'id' },
            { name: 'material_tags', pk: 'id' },
            { name: 'material_stats', pk: 'material_id' },
            { name: 'material_likes', pk: 'id', fk: 'user_id' },
            { name: 'material_ratings', pk: 'id', fk: 'user_id' },
            { name: 'scheduled_jobs', pk: 'id', fk: 'created_by' },
            { name: 'material_comments', pk: 'id', fk: 'user_id' },
            { name: 'weekly_email_reports', pk: 'id' }
        ];

        for (const table of tables) {
            console.log(`📦 Processing ${table.name}...`);
            let rows;
            try {
                const res = await sourcePool.query(`SELECT * FROM "${table.name}"`);
                rows = res.rows;
            } catch (e) { console.log(`   Skipping (missing source table)`); continue; }

            if (rows.length === 0) continue;
            let count = 0;

            for (const row of rows) {
                // Remap Foreign Keys
                if (table.fk && row[table.fk] && userIdMap.has(row[table.fk])) {
                    row[table.fk] = userIdMap.get(row[table.fk]);
                }
                // Special case: material_comments has 'approved_by' too?
                if (table.name === 'material_comments' && row.approved_by && userIdMap.has(row.approved_by)) {
                    row.approved_by = userIdMap.get(row.approved_by);
                }

                // Insert
                const keys = Object.keys(row);
                const columns = keys.map(k => `"${k}"`).join(', ');
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
                const values = Object.values(row);

                const query = `
                    INSERT INTO "${table.name}" (${columns}) VALUES (${placeholders})
                    ON CONFLICT ("${table.pk}") DO NOTHING
                `;

                try {
                    const res = await destPool.query(query, values);
                    if ((res as any).rowCount > 0) count++;
                } catch (e: any) {
                    // Ignore some errors
                }
            }
            console.log(`   Imported ${count} new rows.`);
        }
        console.log("🎉 SMART Import Finished!");

    } catch (e) { console.error(e); }
    await sourcePool.end();
    await destPool.end();
}
main();
