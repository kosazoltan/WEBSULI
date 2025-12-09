import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'sqlite.db');
const db = new Database(dbPath);

console.log('[MIGRATION] Starting classroom 0 title update...');

try {
  // Get all materials with classroom 0 that have "0. osztály" in title
  const materials = db.prepare(`
    SELECT id, title, classroom 
    FROM html_files 
    WHERE classroom = 0 
    AND (title LIKE '%0. osztály%' OR title LIKE '%0.osztály%')
  `).all();

  console.log(`[MIGRATION] Found ${materials.length} materials to update`);

  if (materials.length === 0) {
    console.log('[MIGRATION] ✅ No materials need updating');
    process.exit(0);
  }

  // Update each material's title
  const updateStmt = db.prepare(`
    UPDATE html_files 
    SET title = ? 
    WHERE id = ?
  `);

  let updated = 0;
  for (const material of materials as any[]) {
    const oldTitle = material.title;
    // Replace both "0. osztály" and "0.osztály" with "Programozási alapismeretek"
    const newTitle = oldTitle
      .replace(/0\.\s*osztály/gi, 'Programozási alapismeretek')
      .replace(/0\.?\s*osztály/gi, 'Programozási alapismeretek');
    
    if (oldTitle !== newTitle) {
      updateStmt.run(newTitle, material.id);
      console.log(`[MIGRATION] ✅ Updated: "${oldTitle}" → "${newTitle}"`);
      updated++;
    }
  }

  console.log(`[MIGRATION] ✅ Successfully updated ${updated} material titles`);
  console.log('[MIGRATION] ✅ Migration complete!');

} catch (error) {
  console.error('[MIGRATION] ❌ Error:', error);
  process.exit(1);
} finally {
  db.close();
}
