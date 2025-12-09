import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "../shared/schema";


// ========== DATABASE IDENTITY VALIDATION ==========
const isUsingProductionAsDev = false;

// CRITICAL: Prevent production data wipe when DATABASE_URL/DEV_DATABASE_URL are swapped

interface DatabaseIdentity {
  databaseName: string;
  host: string;
  confidence: 'production' | 'dev' | 'unknown';
  reason: string;
  materialsCount: number;
}

async function validateDatabaseIdentity(
  connectionUrl: string,
  expectedType: 'production' | 'dev'
): Promise<DatabaseIdentity> {
  // Parse connection string to extract database name and host (NO CREDENTIALS LOGGING!)
  // Format: postgresql://user:password@host/database_name?params
  const urlMatch = connectionUrl.match(/postgresql:\/\/[^@]+@([^/]+)\/([^?]+)/);

  if (!urlMatch) {
    throw new Error(`Invalid PostgreSQL connection URL format`);
  }

  const [, host, databaseName] = urlMatch;

  // Query actual database name from PostgreSQL
  const sql = neon(connectionUrl);
  const db = drizzle(sql, { schema });

  const result = await sql`SELECT current_database() as dbname`;
  const actualDbName = result[0]?.dbname as string;

  // Count materials efficiently (SELECT COUNT(*) instead of loading all rows)
  const countResult = await sql`SELECT COUNT(*)::int as count FROM html_files`;
  const materialsCount = (countResult[0]?.count as number) || 0;

  // Determine confidence based on multiple signals
  let confidence: 'production' | 'dev' | 'unknown' = 'unknown';
  let reason = '';

  // Signal 1: Database name contains explicit markers (PRIMARY SIGNAL)
  const lowerDbName = (actualDbName || databaseName || '').toLowerCase();
  const hasProdMarker = /prod|production|main/.test(lowerDbName);
  const hasDevMarker = /dev|development|test|staging/.test(lowerDbName);

  // Configurable threshold for materials count heuristic (fallback only)
  // Default: 10 (conservative - allows smaller production datasets)
  // Set SYNC_PROD_MATERIALS_THRESHOLD=50 for larger production datasets
  const materialsThreshold = parseInt(process.env.SYNC_PROD_MATERIALS_THRESHOLD || '10', 10);

  if (expectedType === 'production') {
    if (hasProdMarker && !hasDevMarker) {
      // Clear production marker in database name
      confidence = 'production';
      reason = `Database name "${actualDbName}" contains production marker`;
    } else if (hasDevMarker) {
      // Clear dev marker when expecting production → MISMATCH!
      confidence = 'dev';
      reason = `Database name "${actualDbName}" contains dev marker (MISMATCHED!)`;
    } else if (materialsCount >= materialsThreshold) {
      // Fallback: Use materials count heuristic (configurable threshold)
      confidence = 'production';
      reason = `Database has ${materialsCount} materials (≥${materialsThreshold} threshold, likely production, but no name marker)`;
    } else {
      // No clear signals - unknown confidence
      confidence = 'unknown';
      reason = `Database "${actualDbName}" has no production/dev marker and ${materialsCount} materials (<${materialsThreshold} threshold)`;
    }
  } else {
    if (hasDevMarker && !hasProdMarker) {
      // Clear dev marker in database name
      confidence = 'dev';
      reason = `Database name "${actualDbName}" contains dev marker`;
    } else if (hasProdMarker) {
      // Clear production marker when expecting dev → MISMATCH!
      confidence = 'production';
      reason = `Database name "${actualDbName}" contains production marker (MISMATCHED!)`;
    } else if (materialsCount === 0) {
      // Empty database likely dev (but not guaranteed)
      confidence = 'dev';
      reason = `Database is empty (likely dev, but no name marker)`;
    } else {
      // No clear signals - unknown confidence
      confidence = 'unknown';
      reason = `Database "${actualDbName}" has no production/dev marker and ${materialsCount} materials (ambiguous)`;
    }
  }

  return {
    databaseName: actualDbName || databaseName,
    host,
    confidence,
    reason,
    materialsCount
  };
}

// Clear dev database before sync (correct FK order: children → parents)
async function clearDevDatabase(devDb: any) {
  console.log('🗑️ Clearing dev database (FK order: children → parents)...\n');

  // CRITICAL: Truncate children BEFORE parents to respect FK constraints
  // Level 1: Deepest children (depend on html_files + others)
  await devDb.execute('TRUNCATE TABLE material_tags CASCADE');
  await devDb.execute('TRUNCATE TABLE material_ratings CASCADE');
  await devDb.execute('TRUNCATE TABLE material_comments CASCADE');
  await devDb.execute('TRUNCATE TABLE material_stats CASCADE');
  await devDb.execute('TRUNCATE TABLE material_likes CASCADE');
  await devDb.execute('TRUNCATE TABLE material_views CASCADE');
  await devDb.execute('TRUNCATE TABLE email_logs CASCADE');

  // Level 2: Mid-level children (depend on html_files or users)
  await devDb.execute('TRUNCATE TABLE email_subscriptions CASCADE');
  await devDb.execute('TRUNCATE TABLE extra_email_addresses CASCADE');

  // Level 3: Independent tables (no FK dependencies)
  await devDb.execute('TRUNCATE TABLE tags CASCADE');
  await devDb.execute('TRUNCATE TABLE backups CASCADE');
  await devDb.execute('TRUNCATE TABLE system_prompts CASCADE');

  // Level 4: Parent tables (html_files has FK to users)
  await devDb.execute('TRUNCATE TABLE html_files CASCADE');

  // Level 5: Root parent (users is root of FK tree)
  await devDb.execute('TRUNCATE TABLE users CASCADE');

  console.log('✅ Dev database cleared (all tables empty)\n');
}

export async function copyProductionToDev() {
  // ========== STEP 0: SAFETY CHECK - DISABLE IF USING PRODUCTION AS DEV ==========
  if (isUsingProductionAsDev) {
    const errorMsg =
      '🚫 PRODUCTION→DEV SYNC DISABLED: DEV_DATABASE_URL not configured\n\n' +
      '⚠️  Currently using DATABASE_URL (production) for development.\n' +
      '⚠️  Sync feature disabled to prevent accidental production data wipe.\n\n' +
      '🔧 TO ENABLE SYNC:\n' +
      '1. Create a separate dev database in Neon Console (e.g., "anyagok-dev")\n' +
      '2. Set DEV_DATABASE_URL secret to point to the dev database\n' +
      '3. Restart application\n' +
      '4. Try sync again';

    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log('🔄 Starting production → dev data copy...\n');

  // ========== STEP 1: VALIDATE DATABASE IDENTITIES (PREVENT PRODUCTION WIPE) ==========
  console.log('🔍 Validating database identities...\n');

  const prodIdentity = await validateDatabaseIdentity(process.env.DATABASE_URL!, 'production');
  const devIdentity = await validateDatabaseIdentity(process.env.DEV_DATABASE_URL!, 'dev');

  console.log('📊 DATABASE VALIDATION RESULTS:');
  console.log('─'.repeat(80));
  console.log(`\n[DATABASE_URL] Expected: PRODUCTION`);
  console.log(`  Database: ${prodIdentity.databaseName}`);
  console.log(`  Host: ${prodIdentity.host}`);
  console.log(`  Materials: ${prodIdentity.materialsCount}`);
  console.log(`  Confidence: ${prodIdentity.confidence.toUpperCase()}`);
  console.log(`  Reason: ${prodIdentity.reason}`);

  console.log(`\n[DEV_DATABASE_URL] Expected: DEV`);
  console.log(`  Database: ${devIdentity.databaseName}`);
  console.log(`  Host: ${devIdentity.host}`);
  console.log(`  Materials: ${devIdentity.materialsCount}`);
  console.log(`  Confidence: ${devIdentity.confidence.toUpperCase()}`);
  console.log(`  Reason: ${devIdentity.reason}`);
  console.log('─'.repeat(80) + '\n');

  // ========== STEP 2: CRITICAL SAFETY CHECK - SAME DATABASE DETECTION ==========
  const isSameDatabase = (
    prodIdentity.host === devIdentity.host &&
    prodIdentity.databaseName === devIdentity.databaseName
  );

  if (isSameDatabase) {
    const errorMsg =
      '🚨 CRITICAL SAFETY ERROR: DATABASE_URL and DEV_DATABASE_URL point to the SAME database!\n\n' +
      `Both URLs target: ${prodIdentity.host}/${prodIdentity.databaseName}\n\n` +
      '⚠️  This would cause PRODUCTION DATA WIPE when clearing dev database!\n\n' +
      '🛑 SYNC OPERATION ABORTED to protect your data.\n\n' +
      '🔧 REQUIRED ACTION - Choose ONE of the following:\n\n' +
      'OPTION 1 (RECOMMENDED): Create separate dev database in Neon\n' +
      '  1. Go to Neon Console: https://console.neon.tech\n' +
      '  2. Create new database named "anyagok-dev"\n' +
      '  3. Update DEV_DATABASE_URL secret with new database URL\n' +
      '  4. Redeploy and try sync again\n\n' +
      'OPTION 2: Use different database names in existing Neon project\n' +
      '  1. Rename current database to "anyagok-prod"\n' +
      '  2. Create new database "anyagok-dev"\n' +
      '  3. Update both DATABASE_URL and DEV_DATABASE_URL secrets\n' +
      '  4. Redeploy and try sync again\n\n' +
      'Current configuration:\n' +
      `  DATABASE_URL: ${prodIdentity.databaseName} @ ${prodIdentity.host}\n` +
      `  DEV_DATABASE_URL: ${devIdentity.databaseName} @ ${devIdentity.host}\n` +
      `  Materials count: ${prodIdentity.materialsCount}`;

    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log('✅ Database safety check PASSED - Databases are separate\n');

  // ========== STEP 3: ABORT IF DATABASES APPEAR SWAPPED ==========
  const isSwapped = prodIdentity.confidence === 'dev' && devIdentity.confidence === 'production';
  const isProdUnsafe = prodIdentity.confidence !== 'production';
  const isDevUnsafe = devIdentity.confidence !== 'dev';

  if (isSwapped) {
    const errorMsg =
      '🚨 CRITICAL ERROR: DATABASE_URL and DEV_DATABASE_URL appear to be SWAPPED!\n\n' +
      `DATABASE_URL appears to be DEV (${prodIdentity.materialsCount} materials)\n` +
      `DEV_DATABASE_URL appears to be PRODUCTION (${devIdentity.materialsCount} materials)\n\n` +
      '⚠️  ABORTING to prevent production data wipe!\n\n' +
      '🔧 FIX: Swap the values of DATABASE_URL and DEV_DATABASE_URL in your deployment secrets:\n' +
      `   - DATABASE_URL should point to: ${devIdentity.databaseName} (${devIdentity.materialsCount} materials)\n` +
      `   - DEV_DATABASE_URL should point to: ${prodIdentity.databaseName} (${prodIdentity.materialsCount} materials)\n\n` +
      'Then REDEPLOY and try again.';

    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (isProdUnsafe || isDevUnsafe) {
    const warnings: string[] = [];

    if (isProdUnsafe) {
      warnings.push(
        `⚠️  DATABASE_URL confidence: ${prodIdentity.confidence} (expected: production)\n` +
        `   Reason: ${prodIdentity.reason}`
      );
    }

    if (isDevUnsafe) {
      warnings.push(
        `⚠️  DEV_DATABASE_URL confidence: ${devIdentity.confidence} (expected: dev)\n` +
        `   Reason: ${devIdentity.reason}`
      );
    }

    const errorMsg =
      '🚨 DATABASE IDENTITY VALIDATION FAILED!\n\n' +
      warnings.join('\n\n') +
      '\n\n⚠️  ABORTING sync to prevent accidental production data wipe!\n\n' +
      '🔧 RECOMMENDED ACTIONS:\n' +
      '1. Verify DATABASE_URL points to your PRODUCTION database\n' +
      '2. Verify DEV_DATABASE_URL points to your DEV database\n' +
      '3. Check database names contain "production"/"dev" markers for safety\n' +
      '4. If databases are correctly configured, add explicit markers to database names\n\n' +
      'Current state:\n' +
      `  DATABASE_URL: ${prodIdentity.databaseName} (${prodIdentity.materialsCount} materials)\n` +
      `  DEV_DATABASE_URL: ${devIdentity.databaseName} (${devIdentity.materialsCount} materials)`;

    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  console.log('✅ Database identity validation PASSED - Safe to proceed\n');
  console.log(`📋 Sync direction: ${prodIdentity.databaseName} (${prodIdentity.materialsCount} materials) → ${devIdentity.databaseName} (will be cleared)\n`);

  // Production database
  const prodSql = neon(process.env.DATABASE_URL!);
  const prodDb = drizzle(prodSql, { schema });

  // Dev database
  const devSql = neon(process.env.DEV_DATABASE_URL!);
  const devDb = drizzle(devSql, { schema });

  try {
    // CRITICAL: Clear dev database first to ensure true sync (not just inserts)
    await clearDevDatabase(devDb);

    // Copy in correct order (respecting foreign keys)

    // 1. Users (no dependencies)
    console.log('📋 Copying users...');
    const users = await prodDb.select().from(schema.users);
    if (users.length > 0) {
      await devDb.insert(schema.users).values(users).onConflictDoNothing();
      console.log(`✅ Copied ${users.length} users`);
    }

    // 2. System Prompts (no dependencies)
    console.log('📋 Copying system prompts...');
    const prompts = await prodDb.select().from(schema.systemPrompts);
    if (prompts.length > 0) {
      await devDb.insert(schema.systemPrompts).values(prompts).onConflictDoNothing();
      console.log(`✅ Copied ${prompts.length} system prompts`);
    }

    // 3. HTML Files (depends on users) - Fix orphaned user_id references
    console.log('📋 Copying materials...');
    const materials = await prodDb.select().from(schema.htmlFiles);
    const userIds = new Set(users.map(u => u.id));

    // Set userId to null if the referenced user doesn't exist
    const materialsFixed = materials.map(m => ({
      ...m,
      userId: m.userId && userIds.has(m.userId) ? m.userId : null
    }));

    if (materialsFixed.length > 0) {
      await devDb.insert(schema.htmlFiles).values(materialsFixed).onConflictDoNothing();
      console.log(`✅ Copied ${materialsFixed.length} materials`);
    }

    // 4. Email Subscriptions (depends on users)
    console.log('📋 Copying email subscriptions...');
    const emailSubs = await prodDb.select().from(schema.emailSubscriptions);
    const emailSubsFixed = emailSubs.map(s => ({
      ...s,
      userId: s.userId && userIds.has(s.userId) ? s.userId : null
    }));
    if (emailSubsFixed.length > 0) {
      await devDb.insert(schema.emailSubscriptions).values(emailSubsFixed).onConflictDoNothing();
      console.log(`✅ Copied ${emailSubsFixed.length} email subscriptions`);
    }

    // 5. Extra Emails (depends on users)
    console.log('📋 Copying extra emails...');
    const extraEmails = await prodDb.select().from(schema.extraEmailAddresses);
    const extraEmailsFixed = extraEmails.map(e => ({
      ...e,
      addedBy: e.addedBy && userIds.has(e.addedBy) ? e.addedBy : null
    }));
    if (extraEmailsFixed.length > 0) {
      await devDb.insert(schema.extraEmailAddresses).values(extraEmailsFixed).onConflictDoNothing();
      console.log(`✅ Copied ${extraEmailsFixed.length} extra emails`);
    }

    // 6. Material Views (depends on users + materials)
    console.log('📋 Copying material views...');
    const views = await prodDb.select().from(schema.materialViews);
    const materialIds = new Set(materialsFixed.map(m => m.id));
    const viewsFixed = views
      .filter(v => materialIds.has(v.materialId)) // Filter first to keep valid materials
      .map(v => ({
        ...v,
        userId: v.userId && userIds.has(v.userId) ? v.userId : null
      }));

    if (viewsFixed.length > 0) {
      await devDb.insert(schema.materialViews).values(viewsFixed).onConflictDoNothing();
      console.log(`✅ Copied ${viewsFixed.length} material views`);
    }

    // 7. Material Likes - SKIPPED (transient user data, not needed for dev testing)
    console.log('📋 Skipping material likes (transient user data)...');

    // 8. Email Logs (depends on materials)
    console.log('📋 Copying email logs...');
    const logs = await prodDb.select().from(schema.emailLogs);
    const logsFixed = logs.map(l => ({
      ...l,
      htmlFileId: l.htmlFileId && materialIds.has(l.htmlFileId) ? l.htmlFileId : null
    }));
    if (logsFixed.length > 0) {
      await devDb.insert(schema.emailLogs).values(logsFixed).onConflictDoNothing();
      console.log(`✅ Copied ${logsFixed.length} email logs`);
    }

    // 9. Tags (no dependencies)
    console.log('📋 Copying tags...');
    const tags = await prodDb.select().from(schema.tags);
    if (tags.length > 0) {
      await devDb.insert(schema.tags).values(tags).onConflictDoNothing();
      console.log(`✅ Copied ${tags.length} tags`);
    }

    // 10. Material Tags (junction table: materials ↔ tags)
    console.log('📋 Copying material↔tag relationships...');
    const materialTags = await prodDb.select().from(schema.materialTags);
    const tagIds = new Set(tags.map(t => t.id));
    const materialTagsFixed = materialTags.filter(mt =>
      materialIds.has(mt.materialId) && tagIds.has(mt.tagId)
    );
    if (materialTagsFixed.length > 0) {
      await devDb.insert(schema.materialTags).values(materialTagsFixed).onConflictDoNothing();
      console.log(`✅ Copied ${materialTagsFixed.length} material-tag relationships`);
    }

    // 11. Material Ratings (depends on materials + users)
    console.log('📋 Copying material ratings...');
    const ratings = await prodDb.select().from(schema.materialRatings);
    const ratingsFixed = ratings
      .map(r => ({
        ...r,
        userId: r.userId && userIds.has(r.userId) ? r.userId : null,
        materialId: materialIds.has(r.materialId) ? r.materialId : r.materialId
      }))
      .filter(r => materialIds.has(r.materialId)); // Only keep ratings with valid materialId

    if (ratingsFixed.length > 0) {
      await devDb.insert(schema.materialRatings).values(ratingsFixed).onConflictDoNothing();
      console.log(`✅ Copied ${ratingsFixed.length} material ratings`);
    }

    // 12. Material Comments (depends on materials + users)
    console.log('📋 Copying material comments...');
    const comments = await prodDb.select().from(schema.materialComments);
    const commentsFixed = comments
      .filter(c => materialIds.has(c.materialId)) // Filter first to keep valid materials
      .map(c => ({
        ...c,
        userId: c.userId && userIds.has(c.userId) ? c.userId : null,
        approvedBy: c.approvedBy && userIds.has(c.approvedBy) ? c.approvedBy : null
      }));

    if (commentsFixed.length > 0) {
      await devDb.insert(schema.materialComments).values(commentsFixed).onConflictDoNothing();
      console.log(`✅ Copied ${commentsFixed.length} material comments`);
    }

    // 13. Material Stats (depends on materials)
    console.log('📋 Copying material stats...');
    const stats = await prodDb.select().from(schema.materialStats);
    const statsFixed = stats.filter(s => materialIds.has(s.materialId));

    if (statsFixed.length > 0) {
      await devDb.insert(schema.materialStats).values(statsFixed).onConflictDoNothing();
      console.log(`✅ Copied ${statsFixed.length} material stats`);
    }

    // 14. Backups (no critical dependencies)
    console.log('📋 Copying backups...');
    const backups = await prodDb.select().from(schema.backups);
    if (backups.length > 0) {
      await devDb.insert(schema.backups).values(backups).onConflictDoNothing();
      console.log(`✅ Copied ${backups.length} backups`);
    }

    console.log('\n🎉 Production → Dev copy completed successfully!');

  } catch (error) {
    console.error('❌ Error during copy:', error);
    throw error;
  }
}

// Run as standalone script when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  copyProductionToDev().then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  }).catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  });
}
