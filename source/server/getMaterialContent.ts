import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'sqlite.db');
const db = new Database(dbPath);

const materialId = process.argv[2] || 'ba65a525-9330-42d5-a175-ef5ed7ee9252';

try {
  const result = db.prepare('SELECT content FROM html_files WHERE id = ?').get(materialId) as any;
  
  if (result) {
    // Write to file
    fs.writeFileSync('/tmp/material_content.html', result.content);
    console.log('✅ Content written to /tmp/material_content.html');
    console.log(`Size: ${result.content.length} bytes`);
  } else {
    console.log('❌ Material not found');
  }
} catch (error) {
  console.error('Error:', error);
} finally {
  db.close();
}
