import { sqlite } from './db';

console.log('=== ACTUAL SQLITE SCHEMA ===\n');

// Get all table names
const tables = sqlite.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%' 
  ORDER BY name
`).all() as { name: string }[];

tables.forEach(table => {
  console.log(`\n📋 TABLE: ${table.name}`);
  const schema = sqlite.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(table.name) as { sql: string };
  console.log(schema.sql);
  
  // Get indexes for this table
  const indexes = sqlite.prepare(`
    SELECT name, sql FROM sqlite_master 
    WHERE type='index' AND tbl_name = ? AND sql IS NOT NULL
  `).all(table.name) as { name: string; sql: string }[];
  
  if (indexes.length > 0) {
    console.log('\n  Indexes:');
    indexes.forEach(idx => console.log(`  - ${idx.name}`));
  }
});

console.log('\n\n=== COLUMN DETAILS ===\n');
tables.forEach(table => {
  console.log(`\n${table.name}:`);
  const columns = sqlite.pragma(`table_info(${table.name})`) as any[];
  columns.forEach(col => {
    console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
  });
});
