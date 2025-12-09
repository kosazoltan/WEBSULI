
import { config } from "dotenv";
import pg from "pg";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../.env") });

const { Pool } = pg;

async function main() {
    const destUrl = process.env.DATABASE_URL;
    const destPool = new Pool({ connectionString: destUrl });
    try {
        const res = await destPool.query('SELECT COUNT(*) FROM html_files');
        console.log(`[HOSTINGER] html_files count: ${res.rows[0].count}`);
    } catch (e) { console.error(e); }
    await destPool.end();
}
main();
