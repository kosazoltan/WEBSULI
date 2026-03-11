/**
 * Run missing migration on production database
 * Creates: improved_html_files + material_improvement_backups tables
 */
import pg from 'pg';

const DATABASE_URL = process.argv[2] || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Usage: npx tsx runMigration.ts <DATABASE_URL>');
  process.exit(1);
}

async function main() {
  const masked = DATABASE_URL!.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  console.log(`Connecting to: ${masked.substring(0, 60)}...`);

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    console.log('✅ Connected!\n');

    // Check if tables already exist
    const existing = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename IN ('improved_html_files', 'material_improvement_backups')
    `);
    const existingTables = existing.rows.map(r => r.tablename);
    console.log('Existing tables:', existingTables.length ? existingTables.join(', ') : '(none)');

    if (existingTables.includes('improved_html_files') && existingTables.includes('material_improvement_backups')) {
      console.log('✅ Both tables already exist! No migration needed.');
      return;
    }

    console.log('\n🔧 Running migration...\n');

    // Run each statement separately (statement-breakpoint delimited)
    const statements = [
      // 1. Create improved_html_files
      `CREATE TABLE IF NOT EXISTS "improved_html_files" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "original_file_id" varchar NOT NULL,
        "title" text NOT NULL,
        "content" text NOT NULL,
        "description" text,
        "classroom" integer DEFAULT 1 NOT NULL,
        "content_type" varchar DEFAULT 'html' NOT NULL,
        "improvement_prompt" text,
        "improvement_notes" text,
        "status" varchar DEFAULT 'pending' NOT NULL,
        "created_by" varchar,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "applied_at" timestamp,
        "applied_by" varchar
      )`,

      // 2. Create material_improvement_backups
      `CREATE TABLE IF NOT EXISTS "material_improvement_backups" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "original_file_id" varchar NOT NULL,
        "improved_file_id" varchar,
        "backup_data" jsonb NOT NULL,
        "created_by" varchar,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "notes" text
      )`,

      // 3. Foreign keys for improved_html_files
      `ALTER TABLE "improved_html_files" ADD CONSTRAINT "improved_html_files_original_file_id_html_files_id_fk" 
        FOREIGN KEY ("original_file_id") REFERENCES "html_files"("id") ON DELETE CASCADE`,

      `ALTER TABLE "improved_html_files" ADD CONSTRAINT "improved_html_files_created_by_users_id_fk" 
        FOREIGN KEY ("created_by") REFERENCES "users"("id")`,

      `ALTER TABLE "improved_html_files" ADD CONSTRAINT "improved_html_files_applied_by_users_id_fk" 
        FOREIGN KEY ("applied_by") REFERENCES "users"("id")`,

      // 4. Foreign keys for material_improvement_backups
      `ALTER TABLE "material_improvement_backups" ADD CONSTRAINT "material_improvement_backups_original_file_id_html_files_id_fk" 
        FOREIGN KEY ("original_file_id") REFERENCES "html_files"("id") ON DELETE CASCADE`,

      `ALTER TABLE "material_improvement_backups" ADD CONSTRAINT "material_improvement_backups_improved_file_id_improved_html_files_id_fk" 
        FOREIGN KEY ("improved_file_id") REFERENCES "improved_html_files"("id") ON DELETE SET NULL`,

      `ALTER TABLE "material_improvement_backups" ADD CONSTRAINT "material_improvement_backups_created_by_users_id_fk" 
        FOREIGN KEY ("created_by") REFERENCES "users"("id")`,

      // 5. Indexes
      `CREATE INDEX IF NOT EXISTS "improved_html_files_original_file_idx" ON "improved_html_files"("original_file_id")`,
      `CREATE INDEX IF NOT EXISTS "improved_html_files_status_idx" ON "improved_html_files"("status")`,
      `CREATE INDEX IF NOT EXISTS "improved_html_files_created_at_idx" ON "improved_html_files"("created_at")`,
      `CREATE INDEX IF NOT EXISTS "improved_html_files_applied_at_idx" ON "improved_html_files"("applied_at")`,
      `CREATE INDEX IF NOT EXISTS "material_improvement_backups_original_file_idx" ON "material_improvement_backups"("original_file_id")`,
      `CREATE INDEX IF NOT EXISTS "material_improvement_backups_created_at_idx" ON "material_improvement_backups"("created_at")`,
    ];

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const label = stmt.substring(0, 60).replace(/\s+/g, ' ').trim();
      try {
        await client.query(stmt);
        console.log(`  ✅ [${i + 1}/${statements.length}] ${label}...`);
      } catch (err: any) {
        if (err.message.includes('already exists')) {
          console.log(`  ⚠️ [${i + 1}/${statements.length}] Already exists (OK): ${label}...`);
        } else {
          console.error(`  ❌ [${i + 1}/${statements.length}] FAILED: ${label}...`);
          console.error(`     Error: ${err.message}`);
          throw err;
        }
      }
    }

    // Verify
    console.log('\n🔍 Verifying...');
    const verify = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename IN ('improved_html_files', 'material_improvement_backups')
    `);
    console.log('Tables found:', verify.rows.map(r => r.tablename).join(', '));

    const colCount = await client.query(`
      SELECT count(*) as cnt FROM information_schema.columns 
      WHERE table_name = 'improved_html_files'
    `);
    console.log(`improved_html_files columns: ${colCount.rows[0].cnt}`);

    console.log('\n✅✅✅ MIGRÁCIÓ SIKERES! A production DB most már kész az AI improvement feature-re.');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  process.exit(1);
});
