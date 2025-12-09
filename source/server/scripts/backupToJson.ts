
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import fs from 'fs';
import { config } from 'dotenv';
config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const tables = [
    'users', 'system_prompts', 'html_files', 'email_subscriptions',
    'extra_email_addresses', 'email_logs', 'ai_generation_requests',
    'push_subscriptions', 'backups', 'material_views', 'tags',
    'material_tags', 'material_stats', 'material_likes',
    'material_ratings', 'scheduled_jobs', 'material_comments',
    'weekly_email_reports'
];

async function run() {
    console.log('📦 Starting full database backup to JSON files...');
    if (!fs.existsSync('backups')) fs.mkdirSync('backups');

    for (const table of tables) {
        try {
            const result = await pool.query(`SELECT * FROM "${table}"`);
            fs.writeFileSync(`backups/${table}_backup.json`, JSON.stringify(result.rows, null, 2));
            console.log(`✅ ${table}: ${result.rowCount} rows saved to backups/${table}_backup.json`);
        } catch (e: any) {
            console.error(`❌ ${table} error: ${e.message}`);
        }
    }
    console.log('🎉 All backups completed!');
    process.exit(0);
}
run().catch(console.error);
