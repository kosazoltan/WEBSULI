/**
 * 🔒 BIZTONSÁGOS Production Database Diagnosztika
 * 
 * Az adatbázis URL-t stdin-ről olvassa – NEM kerül fájlba, logba, sehova.
 * 
 * Használat:
 *   npx tsx source/server/scripts/dbDiagnose.ts
 * 
 * Majd bemásolod a DATABASE_URL-t és Enter.
 */
import pg from 'pg';
import * as readline from 'readline';

// ========== BIZTONSÁGOS INPUT ==========
async function secureReadLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    // Attempt to hide input on terminals that support it
    if (process.stdin.isTTY) {
      process.stdout.write(prompt);
      const stdin = process.stdin as any;
      stdin.setRawMode?.(true);
      let input = '';
      const onData = (ch: Buffer) => {
        const c = ch.toString();
        if (c === '\n' || c === '\r') {
          stdin.setRawMode?.(false);
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u007F' || c === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (c === '\u0003') {
          // Ctrl+C
          process.exit(0);
        } else {
          input += c;
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', onData);
    } else {
      // Non-TTY (piped input)
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

// ========== DIAGNOSZTIKA ==========
async function runDiagnostics(dbUrl: string) {
  // Mask URL in all output
  const maskedUrl = dbUrl.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  console.log(`\n🔌 Csatlakozás: ${maskedUrl.substring(0, 60)}...`);

  const pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('render.com') || dbUrl.includes('neon.tech') || dbUrl.includes('supabase')
      ? { rejectUnauthorized: false }
      : undefined,
    connectionTimeoutMillis: 10000,
  });

  const client = await pool.connect();
  console.log('✅ Csatlakozva!\n');

  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     PRODUCTION DATABASE DIAGNOSZTIKA                    ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    // ══════ 1. PostgreSQL verzió ══════
    console.log('\n━━━ [1] PostgreSQL verzió ━━━');
    const versionResult = await client.query('SELECT version()');
    console.log('  ', versionResult.rows[0].version.substring(0, 80));

    // ══════ 2. html_files tábla struktúra ══════
    console.log('\n━━━ [2] html_files tábla struktúra ━━━');
    const htmlCols = await client.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'html_files'
      ORDER BY ordinal_position
    `);
    for (const col of htmlCols.rows) {
      const maxLen = col.character_maximum_length ? ` (max: ${col.character_maximum_length})` : '';
      console.log(`  ${col.column_name}: ${col.data_type}${maxLen} | nullable: ${col.is_nullable} | default: ${col.column_default || '-'}`);
    }

    // ══════ 3. improved_html_files tábla struktúra ══════
    console.log('\n━━━ [3] improved_html_files tábla struktúra ━━━');
    const improvedCols = await client.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'improved_html_files'
      ORDER BY ordinal_position
    `);
    for (const col of improvedCols.rows) {
      const maxLen = col.character_maximum_length ? ` (max: ${col.character_maximum_length})` : '';
      console.log(`  ${col.column_name}: ${col.data_type}${maxLen} | nullable: ${col.is_nullable}`);
    }

    // ══════ 4. Constraints (html_files) ══════
    console.log('\n━━━ [4] Constraints: html_files ━━━');
    const constraints = await client.query(`
      SELECT tc.constraint_name, tc.constraint_type, 
             string_agg(ccu.column_name, ', ') as columns
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'html_files'
      GROUP BY tc.constraint_name, tc.constraint_type
    `);
    if (constraints.rows.length === 0) {
      console.log('  (nincs constraint)');
    }
    for (const c of constraints.rows) {
      console.log(`  ${c.constraint_type}: ${c.constraint_name} → (${c.columns})`);
    }

    // ══════ 5. Triggers (html_files) ══════
    console.log('\n━━━ [5] Triggers: html_files ━━━');
    const triggers = await client.query(`
      SELECT trigger_name, event_manipulation, action_timing, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'html_files'
    `);
    if (triggers.rows.length === 0) {
      console.log('  ✅ Nincs trigger (ez jó)');
    } else {
      for (const t of triggers.rows) {
        console.log(`  ⚠️ ${t.trigger_name}: ${t.action_timing} ${t.event_manipulation}`);
        console.log(`     → ${t.action_statement.substring(0, 120)}`);
      }
    }

    // ══════ 6. Row-Level Security (RLS) ══════
    console.log('\n━━━ [6] Row-Level Security (RLS) ━━━');
    const rlsResult = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname IN ('html_files', 'improved_html_files')
    `);
    for (const r of rlsResult.rows) {
      const rlsEnabled = r.relrowsecurity ? '⚠️ ENGEDÉLYEZVE' : '✅ Kikapcsolva';
      const rlsForced = r.relforcerowsecurity ? ' (FORCED!)' : '';
      console.log(`  ${r.relname}: RLS ${rlsEnabled}${rlsForced}`);
    }

    // Check RLS policies
    const policies = await client.query(`
      SELECT schemaname, tablename, policyname, cmd, qual
      FROM pg_policies
      WHERE tablename IN ('html_files', 'improved_html_files')
    `);
    if (policies.rows.length > 0) {
      console.log('  RLS Policies:');
      for (const p of policies.rows) {
        console.log(`    ${p.tablename}.${p.policyname}: ${p.cmd} → ${p.qual?.substring(0, 100) || '(all)'}`);
      }
    }

    // ══════ 7. Current DB user & permissions ══════
    console.log('\n━━━ [7] Aktuális DB user és jogosultságok ━━━');
    const currentUser = await client.query('SELECT current_user, current_database(), current_schema()');
    const cu = currentUser.rows[0];
    console.log(`  User: ${cu.current_user} | DB: ${cu.current_database} | Schema: ${cu.current_schema}`);

    const privs = await client.query(`
      SELECT privilege_type 
      FROM information_schema.table_privileges 
      WHERE table_name = 'html_files' AND grantee = current_user
    `);
    console.log(`  html_files jogok: ${privs.rows.map(r => r.privilege_type).join(', ') || '(nincs explicit - lehet superuser)'}`);

    // ══════ 8. Improved files listázás ══════
    console.log('\n━━━ [8] Improved HTML files (utolsó 10) ━━━');
    const improved = await client.query(`
      SELECT id, title, status, original_file_id, 
             length(content) as content_length,
             CASE WHEN content LIKE '%Feldolgozás alatt%' THEN 'PLACEHOLDER!' ELSE 'OK' END as content_check,
             substring(content from 1 for 100) as preview,
             created_at, applied_at
      FROM improved_html_files
      ORDER BY created_at DESC
      LIMIT 10
    `);
    if (improved.rows.length === 0) {
      console.log('  (nincs improved file)');
    }
    for (const row of improved.rows) {
      console.log(`\n  📄 ID: ${row.id}`);
      console.log(`     Cím: ${row.title}`);
      console.log(`     Státusz: ${row.status} | Content: ${row.content_length} byte | ${row.content_check}`);
      console.log(`     Original: ${row.original_file_id}`);
      console.log(`     Preview: ${row.preview?.substring(0, 80)}...`);
      console.log(`     Létrehozva: ${row.created_at}`);
    }

    // ══════ 9. Cross-check: original vs improved ══════
    console.log('\n━━━ [9] Cross-check: Original ↔ Improved ━━━');
    for (const row of improved.rows) {
      if (row.status === 'processing' || row.status === 'error') continue;
      
      const orig = await client.query(
        `SELECT id, title, length(content) as cl, 
                substring(content from 1 for 100) as preview
         FROM html_files WHERE id = $1`,
        [row.original_file_id]
      );
      if (orig.rows.length === 0) {
        console.log(`  ❌ Original ${row.original_file_id} NEM LÉTEZIK!`);
      } else {
        const o = orig.rows[0];
        const titleMatch = o.title === row.title;
        const contentMatch = o.cl === row.content_length;
        console.log(`  ${row.status === 'applied' ? '🟢' : '🟡'} improved=${row.id.substring(0, 8)}... → original=${o.id.substring(0, 8)}...`);
        console.log(`     Cím:     improved="${row.title}" vs original="${o.title}" ${titleMatch ? '✅ EGYEZIK' : '❌ ELTÉR'}`);
        console.log(`     Content: improved=${row.content_length}b vs original=${o.cl}b ${contentMatch ? '✅ EGYEZIK' : '❌ ELTÉR'}`);
      }
    }

    // ══════ 10. TESZT: Próba UPDATE + VERIFY ══════
    console.log('\n━━━ [10] 🧪 TESZT: Próba UPDATE (read-write teszt) ━━━');
    
    // Find the latest improved file with real content
    const testCandidate = improved.rows.find(
      r => r.content_length > 200 && r.content_check === 'OK' && r.original_file_id
    );

    if (!testCandidate) {
      console.log('  ⚠️ Nincs alkalmas improved file a teszthez (>200 byte, nem placeholder)');
    } else {
      console.log(`  Test target: improved=${testCandidate.id.substring(0, 8)}... → original=${testCandidate.original_file_id.substring(0, 8)}...`);
      
      // Read original BEFORE
      const beforeQ = await client.query(
        'SELECT length(content) as cl, substring(content from 1 for 80) as preview FROM html_files WHERE id = $1',
        [testCandidate.original_file_id]
      );
      const before = beforeQ.rows[0];
      console.log(`  BEFORE: original contentLength=${before?.cl}, preview="${before?.preview?.substring(0, 60)}..."`);

      // Read improved content
      const improvedContentQ = await client.query(
        'SELECT content FROM improved_html_files WHERE id = $1',
        [testCandidate.id]
      );
      const improvedContent = improvedContentQ.rows[0]?.content;
      console.log(`  Improved content length: ${improvedContent?.length}`);

      // DO THE UPDATE
      console.log(`  🔧 Executing: UPDATE html_files SET content = $improved WHERE id = $originalId`);
      const updateResult = await client.query(
        'UPDATE html_files SET content = $1, title = $2 WHERE id = $3 RETURNING id, title, length(content) as cl',
        [improvedContent, testCandidate.title, testCandidate.original_file_id]
      );
      console.log(`  UPDATE rowCount: ${updateResult.rowCount}`);
      console.log(`  UPDATE returning: ${JSON.stringify(updateResult.rows[0])}`);

      // VERIFY AFTER
      const afterQ = await client.query(
        'SELECT length(content) as cl, title, substring(content from 1 for 80) as preview FROM html_files WHERE id = $1',
        [testCandidate.original_file_id]
      );
      const after = afterQ.rows[0];
      console.log(`  AFTER: original contentLength=${after?.cl}, title="${after?.title}", preview="${after?.preview?.substring(0, 60)}..."`);

      // VERDICT
      if (after?.cl === improvedContent?.length) {
        console.log(`  ✅✅✅ UPDATE SIKERES! Content hossz egyezik (${after.cl} byte)`);
      } else {
        console.log(`  ❌❌❌ UPDATE SIKERTELEN! Expected: ${improvedContent?.length}, Got: ${after?.cl}`);
      }

      // Also mark as applied
      await client.query(
        "UPDATE improved_html_files SET status = 'applied', applied_at = NOW() WHERE id = $1",
        [testCandidate.id]
      );
      console.log(`  ✅ Improved file status → 'applied'`);
    }

    // ══════ 11. Check for replication / read replicas ══════
    console.log('\n━━━ [11] Replication állapot ━━━');
    try {
      const replResult = await client.query(`
        SELECT pg_is_in_recovery() as is_replica,
               CASE WHEN pg_is_in_recovery() THEN 'READ-ONLY REPLICA!' ELSE 'PRIMARY (read-write)' END as role
      `);
      const repl = replResult.rows[0];
      console.log(`  Szerver: ${repl.role} ${repl.is_replica ? '⚠️⚠️⚠️ EZ REPLICA - EZÉRT NEM MŰKÖDIK AZ UPDATE!' : '✅'}`);
    } catch {
      console.log('  (nem sikerült ellenőrizni)');
    }

    // ══════ 12. Transaction isolation level ══════
    console.log('\n━━━ [12] Transaction isolation level ━━━');
    const isoResult = await client.query('SHOW default_transaction_isolation');
    console.log(`  Default isolation: ${isoResult.rows[0].default_transaction_isolation}`);

    const readOnlyResult = await client.query('SHOW default_transaction_read_only');
    console.log(`  Default read_only: ${readOnlyResult.rows[0].default_transaction_read_only} ${readOnlyResult.rows[0].default_transaction_read_only === 'on' ? '⚠️ READ-ONLY!' : '✅'}`);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║     DIAGNOSZTIKA KÉSZ                                   ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

  } finally {
    client.release();
    await pool.end();
  }
}

// ========== MAIN ==========
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  🔒 BIZTONSÁGOS DB DIAGNOSZTIKA                        ║');
  console.log('║  Az URL NEM kerül fájlba, logba, Git-be.               ║');
  console.log('║  Másold be az adatbázis URL-t és nyomj Enter-t.        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Formátum: postgresql://user:password@host:port/database');
  console.log('');

  const dbUrl = await secureReadLine('🔑 DATABASE_URL: ');

  if (!dbUrl || !dbUrl.startsWith('postgres')) {
    console.error('❌ Érvénytelen URL! Kell hogy "postgres://" vagy "postgresql://" -vel kezdődjön.');
    process.exit(1);
  }

  try {
    await runDiagnostics(dbUrl);
  } catch (err: any) {
    console.error('\n❌ HIBA:', err.message);
    if (err.message.includes('ECONNREFUSED')) {
      console.error('   → Nem érhető el az adatbázis szerver. Ellenőrizd a host/port-ot.');
    }
    if (err.message.includes('password authentication')) {
      console.error('   → Hibás jelszó. Ellenőrizd a DATABASE_URL-t.');
    }
    if (err.message.includes('SSL')) {
      console.error('   → SSL hiba. Próbáld ?sslmode=require végződéssel az URL-ben.');
    }
    process.exit(1);
  }
}

main();
