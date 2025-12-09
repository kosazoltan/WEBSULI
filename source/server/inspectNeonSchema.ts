import { neon } from '@neondatabase/serverless';

async function inspectSchema() {
  const sql = neon(process.env.DATABASE_URL!);
  
  console.log('📊 Inspecting Neon PostgreSQL Schema...\n');
  
  // Get all tables
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `;
  
  console.log(`Found ${tables.length} tables:\n`);
  
  for (const { table_name } of tables) {
    console.log(`\n🔷 Table: ${table_name}`);
    
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
      console.log(`  - ${col.column_name}: ${col.data_type}${maxLen}${nullable}${def}`);
    });
  }
}

inspectSchema().catch(console.error);
