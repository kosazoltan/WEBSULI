import pg from 'pg';
import { config } from 'dotenv';
config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    const email = 'kosa.zoltan.ebc@gmail.com';

    // First check if user exists
    const check = await pool.query(`SELECT id, email, is_admin FROM users WHERE email = $1`, [email]);
    console.log('Current user:', check.rows[0] || 'NOT FOUND');

    if (check.rows.length === 0) {
        // Create admin user
        const insert = await pool.query(`
            INSERT INTO users (email, is_admin, first_name, last_name) 
            VALUES ($1, true, 'Zoltán', 'Kósa')
            RETURNING id, email, is_admin
        `, [email]);
        console.log('Created admin user:', insert.rows[0]);
    } else {
        // Update existing to admin
        const update = await pool.query(`
            UPDATE users SET is_admin = true WHERE email = $1 RETURNING id, email, is_admin
        `, [email]);
        console.log('Updated to admin:', update.rows[0]);
    }
    await pool.end();
    process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
