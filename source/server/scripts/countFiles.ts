import { config } from 'dotenv';
config();

import { neon } from '@neondatabase/serverless';

async function main() {
    console.log('Connecting to Neon database...');
    console.log('DATABASE_URL prefix:', process.env.DATABASE_URL?.substring(0, 50) + '...');

    const sql = neon(process.env.DATABASE_URL!);

    // Count html_files
    const countResult = await sql`SELECT COUNT(*)::int as count FROM html_files`;
    console.log('\n📊 Total html_files in database:', countResult[0].count);

    // Show classroom distribution
    const classroomStats = await sql`
    SELECT classroom, COUNT(*)::int as count 
    FROM html_files 
    GROUP BY classroom 
    ORDER BY classroom
  `;

    console.log('\n📚 Distribution by classroom:');
    for (const row of classroomStats) {
        console.log(`   ${row.classroom}. osztály: ${row.count} anyag`);
    }

    // Total
    const total = classroomStats.reduce((sum: number, row: any) => sum + row.count, 0);
    console.log(`\n📈 TOTAL: ${total} tananyag`);
}

main().catch(e => console.error('Error:', e.message));
