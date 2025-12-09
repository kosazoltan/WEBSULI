
import { config } from "dotenv";
import pg from "pg";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../.env") });

const { Pool } = pg;

async function main() {
    const sourceUrl = process.env.NEON_SOURCE_URL;
    console.log(`Sources Analysis on: ${sourceUrl?.split('@')[1].split('/')[0]} ...`);

    if (!sourceUrl) {
        console.error("No NEON_SOURCE_URL set");
        process.exit(1);
    }

    const pool = new Pool({ connectionString: sourceUrl, ssl: true });
    try {
        const dbs = await pool.query("SELECT datname FROM pg_database WHERE datistemplate = false;");
        console.log("Databases:", JSON.stringify(dbs.rows.map(r => r.datname)));

        const schemas = await pool.query("SELECT schema_name FROM information_schema.schemata;");
        console.log("Schemas:", JSON.stringify(schemas.rows.map(r => r.schema_name)));

        const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
        console.log("Tables in public:", JSON.stringify(tables.rows.map(r => r.table_name)));

        // Count for users and html_files if they exist
        if (tables.rows.some(t => t.table_name === 'users')) {
            const c = await pool.query('SELECT COUNT(*) FROM users');
            console.log("Users count:", c.rows[0].count);
        }
        if (tables.rows.some(t => t.table_name === 'html_files')) {
            const h = await pool.query('SELECT COUNT(*) FROM html_files');
            console.log("HTML Files count:", h.rows[0].count);
        }

    } catch (e) { console.error(e); }
    await pool.end();
}
main();
