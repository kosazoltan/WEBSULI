/**
 * Kézi szkript: a megadott e-mail-című felhasználó `is_admin` jelzőjét beállítja (ha nincs ilyen sor, létrehozza).
 * Használat (a `source/` mappából): `node --import tsx server/scripts/setAdmin.ts <email>`
 *
 * A cím KÖTELEZŐ argumentum — beégetett alapérték nincs (a repó nyilvános; docs/specs/2026-11-16-valodi-cimek-ki.md).
 * Admin-JOGOT csak az engedélylistán (ADMIN_ALLOWLIST, alapból ADMIN_EMAIL) szereplő cím kap (JM7c-1, terv 10.4a).
 */
import pg from 'pg';
import { config } from 'dotenv';
import { logger } from "../lib/logger";
import { isAllowlistedAdminEmail, normalizeAdminEmail } from "../lib/admin-access";
import { maskEmail } from "../lib/mask-email";
config();

const email = normalizeAdminEmail(process.argv[2]);
if (!email) {
    logger.error("Használat: node --import tsx server/scripts/setAdmin.ts <email> — a cím kötelező, és érvényes e-mail-cím legyen.");
    process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run(target: string) {
    const masked = maskEmail(target);
    // First check if user exists
    const check = await pool.query(`SELECT id, is_admin FROM users WHERE email = $1`, [target]);
    logger.info(`Current user (${masked}):`, check.rows[0] || 'NOT FOUND');

    if (check.rows.length === 0) {
        // Create admin user (a nevet a Google-belépés tölti ki)
        const insert = await pool.query(`
            INSERT INTO users (email, is_admin)
            VALUES ($1, true)
            RETURNING id, is_admin
        `, [target]);
        logger.info(`Created admin user (${masked}):`, insert.rows[0]);
    } else {
        // Update existing to admin
        const update = await pool.query(`
            UPDATE users SET is_admin = true WHERE email = $1 RETURNING id, is_admin
        `, [target]);
        logger.info(`Updated to admin (${masked}):`, update.rows[0]);
    }
    if (!isAllowlistedAdminEmail(target)) logger.warn("FIGYELEM: a cím nincs az admin-engedélylistán (ADMIN_ALLOWLIST, alapból ADMIN_EMAIL): az admin-jelző beállt, de admin-jogot csak a listára vétel után ad (JM7c-1, terv 10.4a).");
    await pool.end();
    process.exit(0);
}
run(email).catch(e => { logger.error(e); process.exit(1); });
