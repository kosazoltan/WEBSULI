import { neon } from '@neondatabase/serverless';
import { logger } from "./lib/logger";

async function inspectSchema() {
  const sql = neon(process.env.DATABASE_URL!);
  
  logger.info('📊 Inspecting Neon PostgreSQL Schema...\n');
  
  // Get all tables
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `;
  
  logger.info(`Found ${tables.length} tables:\n`);
  
  for (const { table_name } of tables) {
    logger.info(`\n🔷 Table: ${table_name}`);
    
    // Get columns for this table
    const columns = await sql`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = ${table_name}
      ORDER BY ordinal_position
    `;
    
    columns.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? ' (nullable)' : ' NOT NULL';
      const def = col.column_default ? ` DEFAULT ${col.column_default}` : '';
      const maxLen = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      logger.info(`  - ${col.column_name}: ${col.data_type}${maxLen}${nullable}${def}`);
    });
  }
}

inspectSchema().catch((error: unknown) => logger.error(error));
