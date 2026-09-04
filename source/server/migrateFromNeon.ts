import { Client } from 'pg';
import Database from 'better-sqlite3';
import fs from 'fs';
import { logger } from "./lib/logger";

// Neon PostgreSQL connection
const neonClient = new Client({
  connectionString: process.env.DATABASE_URL,
});

// SQLite database
const sqlite = new Database('./sqlite.db');

/** PostgreSQL timestamp as pg hands it over. */
type NeonTimestamp = string | number | Date;

interface NeonHtmlFile { id: string; user_id: string | null; title: string; content: string; description: string | null; classroom: number; created_at: NeonTimestamp | null; updated_at: NeonTimestamp | null; }
interface NeonUser { id: string; email: string; hashed_password: string | null; first_name: string | null; last_name: string | null; created_at: NeonTimestamp | null; updated_at: NeonTimestamp | null; last_seen_at: NeonTimestamp | null; is_banned: boolean; is_admin: boolean; }
interface NeonEmailSubscription { id: string; user_id: string | null; email: string; classrooms: unknown; is_subscribed: boolean; created_at: NeonTimestamp | null; updated_at: NeonTimestamp | null; }
interface NeonExtraEmailAddress { id: string; email: string; classrooms: unknown; added_by: string | null; is_active: boolean; created_at: NeonTimestamp | null; updated_at: NeonTimestamp | null; }
interface NeonEmailLog { id: string; html_file_id: string | null; recipient_email: string; subject: string; status: string; error_message: string | null; created_at: NeonTimestamp | null; }
interface NeonAiGenerationRequest { id: string; user_id: string | null; provider: string; model: string; prompt: string; response: string; created_at: NeonTimestamp | null; }
interface NeonBackup { id: string; filename: string; size: number; created_at: NeonTimestamp | null; }
interface NeonMaterialView { id: string; user_id: string | null; material_id: string; viewed_at: NeonTimestamp | null; user_agent: string | null; }
interface NeonPushSubscription { id: string; user_id: string | null; email: string | null; endpoint: string; keys: unknown; created_at: NeonTimestamp | null; updated_at: NeonTimestamp | null; }
interface NeonTag { id: string; name: string; created_at: NeonTimestamp | null; }
interface NeonMaterialTag { id: string; material_id: string; tag_id: string; }
interface NeonMaterialStat { id: string; material_id: string; view_count: number; like_count: number; comment_count: number; average_rating: number; last_updated: NeonTimestamp | null; }
interface NeonMaterialLike { id: string; material_id: string; user_id: string | null; created_at: NeonTimestamp | null; }
interface NeonMaterialRating { id: string; material_id: string; user_id: string | null; rating: number; created_at: NeonTimestamp | null; }
interface NeonMaterialComment { id: string; material_id: string; user_id: string | null; content: string; created_at: NeonTimestamp | null; updated_at: NeonTimestamp | null; }
interface NeonScheduledJob { id: string; job_type: string; scheduled_for: NeonTimestamp | null; status: string; executed_at: NeonTimestamp | null; error_message: string | null; created_at: NeonTimestamp | null; }
interface NeonWeeklyEmailReport { id: string; week_start: NeonTimestamp | null; week_end: NeonTimestamp | null; total_materials: number; total_views: number; sent_at: NeonTimestamp | null; created_at: NeonTimestamp | null; }
interface NeonSystemPrompt { id: string; name: string; prompt: string; description: string | null; is_active: boolean; created_at: NeonTimestamp | null; updated_at: NeonTimestamp | null; }

interface NeonData {
  htmlFiles: NeonHtmlFile[];
  users: NeonUser[];
  emailSubscriptions: NeonEmailSubscription[];
  extraEmailAddresses: NeonExtraEmailAddress[];
  emailLogs: NeonEmailLog[];
  aiGenerationRequests: NeonAiGenerationRequest[];
  backups: NeonBackup[];
  materialViews: NeonMaterialView[];
  pushSubscriptions: NeonPushSubscription[];
  tags: NeonTag[];
  materialTags: NeonMaterialTag[];
  materialStats: NeonMaterialStat[];
  materialLikes: NeonMaterialLike[];
  materialRatings: NeonMaterialRating[];
  materialComments: NeonMaterialComment[];
  scheduledJobs: NeonScheduledJob[];
  weeklyEmailReports: NeonWeeklyEmailReport[];
  systemPrompts: NeonSystemPrompt[];
}

async function exportFromNeon(): Promise<NeonData> {
  logger.info('🔌 Connecting to Neon PostgreSQL...');
  await neonClient.connect();
  
  const data: NeonData = {
    htmlFiles: [],
    users: [],
    emailSubscriptions: [],
    extraEmailAddresses: [],
    emailLogs: [],
    aiGenerationRequests: [],
    backups: [],
    materialViews: [],
    pushSubscriptions: [],
    tags: [],
    materialTags: [],
    materialStats: [],
    materialLikes: [],
    materialRatings: [],
    materialComments: [],
    scheduledJobs: [],
    weeklyEmailReports: [],
    systemPrompts: [],
  };

  logger.info('📦 Exporting htmlFiles...');
  const htmlFilesRes = await neonClient.query('SELECT * FROM html_files ORDER BY created_at ASC');
  data.htmlFiles = htmlFilesRes.rows;
  logger.info(`   ✅ ${data.htmlFiles.length} materials exported`);

  logger.info('📦 Exporting users...');
  const usersRes = await neonClient.query('SELECT * FROM users ORDER BY created_at ASC');
  data.users = usersRes.rows;
  logger.info(`   ✅ ${data.users.length} users exported`);

  logger.info('📦 Exporting emailSubscriptions...');
  const emailSubsRes = await neonClient.query('SELECT * FROM email_subscriptions ORDER BY created_at ASC');
  data.emailSubscriptions = emailSubsRes.rows;
  logger.info(`   ✅ ${data.emailSubscriptions.length} email subscriptions exported`);

  logger.info('📦 Exporting extraEmailAddresses...');
  const extraEmailsRes = await neonClient.query('SELECT * FROM extra_email_addresses ORDER BY created_at ASC');
  data.extraEmailAddresses = extraEmailsRes.rows;
  logger.info(`   ✅ ${data.extraEmailAddresses.length} extra emails exported`);

  logger.info('📦 Exporting emailLogs...');
  const emailLogsRes = await neonClient.query('SELECT * FROM email_logs ORDER BY created_at ASC');
  data.emailLogs = emailLogsRes.rows;
  logger.info(`   ✅ ${data.emailLogs.length} email logs exported`);

  logger.info('📦 Exporting aiGenerationRequests...');
  const aiReqRes = await neonClient.query('SELECT * FROM ai_generation_requests ORDER BY created_at ASC');
  data.aiGenerationRequests = aiReqRes.rows;
  logger.info(`   ✅ ${data.aiGenerationRequests.length} AI requests exported`);

  logger.info('📦 Exporting backups...');
  const backupsRes = await neonClient.query('SELECT * FROM backups ORDER BY created_at ASC');
  data.backups = backupsRes.rows;
  logger.info(`   ✅ ${data.backups.length} backups exported`);

  logger.info('📦 Exporting materialViews...');
  const viewsRes = await neonClient.query('SELECT * FROM material_views ORDER BY viewed_at ASC');
  data.materialViews = viewsRes.rows;
  logger.info(`   ✅ ${data.materialViews.length} material views exported`);

  logger.info('📦 Exporting pushSubscriptions...');
  const pushSubsRes = await neonClient.query('SELECT * FROM push_subscriptions ORDER BY created_at ASC');
  data.pushSubscriptions = pushSubsRes.rows;
  logger.info(`   ✅ ${data.pushSubscriptions.length} push subscriptions exported`);

  logger.info('📦 Exporting tags...');
  const tagsRes = await neonClient.query('SELECT * FROM tags ORDER BY created_at ASC');
  data.tags = tagsRes.rows;
  logger.info(`   ✅ ${data.tags.length} tags exported`);

  logger.info('📦 Exporting materialTags...');
  const matTagsRes = await neonClient.query('SELECT * FROM material_tags ORDER BY id ASC');
  data.materialTags = matTagsRes.rows;
  logger.info(`   ✅ ${data.materialTags.length} material tags exported`);

  logger.info('📦 Exporting materialStats...');
  const statsRes = await neonClient.query('SELECT * FROM material_stats ORDER BY material_id ASC');
  data.materialStats = statsRes.rows;
  logger.info(`   ✅ ${data.materialStats.length} material stats exported`);

  logger.info('📦 Exporting materialLikes...');
  const likesRes = await neonClient.query('SELECT * FROM material_likes ORDER BY created_at ASC');
  data.materialLikes = likesRes.rows;
  logger.info(`   ✅ ${data.materialLikes.length} material likes exported`);

  logger.info('📦 Exporting materialRatings...');
  const ratingsRes = await neonClient.query('SELECT * FROM material_ratings ORDER BY created_at ASC');
  data.materialRatings = ratingsRes.rows;
  logger.info(`   ✅ ${data.materialRatings.length} material ratings exported`);

  logger.info('📦 Exporting materialComments...');
  const commentsRes = await neonClient.query('SELECT * FROM material_comments ORDER BY created_at ASC');
  data.materialComments = commentsRes.rows;
  logger.info(`   ✅ ${data.materialComments.length} material comments exported`);

  logger.info('📦 Exporting scheduledJobs...');
  const jobsRes = await neonClient.query('SELECT * FROM scheduled_jobs ORDER BY created_at ASC');
  data.scheduledJobs = jobsRes.rows;
  logger.info(`   ✅ ${data.scheduledJobs.length} scheduled jobs exported`);

  logger.info('📦 Exporting weeklyEmailReports...');
  try {
    const reportsRes = await neonClient.query('SELECT * FROM weekly_email_reports ORDER BY created_at ASC');
    data.weeklyEmailReports = reportsRes.rows;
    logger.info(`   ✅ ${data.weeklyEmailReports.length} weekly reports exported`);
  } catch {
    logger.info(`   ⚠️  Table weekly_email_reports not found, skipping...`);
    data.weeklyEmailReports = [];
  }

  logger.info('📦 Exporting systemPrompts...');
  const promptsRes = await neonClient.query('SELECT * FROM system_prompts ORDER BY created_at ASC');
  data.systemPrompts = promptsRes.rows;
  logger.info(`   ✅ ${data.systemPrompts.length} system prompts exported`);

  await neonClient.end();
  logger.info('✅ Neon export complete!\n');
  
  return data;
}

function convertToSQLite(data: NeonData) {
  logger.info('🔄 Converting data to SQLite format...');
  
  // Convert PostgreSQL snake_case and arrays to SQLite camelCase and JSON
  const converted = {
    htmlFiles: data.htmlFiles.map((f) => ({
      id: f.id,
      userId: f.user_id,
      title: f.title,
      content: f.content,
      description: f.description,
      classroom: f.classroom,
      createdAt: f.created_at ? new Date(f.created_at).toISOString() : new Date().toISOString(),
      updatedAt: f.updated_at ? new Date(f.updated_at).toISOString() : null,
    })),
    users: data.users.map((u) => ({
      id: u.id,
      email: u.email,
      hashedPassword: u.hashed_password,
      firstName: u.first_name,
      lastName: u.last_name,
      createdAt: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString(),
      updatedAt: u.updated_at ? new Date(u.updated_at).toISOString() : null,
      lastSeenAt: u.last_seen_at ? new Date(u.last_seen_at).toISOString() : null,
      isBanned: u.is_banned,
      isAdmin: u.is_admin,
    })),
    emailSubscriptions: data.emailSubscriptions.map((e) => ({
      id: e.id,
      userId: e.user_id,
      email: e.email,
      classrooms: JSON.stringify(e.classrooms || [1]),
      isSubscribed: e.is_subscribed,
      createdAt: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(),
      updatedAt: e.updated_at ? new Date(e.updated_at).toISOString() : null,
    })),
    extraEmailAddresses: data.extraEmailAddresses.map((e) => ({
      id: e.id,
      email: e.email,
      classrooms: JSON.stringify(e.classrooms || [1]),
      addedBy: e.added_by,
      isActive: e.is_active,
      createdAt: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(),
      updatedAt: e.updated_at ? new Date(e.updated_at).toISOString() : null,
    })),
    emailLogs: data.emailLogs.map((l) => ({
      id: l.id,
      htmlFileId: l.html_file_id,
      recipientEmail: l.recipient_email,
      subject: l.subject,
      status: l.status,
      errorMessage: l.error_message,
      createdAt: l.created_at ? new Date(l.created_at).toISOString() : new Date().toISOString(),
    })),
    aiGenerationRequests: data.aiGenerationRequests.map((a) => ({
      id: a.id,
      userId: a.user_id,
      provider: a.provider,
      model: a.model,
      prompt: a.prompt,
      response: a.response,
      createdAt: a.created_at ? new Date(a.created_at).toISOString() : new Date().toISOString(),
    })),
    backups: data.backups.map((b) => ({
      id: b.id,
      filename: b.filename,
      size: b.size,
      createdAt: b.created_at ? new Date(b.created_at).toISOString() : new Date().toISOString(),
    })),
    materialViews: data.materialViews.map((v) => ({
      id: v.id,
      userId: v.user_id,
      materialId: v.material_id,
      viewedAt: v.viewed_at ? new Date(v.viewed_at).toISOString() : new Date().toISOString(),
      userAgent: v.user_agent,
    })),
    pushSubscriptions: data.pushSubscriptions.map((p) => ({
      id: p.id,
      userId: p.user_id,
      email: p.email,
      endpoint: p.endpoint,
      keys: JSON.stringify(p.keys || { p256dh: '', auth: '' }),
      createdAt: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
      updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : null,
    })),
    tags: data.tags.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(),
    })),
    materialTags: data.materialTags.map((mt) => ({
      id: mt.id,
      materialId: mt.material_id,
      tagId: mt.tag_id,
    })),
    materialStats: data.materialStats.map((s) => ({
      id: s.id,
      materialId: s.material_id,
      viewCount: s.view_count,
      likeCount: s.like_count,
      commentCount: s.comment_count,
      averageRating: s.average_rating,
      lastUpdated: s.last_updated ? new Date(s.last_updated).toISOString() : new Date().toISOString(),
    })),
    materialLikes: data.materialLikes.map((l) => ({
      id: l.id,
      materialId: l.material_id,
      userId: l.user_id,
      createdAt: l.created_at ? new Date(l.created_at).toISOString() : new Date().toISOString(),
    })),
    materialRatings: data.materialRatings.map((r) => ({
      id: r.id,
      materialId: r.material_id,
      userId: r.user_id,
      rating: r.rating,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    })),
    materialComments: data.materialComments.map((c) => ({
      id: c.id,
      materialId: c.material_id,
      userId: c.user_id,
      content: c.content,
      createdAt: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
      updatedAt: c.updated_at ? new Date(c.updated_at).toISOString() : null,
    })),
    scheduledJobs: data.scheduledJobs.map((j) => ({
      id: j.id,
      jobType: j.job_type,
      scheduledFor: j.scheduled_for ? new Date(j.scheduled_for).toISOString() : new Date().toISOString(),
      status: j.status,
      executedAt: j.executed_at ? new Date(j.executed_at).toISOString() : null,
      errorMessage: j.error_message,
      createdAt: j.created_at ? new Date(j.created_at).toISOString() : new Date().toISOString(),
    })),
    weeklyEmailReports: data.weeklyEmailReports.map((w) => ({
      id: w.id,
      weekStart: w.week_start ? new Date(w.week_start).toISOString() : new Date().toISOString(),
      weekEnd: w.week_end ? new Date(w.week_end).toISOString() : new Date().toISOString(),
      totalMaterials: w.total_materials,
      totalViews: w.total_views,
      sentAt: w.sent_at ? new Date(w.sent_at).toISOString() : null,
      createdAt: w.created_at ? new Date(w.created_at).toISOString() : new Date().toISOString(),
    })),
    systemPrompts: data.systemPrompts.map((p) => ({
      id: p.id,
      name: p.name,
      prompt: p.prompt,
      description: p.description,
      isActive: p.is_active,
      createdAt: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
      updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : new Date().toISOString(),
    })),
  };
  
  logger.info('✅ Data converted to SQLite format!\n');
  return converted;
}

async function importToSQLite(data: ReturnType<typeof convertToSQLite>) {
  logger.info('📥 Importing data to SQLite...');
  
  // Clear existing test data first
  logger.info('🗑️  Clearing existing test data...');
  sqlite.exec('DELETE FROM html_files');
  sqlite.exec('DELETE FROM users');
  sqlite.exec('DELETE FROM email_subscriptions');
  sqlite.exec('DELETE FROM extra_email_addresses');
  sqlite.exec('DELETE FROM email_logs');
  sqlite.exec('DELETE FROM ai_generation_requests');
  sqlite.exec('DELETE FROM backups');
  sqlite.exec('DELETE FROM material_views');
  sqlite.exec('DELETE FROM push_subscriptions');
  sqlite.exec('DELETE FROM tags');
  sqlite.exec('DELETE FROM material_tags');
  sqlite.exec('DELETE FROM material_stats');
  sqlite.exec('DELETE FROM material_likes');
  sqlite.exec('DELETE FROM material_ratings');
  sqlite.exec('DELETE FROM material_comments');
  sqlite.exec('DELETE FROM scheduled_jobs');
  sqlite.exec('DELETE FROM weekly_email_reports');
  sqlite.exec('DELETE FROM system_prompts');
  logger.info('   ✅ Test data cleared\n');

  // Import htmlFiles
  logger.info('📦 Importing htmlFiles...');
  const insertFile = sqlite.prepare(`
    INSERT INTO html_files (id, user_id, title, content, description, classroom, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const file of data.htmlFiles) {
    insertFile.run(
      file.id,
      file.userId,
      file.title,
      file.content,
      file.description,
      file.classroom,
      file.createdAt
    );
  }
  logger.info(`   ✅ ${data.htmlFiles.length} materials imported`);

  // Import users
  logger.info('📦 Importing users...');
  const insertUser = sqlite.prepare(`
    INSERT INTO users (id, email, password, first_name, last_name, created_at, updated_at, last_seen_at, is_banned, is_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const user of data.users) {
    insertUser.run(
      user.id,
      user.email,
      user.hashedPassword, // Maps to 'password' column in SQLite
      user.firstName,
      user.lastName,
      user.createdAt,
      user.updatedAt,
      user.lastSeenAt,
      user.isBanned ? 1 : 0,
      user.isAdmin ? 1 : 0
    );
  }
  logger.info(`   ✅ ${data.users.length} users imported`);

  // Import emailSubscriptions
  logger.info('📦 Importing emailSubscriptions...');
  const insertEmailSub = sqlite.prepare(`
    INSERT INTO email_subscriptions (id, user_id, email, classrooms, is_subscribed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const sub of data.emailSubscriptions) {
    insertEmailSub.run(
      sub.id,
      sub.userId,
      sub.email,
      sub.classrooms,
      sub.isSubscribed ? 1 : 0,
      sub.createdAt,
      sub.updatedAt
    );
  }
  logger.info(`   ✅ ${data.emailSubscriptions.length} email subscriptions imported`);

  // Import extraEmailAddresses
  logger.info('📦 Importing extraEmailAddresses...');
  const insertExtraEmail = sqlite.prepare(`
    INSERT INTO extra_email_addresses (id, email, classrooms, added_by, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const extra of data.extraEmailAddresses) {
    insertExtraEmail.run(
      extra.id,
      extra.email,
      extra.classrooms,
      extra.addedBy,
      extra.isActive ? 1 : 0,
      extra.createdAt,
      extra.updatedAt
    );
  }
  logger.info(`   ✅ ${data.extraEmailAddresses.length} extra emails imported`);

  // Import remaining tables
  logger.info('📦 Importing emailLogs...');
  for (const log of data.emailLogs) {
    sqlite.prepare(`
      INSERT INTO email_logs (id, html_file_id, recipient_email, status, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(log.id, log.htmlFileId, log.recipientEmail, log.status, log.errorMessage, log.createdAt);
  }
  logger.info(`   ✅ ${data.emailLogs.length} email logs imported`);

  logger.info('📦 Importing aiGenerationRequests...');
  for (const req of data.aiGenerationRequests) {
    sqlite.prepare(`
      INSERT INTO ai_generation_requests (id, user_id, prompt, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.id, req.userId, req.prompt || '', 'completed', req.createdAt);
  }
  logger.info(`   ✅ ${data.aiGenerationRequests.length} AI requests imported`);

  logger.info('📦 Importing materialViews...');
  for (const view of data.materialViews) {
    sqlite.prepare(`
      INSERT INTO material_views (id, user_id, material_id, viewed_at, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `).run(view.id, view.userId, view.materialId, view.viewedAt, view.userAgent);
  }
  logger.info(`   ✅ ${data.materialViews.length} material views imported`);

  logger.info('📦 Importing pushSubscriptions...');
  for (const push of data.pushSubscriptions) {
    sqlite.prepare(`
      INSERT INTO push_subscriptions (id, user_id, email, endpoint, keys, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(push.id, push.userId, push.email, push.endpoint, push.keys, push.createdAt, push.updatedAt);
  }
  logger.info(`   ✅ ${data.pushSubscriptions.length} push subscriptions imported`);

  logger.info('📦 Importing systemPrompts...');
  for (const prompt of data.systemPrompts) {
    sqlite.prepare(`
      INSERT INTO system_prompts (id, name, prompt, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(prompt.id, prompt.name, prompt.prompt, prompt.description, prompt.isActive ? 1 : 0, prompt.createdAt, prompt.updatedAt);
  }
  logger.info(`   ✅ ${data.systemPrompts.length} system prompts imported`);

  logger.info('✅ All data imported to SQLite!\n');
}

async function migrate() {
  try {
    logger.info('🚀 Starting Neon → SQLite migration...\n');
    
    const neonData = await exportFromNeon();
    
    // Save backup
    const backupPath = './neon-backup.json';
    fs.writeFileSync(backupPath, JSON.stringify(neonData, null, 2));
    logger.info(`💾 Backup saved to: ${backupPath}\n`);
    
    const sqliteData = convertToSQLite(neonData);
    await importToSQLite(sqliteData);
    
    logger.info('🎉 Migration complete!');
    logger.info('\n📊 Summary:');
    logger.info(`   Materials: ${sqliteData.htmlFiles.length}`);
    logger.info(`   Users: ${sqliteData.users.length}`);
    logger.info(`   Email Subscriptions: ${sqliteData.emailSubscriptions.length}`);
    logger.info(`   Material Views: ${sqliteData.materialViews.length}`);
    logger.info(`   Total records migrated: ${
      sqliteData.htmlFiles.length +
      sqliteData.users.length +
      sqliteData.emailSubscriptions.length +
      sqliteData.extraEmailAddresses.length +
      sqliteData.emailLogs.length +
      sqliteData.aiGenerationRequests.length +
      sqliteData.materialViews.length +
      sqliteData.pushSubscriptions.length
    }`);
    
    sqlite.close();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
