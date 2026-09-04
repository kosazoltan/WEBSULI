import { config } from 'dotenv';
config();

import { neon } from '@neondatabase/serverless';
import { logger } from "../lib/logger";

async function main() {
    logger.info('Connecting to Neon database...');
    logger.info('DATABASE_URL prefix:', process.env.DATABASE_URL?.substring(0, 50) + '...');

    const sql = neon(process.env.DATABASE_URL!);

    // Count html_files
    const countResult = await sql`SELECT COUNT(*)::int as count FROM html_files`;
    logger.info('\n📊 Total html_files in database:', countResult[0].count);

    // Show classroom distribution
    const classroomStats = await sql`
    SELECT classroom, COUNT(*)::int as count 
    FROM html_files 
    GROUP BY classroom 
    ORDER BY classroom
  `;

    logger.info('\n📚 Distribution by classroom:');
    for (const row of classroomStats) {
        logger.info(`   ${row.classroom}. osztály: ${row.count} anyag`);
    }

    // Total
    const total = classroomStats.reduce((sum: number, row) => sum + Number(row.count), 0);
    logger.info(`\n📈 TOTAL: ${total} tananyag`);
}

main().catch(e => logger.error('Error:', e.message));
