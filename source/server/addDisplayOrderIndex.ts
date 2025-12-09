import { sqlite } from './db';

console.log('[INDEX] Checking display_order index...');

// Check if index exists
const existingIndexes = sqlite.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='index' AND name='html_files_display_order_idx'
`).all();

if (existingIndexes.length > 0) {
  console.log('[INDEX] ✅ Index already exists');
} else {
  console.log('[INDEX] Creating display_order index...');
  sqlite.exec('CREATE INDEX html_files_display_order_idx ON html_files(display_order)');
  console.log('[INDEX] ✅ Index created successfully');
}

// Verify all html_files indexes
const allIndexes = sqlite.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='index' AND tbl_name='html_files' AND sql IS NOT NULL
`).all();

console.log('\n[INDEX] Current html_files indexes:');
allIndexes.forEach((idx: any) => console.log(`  - ${idx.name}`));
