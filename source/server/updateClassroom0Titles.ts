import Database from 'better-sqlite3';
import path from 'path';
import { logger } from "./lib/logger";

const dbPath = path.join(process.cwd(), 'sqlite.db');
const db = new Database(dbPath);

logger.info('[MIGRATION] Starting classroom 0 title update...');

try {
  // Get all materials with classroom 0 that have "0. osztály" in title
  const materials = db.prepare(`
    SELECT id, title, classroom 
    FROM html_files 
    WHERE classroom = 0 
    AND (title LIKE '%0. osztály%' OR title LIKE '%0.osztály%')
  `).all();

  logger.info(`[MIGRATION] Found ${materials.length} materials to update`);

  if (materials.length === 0) {
    logger.info('[MIGRATION] ✅ No materials need updating');
    process.exit(0);
  }

  // Update each material's title
  const updateStmt = db.prepare(`
    UPDATE html_files 
    SET title = ? 
    WHERE id = ?
  `);

  let updated = 0;
  for (const material of materials as Array<{ id: string; title: string; classroom: number }>) {
    const oldTitle = material.title;
    // Replace both "0. osztály" and "0.osztály" with "Programozási alapismeretek"
    const newTitle = oldTitle
      .replace(/0\.\s*osztály/gi, 'Programozási alapismeretek')
      .replace(/0\.?\s*osztály/gi, 'Programozási alapismeretek');
    
    if (oldTitle !== newTitle) {
      updateStmt.run(newTitle, material.id);
      logger.info(`[MIGRATION] ✅ Updated: "${oldTitle}" → "${newTitle}"`);
      updated++;
    }
  }

  logger.info(`[MIGRATION] ✅ Successfully updated ${updated} material titles`);
  logger.info('[MIGRATION] ✅ Migration complete!');

} catch (error) {
  logger.error('[MIGRATION] ❌ Error:', error);
  process.exit(1);
} finally {
  db.close();
}
