import pg from 'pg';
import { config } from 'dotenv';
import { logger } from "../lib/logger";
import { isAllowlistedAdminEmail } from "../lib/admin-access";
config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    const email = 'kosa.zoltan.ebc@gmail.com';

    // First check if user exists
    const check = await pool.query(`SELECT id, email, is_admin FROM users WHERE email = $1`, [email]);
    logger.info('Current user:', check.rows[0] || 'NOT FOUND');

    if (check.rows.length === 0) {
        // Create admin user
        const insert = await pool.query(`
            INSERT INTO users (email, is_admin, first_name, last_name) 
            VALUES ($1, true, 'Zoltán', 'Kósa')
            RETURNING id, email, is_admin
        `, [email]);
        logger.info('Created admin user:', insert.rows[0]);
    } else {
        // Update existing to admin
        const update = await pool.query(`
            UPDATE users SET is_admin = true WHERE email = $1 RETURNING id, email, is_admin
        `, [email]);
        logger.info('Updated to admin:', update.rows[0]);
    }
    if (!isAllowlistedAdminEmail(email)) logger.warn("FIGYELEM: a cím nincs az admin-engedélylistán (ADMIN_ALLOWLIST, alapból ADMIN_EMAIL): az admin-jelző beállt, de admin-jogot csak a listára vétel után ad (JM7c-1, terv 10.4a).");
    await pool.end();
    process.exit(0);
}
run().catch(e => { logger.error(e); process.exit(1); });
