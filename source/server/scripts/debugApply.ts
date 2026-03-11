/**
 * Direct database diagnostic for the Apply issue
 * 
 * Usage: npx tsx source/server/scripts/debugApply.ts
 * 
 * Requires: DATABASE_URL in .env or environment
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL || process.env.DEV_DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ No DATABASE_URL found. Set it in .env or environment.');
  process.exit(1);
}

console.log(`[DB] Connecting to: ${DATABASE_URL.substring(0, 40)}...`);

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('═══════════════════════════════════════════');
    console.log('  DIRECT DATABASE DIAGNOSTIC');
    console.log('═══════════════════════════════════════════');

    // 1. Check table structure
    console.log('\n[1] html_files table columns:');
    const htmlCols = await client.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'html_files' AND column_name IN ('id', 'content', 'title')
      ORDER BY ordinal_position
    `);
    for (const col of htmlCols.rows) {
      console.log(`  ${col.column_name}: ${col.data_type} (max: ${col.character_maximum_length || 'unlimited'}, nullable: ${col.is_nullable})`);
    }

    // 2. Check constraints on html_files
    console.log('\n[2] Constraints on html_files:');
    const constraints = await client.query(`
      SELECT tc.constraint_name, tc.constraint_type, ccu.column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'html_files'
    `);
    for (const c of constraints.rows) {
      console.log(`  ${c.constraint_type}: ${c.constraint_name} (${c.column_name})`);
    }

    // 3. Check triggers on html_files
    console.log('\n[3] Triggers on html_files:');
    const triggers = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'html_files'
    `);
    if (triggers.rows.length === 0) {
      console.log('  (none)');
    }
    for (const t of triggers.rows) {
      console.log(`  ${t.trigger_name}: ${t.event_manipulation} → ${t.action_statement.substring(0, 100)}`);
    }

    // 4. List ALL improved_html_files
    console.log('\n[4] All improved_html_files:');
    const improved = await client.query(`
      SELECT id, title, status, original_file_id, 
             length(content) as content_length,
             substring(content from 1 for 80) as content_preview,
             created_at
      FROM improved_html_files
      ORDER BY created_at DESC
      LIMIT 10
    `);
    for (const row of improved.rows) {
      console.log(`  ID: ${row.id}`);
      console.log(`    status: ${row.status}, contentLength: ${row.content_length}`);
      console.log(`    originalFileId: ${row.original_file_id}`);
      console.log(`    preview: ${row.content_preview}`);
      console.log('');
    }

    // 5. For EACH improved file, check the original
    console.log('[5] Cross-check with original html_files:');
    for (const row of improved.rows) {
      const orig = await client.query(
        'SELECT id, title, length(content) as cl, substring(content from 1 for 80) as preview FROM html_files WHERE id = $1',
        [row.original_file_id]
      );
      if (orig.rows.length === 0) {
        console.log(`  ❌ Original ${row.original_file_id} NOT FOUND!`);
      } else {
        const o = orig.rows[0];
        console.log(`  Original ${o.id}: title="${o.title}", contentLength=${o.cl}`);
        console.log(`    preview: ${o.preview}`);
        
        // Check if titles match (would indicate Apply worked)
        if (o.title === row.title) {
          console.log(`    ✅ Titles MATCH (Apply may have worked)`);
        } else {
          console.log(`    ❌ Titles DIFFER: original="${o.title}" vs improved="${row.title}"`);
        }
      }
    }

    // 6. TEST: Try a direct UPDATE and verify
    if (improved.rows.length > 0 && improved.rows[0].content_length > 200) {
      const testRow = improved.rows[0];
      console.log(`\n[6] TEST UPDATE: Attempting to write improved content to original...`);
      console.log(`    improved.id = ${testRow.id}`);
      console.log(`    improved.original_file_id = ${testRow.original_file_id}`);
      console.log(`    improved.content_length = ${testRow.content_length}`);

      // Read improved content
      const fullImproved = await client.query(
        'SELECT content FROM improved_html_files WHERE id = $1',
        [testRow.id]
      );
      const improvedContent = fullImproved.rows[0].content;
      console.log(`    Actual content.length = ${improvedContent.length}`);

      // Get original BEFORE
      const beforeQ = await client.query(
        'SELECT length(content) as cl FROM html_files WHERE id = $1',
        [testRow.original_file_id]
      );
      console.log(`    Original BEFORE: contentLength = ${beforeQ.rows[0]?.cl}`);

      // DO THE UPDATE
      const updateResult = await client.query(
        'UPDATE html_files SET content = $1 WHERE id = $2 RETURNING id, length(content) as cl',
        [improvedContent, testRow.original_file_id]
      );
      console.log(`    UPDATE rowCount = ${updateResult.rowCount}`);
      console.log(`    UPDATE returned = ${JSON.stringify(updateResult.rows[0])}`);

      // VERIFY AFTER
      const afterQ = await client.query(
        'SELECT length(content) as cl FROM html_files WHERE id = $1',
        [testRow.original_file_id]
      );
      console.log(`    Original AFTER: contentLength = ${afterQ.rows[0]?.cl}`);

      if (afterQ.rows[0]?.cl === improvedContent.length) {
        console.log('    ✅✅✅ UPDATE VERIFIED! Content matches!');
      } else {
        console.log('    ❌❌❌ UPDATE FAILED! Content does NOT match!');
      }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('  DIAGNOSTIC COMPLETE');
    console.log('═══════════════════════════════════════════');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
