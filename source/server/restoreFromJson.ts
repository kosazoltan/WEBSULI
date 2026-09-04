import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from "./lib/logger";

const dbPath = path.join(process.cwd(), 'sqlite.db');
const backupPath = path.join(process.cwd(), 'neon-backup.json');

logger.info('[RESTORE] Starting data restore from neon-backup.json');
logger.info('[RESTORE] Database:', dbPath);
logger.info('[RESTORE] Backup file:', backupPath);

// Read backup file
const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
logger.info('[RESTORE] Backup loaded:', Object.keys(backupData).length, 'tables');

// Initialize database
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

try {
  // Begin transaction
  logger.info('[RESTORE] Starting transaction...');
  db.exec('BEGIN TRANSACTION');

  // 1. Clear existing data (in reverse dependency order)
  logger.info('[RESTORE] Clearing existing data...');
  db.exec('DELETE FROM email_logs');
  db.exec('DELETE FROM material_likes');
  db.exec('DELETE FROM material_stats');
  db.exec('DELETE FROM material_views');
  db.exec('DELETE FROM backups');
  db.exec('DELETE FROM system_prompts');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM html_files');
  db.exec('DELETE FROM extra_email_addresses');
  db.exec('DELETE FROM email_subscriptions');
  db.exec('DELETE FROM users');
  
  logger.info('[RESTORE] Existing data cleared');

  // 2. Restore users
  const users = backupData.users || [];
  logger.info(`[RESTORE] Restoring ${users.length} users...`);
  const insertUser = db.prepare(`
    INSERT INTO users (id, email, last_seen_at, created_at)
    VALUES (?, ?, ?, ?)
  `);
  
  for (const user of users) {
    insertUser.run(
      user.id,
      user.email || null,
      user.last_seen_at || user.lastSeenAt,
      user.created_at || user.createdAt
    );
  }

  // 3. Restore html_files (materials)
  const htmlFiles = backupData.htmlFiles || backupData.html_files || [];
  logger.info(`[RESTORE] Restoring ${htmlFiles.length} materials...`);
  const insertHtmlFile = db.prepare(`
    INSERT INTO html_files (id, user_id, title, content, description, classroom, content_type, display_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const file of htmlFiles) {
    insertHtmlFile.run(
      file.id,
      file.user_id || file.userId,
      file.title,
      file.content,
      file.description || null,
      file.classroom || 1,
      file.content_type || file.contentType || 'html',
      0, // displayOrder = 0 (no manual order, use createdAt)
      file.created_at || file.createdAt
    );
  }

  // 4. Restore email_subscriptions
  const emailSubscriptions = backupData.emailSubscriptions || backupData.email_subscriptions || [];
  logger.info(`[RESTORE] Restoring ${emailSubscriptions.length} email subscriptions...`);
  const insertEmailSubscription = db.prepare(`
    INSERT INTO email_subscriptions (user_id, classrooms, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  
  for (const sub of emailSubscriptions) {
    insertEmailSubscription.run(
      sub.user_id || sub.userId,
      JSON.stringify(sub.classrooms || []),
      sub.created_at || sub.createdAt,
      sub.updated_at || sub.updatedAt || sub.created_at || sub.createdAt
    );
  }

  // 5. Restore extra_email_addresses
  const extraEmails = backupData.extraEmails || backupData.extra_emails || backupData.extraEmailAddresses || backupData.extra_email_addresses || [];
  logger.info(`[RESTORE] Restoring ${extraEmails.length} extra emails...`);
  const insertExtraEmail = db.prepare(`
    INSERT INTO extra_email_addresses (id, email, classrooms, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  for (const email of extraEmails) {
    const createdAt = email.created_at || email.createdAt;
    insertExtraEmail.run(
      email.id,
      email.email,
      JSON.stringify(email.classrooms || []),
      createdAt,
      email.updated_at || email.updatedAt || createdAt
    );
  }

  // 6. Restore material_views
  const materialViews = backupData.materialViews || backupData.material_views || [];
  logger.info(`[RESTORE] Restoring ${materialViews.length} material views...`);
  const insertMaterialView = db.prepare(`
    INSERT INTO material_views (id, material_id, user_id, viewed_at, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  for (const view of materialViews) {
    insertMaterialView.run(
      view.id,
      view.material_id || view.materialId,
      view.user_id || view.userId || null,
      view.viewed_at || view.viewedAt,
      view.user_agent || view.userAgent || null
    );
  }

  // 7. Restore backups
  const backups = backupData.backups || [];
  logger.info(`[RESTORE] Restoring ${backups.length} backups...`);
  const insertBackup = db.prepare(`
    INSERT INTO backups (id, name, created_at, data)
    VALUES (?, ?, ?, ?)
  `);
  
  for (const backup of backups) {
    insertBackup.run(
      backup.id,
      backup.name || 'Neon Backup',
      backup.created_at || backup.createdAt,
      typeof backup.data === 'string' ? backup.data : JSON.stringify(backup.data)
    );
  }

  // 8. Restore tags
  const tags = backupData.tags || [];
  logger.info(`[RESTORE] Restoring ${tags.length} tags...`);
  const insertTag = db.prepare(`
    INSERT INTO tags (id, name, description, color, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  for (const tag of tags) {
    insertTag.run(
      tag.id,
      tag.name,
      tag.description || null,
      tag.color || null,
      tag.created_at || tag.createdAt
    );
  }

  // 9. Restore system_prompts
  const systemPrompts = backupData.systemPrompts || backupData.system_prompts || [];
  logger.info(`[RESTORE] Restoring ${systemPrompts.length} system prompts...`);
  const insertSystemPrompt = db.prepare(`
    INSERT INTO system_prompts (id, name, prompt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  for (const prompt of systemPrompts) {
    insertSystemPrompt.run(
      prompt.id,
      prompt.name,
      prompt.prompt,
      prompt.created_at || prompt.createdAt,
      prompt.updated_at || prompt.updatedAt || prompt.created_at || prompt.createdAt
    );
  }

  // 10. Restore email_logs
  const emailLogs = backupData.emailLogs || backupData.email_logs || [];
  logger.info(`[RESTORE] Restoring ${emailLogs.length} email logs...`);
  const insertEmailLog = db.prepare(`
    INSERT INTO email_logs (id, html_file_id, recipient_email, status, error, resend_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const log of emailLogs) {
    insertEmailLog.run(
      log.id,
      log.html_file_id || log.htmlFileId || null,
      log.recipient_email || log.recipientEmail,
      log.status,
      log.error || null,
      log.resend_id || log.resendId || null,
      log.created_at || log.createdAt
    );
  }

  // Commit transaction
  db.exec('COMMIT');
  logger.info('[RESTORE] ✅ Transaction committed successfully!');

  // Verify results
  const counts = {
    users: db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number },
    htmlFiles: db.prepare('SELECT COUNT(*) as count FROM html_files').get() as { count: number },
    materialViews: db.prepare('SELECT COUNT(*) as count FROM material_views').get() as { count: number },
    tags: db.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number },
    systemPrompts: db.prepare('SELECT COUNT(*) as count FROM system_prompts').get() as { count: number },
    backups: db.prepare('SELECT COUNT(*) as count FROM backups').get() as { count: number },
    emailLogs: db.prepare('SELECT COUNT(*) as count FROM email_logs').get() as { count: number },
  };

  logger.info('\n[RESTORE] ✅ DATA RESTORE COMPLETE!');
  logger.info('[RESTORE] Final counts:');
  logger.info(`  - Users: ${counts.users.count}`);
  logger.info(`  - Materials (html_files): ${counts.htmlFiles.count}`);
  logger.info(`  - Material views: ${counts.materialViews.count}`);
  logger.info(`  - Tags: ${counts.tags.count}`);
  logger.info(`  - System prompts: ${counts.systemPrompts.count}`);
  logger.info(`  - Backups: ${counts.backups.count}`);
  logger.info(`  - Email logs: ${counts.emailLogs.count}`);
  
  // Verify specific materials exist
  const sampleMaterials = db.prepare('SELECT id, title, classroom FROM html_files LIMIT 5').all();
  logger.info('\n[RESTORE] Sample materials:');
  for (const mat of sampleMaterials) {
    const m = mat as { title: string; classroom: string };
    logger.info(`  - ${m.title} (Classroom: ${m.classroom})`);
  }

} catch (error) {
  logger.error('[RESTORE] ❌ Error during restore:', error);
  db.exec('ROLLBACK');
  logger.error('[RESTORE] Transaction rolled back');
  process.exit(1);
} finally {
  db.close();
}

logger.info('\n[RESTORE] Database connection closed');
process.exit(0);
