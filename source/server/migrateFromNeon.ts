import { Client } from 'pg';
import Database from 'better-sqlite3';
import fs from 'fs';

// Neon PostgreSQL connection
const neonClient = new Client({
  connectionString: process.env.DATABASE_URL,
});

// SQLite database
const sqlite = new Database('./sqlite.db');

interface NeonData {
  htmlFiles: any[];
  users: any[];
  emailSubscriptions: any[];
  extraEmailAddresses: any[];
  emailLogs: any[];
  aiGenerationRequests: any[];
  backups: any[];
  materialViews: any[];
  pushSubscriptions: any[];
  tags: any[];
  materialTags: any[];
  materialStats: any[];
  materialLikes: any[];
  materialRatings: any[];
  materialComments: any[];
  scheduledJobs: any[];
  weeklyEmailReports: any[];
  systemPrompts: any[];
}

async function exportFromNeon(): Promise<NeonData> {
  console.log('🔌 Connecting to Neon PostgreSQL...');
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

  console.log('📦 Exporting htmlFiles...');
  const htmlFilesRes = await neonClient.query('SELECT * FROM html_files ORDER BY created_at ASC');
  data.htmlFiles = htmlFilesRes.rows;
  console.log(`   ✅ ${data.htmlFiles.length} materials exported`);

  console.log('📦 Exporting users...');
  const usersRes = await neonClient.query('SELECT * FROM users ORDER BY created_at ASC');
  data.users = usersRes.rows;
  console.log(`   ✅ ${data.users.length} users exported`);

  console.log('📦 Exporting emailSubscriptions...');
  const emailSubsRes = await neonClient.query('SELECT * FROM email_subscriptions ORDER BY created_at ASC');
  data.emailSubscriptions = emailSubsRes.rows;
  console.log(`   ✅ ${data.emailSubscriptions.length} email subscriptions exported`);

  console.log('📦 Exporting extraEmailAddresses...');
  const extraEmailsRes = await neonClient.query('SELECT * FROM extra_email_addresses ORDER BY created_at ASC');
  data.extraEmailAddresses = extraEmailsRes.rows;
  console.log(`   ✅ ${data.extraEmailAddresses.length} extra emails exported`);

  console.log('📦 Exporting emailLogs...');
  const emailLogsRes = await neonClient.query('SELECT * FROM email_logs ORDER BY created_at ASC');
  data.emailLogs = emailLogsRes.rows;
  console.log(`   ✅ ${data.emailLogs.length} email logs exported`);

  console.log('📦 Exporting aiGenerationRequests...');
  const aiReqRes = await neonClient.query('SELECT * FROM ai_generation_requests ORDER BY created_at ASC');
  data.aiGenerationRequests = aiReqRes.rows;
  console.log(`   ✅ ${data.aiGenerationRequests.length} AI requests exported`);

  console.log('📦 Exporting backups...');
  const backupsRes = await neonClient.query('SELECT * FROM backups ORDER BY created_at ASC');
  data.backups = backupsRes.rows;
  console.log(`   ✅ ${data.backups.length} backups exported`);

  console.log('📦 Exporting materialViews...');
  const viewsRes = await neonClient.query('SELECT * FROM material_views ORDER BY viewed_at ASC');
  data.materialViews = viewsRes.rows;
  console.log(`   ✅ ${data.materialViews.length} material views exported`);

  console.log('📦 Exporting pushSubscriptions...');
  const pushSubsRes = await neonClient.query('SELECT * FROM push_subscriptions ORDER BY created_at ASC');
  data.pushSubscriptions = pushSubsRes.rows;
  console.log(`   ✅ ${data.pushSubscriptions.length} push subscriptions exported`);

  console.log('📦 Exporting tags...');
  const tagsRes = await neonClient.query('SELECT * FROM tags ORDER BY created_at ASC');
  data.tags = tagsRes.rows;
  console.log(`   ✅ ${data.tags.length} tags exported`);

  console.log('📦 Exporting materialTags...');
  const matTagsRes = await neonClient.query('SELECT * FROM material_tags ORDER BY id ASC');
  data.materialTags = matTagsRes.rows;
  console.log(`   ✅ ${data.materialTags.length} material tags exported`);

  console.log('📦 Exporting materialStats...');
  const statsRes = await neonClient.query('SELECT * FROM material_stats ORDER BY material_id ASC');
  data.materialStats = statsRes.rows;
  console.log(`   ✅ ${data.materialStats.length} material stats exported`);

  console.log('📦 Exporting materialLikes...');
  const likesRes = await neonClient.query('SELECT * FROM material_likes ORDER BY created_at ASC');
  data.materialLikes = likesRes.rows;
  console.log(`   ✅ ${data.materialLikes.length} material likes exported`);

  console.log('📦 Exporting materialRatings...');
  const ratingsRes = await neonClient.query('SELECT * FROM material_ratings ORDER BY created_at ASC');
  data.materialRatings = ratingsRes.rows;
  console.log(`   ✅ ${data.materialRatings.length} material ratings exported`);

  console.log('📦 Exporting materialComments...');
  const commentsRes = await neonClient.query('SELECT * FROM material_comments ORDER BY created_at ASC');
  data.materialComments = commentsRes.rows;
  console.log(`   ✅ ${data.materialComments.length} material comments exported`);

  console.log('📦 Exporting scheduledJobs...');
  const jobsRes = await neonClient.query('SELECT * FROM scheduled_jobs ORDER BY created_at ASC');
  data.scheduledJobs = jobsRes.rows;
  console.log(`   ✅ ${data.scheduledJobs.length} scheduled jobs exported`);

  console.log('📦 Exporting weeklyEmailReports...');
  try {
    const reportsRes = await neonClient.query('SELECT * FROM weekly_email_reports ORDER BY created_at ASC');
    data.weeklyEmailReports = reportsRes.rows;
    console.log(`   ✅ ${data.weeklyEmailReports.length} weekly reports exported`);
  } catch (err: any) {
    console.log(`   ⚠️  Table weekly_email_reports not found, skipping...`);
    data.weeklyEmailReports = [];
  }

  console.log('📦 Exporting systemPrompts...');
  const promptsRes = await neonClient.query('SELECT * FROM system_prompts ORDER BY created_at ASC');
  data.systemPrompts = promptsRes.rows;
  console.log(`   ✅ ${data.systemPrompts.length} system prompts exported`);

  await neonClient.end();
  console.log('✅ Neon export complete!\n');
  
  return data;
}

function convertToSQLite(data: NeonData) {
  console.log('🔄 Converting data to SQLite format...');
  
  // Convert PostgreSQL snake_case and arrays to SQLite camelCase and JSON
  const converted = {
    htmlFiles: data.htmlFiles.map((f: any) => ({
      id: f.id,
      userId: f.user_id,
      title: f.title,
      content: f.content,
      description: f.description,
      classroom: f.classroom,
      createdAt: f.created_at ? new Date(f.created_at).toISOString() : new Date().toISOString(),
      updatedAt: f.updated_at ? new Date(f.updated_at).toISOString() : null,
    })),
    users: data.users.map((u: any) => ({
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
    emailSubscriptions: data.emailSubscriptions.map((e: any) => ({
      id: e.id,
      userId: e.user_id,
      email: e.email,
      classrooms: JSON.stringify(e.classrooms || [1]),
      isSubscribed: e.is_subscribed,
      createdAt: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(),
      updatedAt: e.updated_at ? new Date(e.updated_at).toISOString() : null,
    })),
    extraEmailAddresses: data.extraEmailAddresses.map((e: any) => ({
      id: e.id,
      email: e.email,
      classrooms: JSON.stringify(e.classrooms || [1]),
      addedBy: e.added_by,
      isActive: e.is_active,
      createdAt: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(),
      updatedAt: e.updated_at ? new Date(e.updated_at).toISOString() : null,
    })),
    emailLogs: data.emailLogs.map((l: any) => ({
      id: l.id,
      htmlFileId: l.html_file_id,
      recipientEmail: l.recipient_email,
      subject: l.subject,
      status: l.status,
      errorMessage: l.error_message,
      createdAt: l.created_at ? new Date(l.created_at).toISOString() : new Date().toISOString(),
    })),
    aiGenerationRequests: data.aiGenerationRequests.map((a: any) => ({
      id: a.id,
      userId: a.user_id,
      provider: a.provider,
      model: a.model,
      prompt: a.prompt,
      response: a.response,
      createdAt: a.created_at ? new Date(a.created_at).toISOString() : new Date().toISOString(),
    })),
    backups: data.backups.map((b: any) => ({
      id: b.id,
      filename: b.filename,
      size: b.size,
      createdAt: b.created_at ? new Date(b.created_at).toISOString() : new Date().toISOString(),
    })),
    materialViews: data.materialViews.map((v: any) => ({
      id: v.id,
      userId: v.user_id,
      materialId: v.material_id,
      viewedAt: v.viewed_at ? new Date(v.viewed_at).toISOString() : new Date().toISOString(),
      userAgent: v.user_agent,
    })),
    pushSubscriptions: data.pushSubscriptions.map((p: any) => ({
      id: p.id,
      userId: p.user_id,
      email: p.email,
      endpoint: p.endpoint,
      keys: JSON.stringify(p.keys || { p256dh: '', auth: '' }),
      createdAt: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
      updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : null,
    })),
    tags: data.tags.map((t: any) => ({
      id: t.id,
      name: t.name,
      createdAt: t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString(),
    })),
    materialTags: data.materialTags.map((mt: any) => ({
      id: mt.id,
      materialId: mt.material_id,
      tagId: mt.tag_id,
    })),
    materialStats: data.materialStats.map((s: any) => ({
      id: s.id,
      materialId: s.material_id,
      viewCount: s.view_count,
      likeCount: s.like_count,
      commentCount: s.comment_count,
      averageRating: s.average_rating,
      lastUpdated: s.last_updated ? new Date(s.last_updated).toISOString() : new Date().toISOString(),
    })),
    materialLikes: data.materialLikes.map((l: any) => ({
      id: l.id,
      materialId: l.material_id,
      userId: l.user_id,
      createdAt: l.created_at ? new Date(l.created_at).toISOString() : new Date().toISOString(),
    })),
    materialRatings: data.materialRatings.map((r: any) => ({
      id: r.id,
      materialId: r.material_id,
      userId: r.user_id,
      rating: r.rating,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    })),
    materialComments: data.materialComments.map((c: any) => ({
      id: c.id,
      materialId: c.material_id,
      userId: c.user_id,
      content: c.content,
      createdAt: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
      updatedAt: c.updated_at ? new Date(c.updated_at).toISOString() : null,
    })),
    scheduledJobs: data.scheduledJobs.map((j: any) => ({
      id: j.id,
      jobType: j.job_type,
      scheduledFor: j.scheduled_for ? new Date(j.scheduled_for).toISOString() : new Date().toISOString(),
      status: j.status,
      executedAt: j.executed_at ? new Date(j.executed_at).toISOString() : null,
      errorMessage: j.error_message,
      createdAt: j.created_at ? new Date(j.created_at).toISOString() : new Date().toISOString(),
    })),
    weeklyEmailReports: data.weeklyEmailReports.map((w: any) => ({
      id: w.id,
      weekStart: w.week_start ? new Date(w.week_start).toISOString() : new Date().toISOString(),
      weekEnd: w.week_end ? new Date(w.week_end).toISOString() : new Date().toISOString(),
      totalMaterials: w.total_materials,
      totalViews: w.total_views,
      sentAt: w.sent_at ? new Date(w.sent_at).toISOString() : null,
      createdAt: w.created_at ? new Date(w.created_at).toISOString() : new Date().toISOString(),
    })),
    systemPrompts: data.systemPrompts.map((p: any) => ({
      id: p.id,
      name: p.name,
      prompt: p.prompt,
      description: p.description,
      isActive: p.is_active,
      createdAt: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
      updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : new Date().toISOString(),
    })),
  };
  
  console.log('✅ Data converted to SQLite format!\n');
  return converted;
}

async function importToSQLite(data: any) {
  console.log('📥 Importing data to SQLite...');
  
  // Clear existing test data first
  console.log('🗑️  Clearing existing test data...');
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
  console.log('   ✅ Test data cleared\n');

  // Import htmlFiles
  console.log('📦 Importing htmlFiles...');
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
  console.log(`   ✅ ${data.htmlFiles.length} materials imported`);

  // Import users
  console.log('📦 Importing users...');
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
  console.log(`   ✅ ${data.users.length} users imported`);

  // Import emailSubscriptions
  console.log('📦 Importing emailSubscriptions...');
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
  console.log(`   ✅ ${data.emailSubscriptions.length} email subscriptions imported`);

  // Import extraEmailAddresses
  console.log('📦 Importing extraEmailAddresses...');
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
  console.log(`   ✅ ${data.extraEmailAddresses.length} extra emails imported`);

  // Import remaining tables
  console.log('📦 Importing emailLogs...');
  for (const log of data.emailLogs) {
    sqlite.prepare(`
      INSERT INTO email_logs (id, html_file_id, recipient_email, status, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(log.id, log.htmlFileId, log.recipientEmail, log.status, log.errorMessage, log.createdAt);
  }
  console.log(`   ✅ ${data.emailLogs.length} email logs imported`);

  console.log('📦 Importing aiGenerationRequests...');
  for (const req of data.aiGenerationRequests) {
    sqlite.prepare(`
      INSERT INTO ai_generation_requests (id, user_id, prompt, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.id, req.userId, req.prompt || '', 'completed', req.createdAt);
  }
  console.log(`   ✅ ${data.aiGenerationRequests.length} AI requests imported`);

  console.log('📦 Importing materialViews...');
  for (const view of data.materialViews) {
    sqlite.prepare(`
      INSERT INTO material_views (id, user_id, material_id, viewed_at, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `).run(view.id, view.userId, view.materialId, view.viewedAt, view.userAgent);
  }
  console.log(`   ✅ ${data.materialViews.length} material views imported`);

  console.log('📦 Importing pushSubscriptions...');
  for (const push of data.pushSubscriptions) {
    sqlite.prepare(`
      INSERT INTO push_subscriptions (id, user_id, email, endpoint, keys, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(push.id, push.userId, push.email, push.endpoint, push.keys, push.createdAt, push.updatedAt);
  }
  console.log(`   ✅ ${data.pushSubscriptions.length} push subscriptions imported`);

  console.log('📦 Importing systemPrompts...');
  for (const prompt of data.systemPrompts) {
    sqlite.prepare(`
      INSERT INTO system_prompts (id, name, prompt, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(prompt.id, prompt.name, prompt.prompt, prompt.description, prompt.isActive ? 1 : 0, prompt.createdAt, prompt.updatedAt);
  }
  console.log(`   ✅ ${data.systemPrompts.length} system prompts imported`);

  console.log('✅ All data imported to SQLite!\n');
}

async function migrate() {
  try {
    console.log('🚀 Starting Neon → SQLite migration...\n');
    
    const neonData = await exportFromNeon();
    
    // Save backup
    const backupPath = './neon-backup.json';
    fs.writeFileSync(backupPath, JSON.stringify(neonData, null, 2));
    console.log(`💾 Backup saved to: ${backupPath}\n`);
    
    const sqliteData = convertToSQLite(neonData);
    await importToSQLite(sqliteData);
    
    console.log('🎉 Migration complete!');
    console.log('\n📊 Summary:');
    console.log(`   Materials: ${sqliteData.htmlFiles.length}`);
    console.log(`   Users: ${sqliteData.users.length}`);
    console.log(`   Email Subscriptions: ${sqliteData.emailSubscriptions.length}`);
    console.log(`   Material Views: ${sqliteData.materialViews.length}`);
    console.log(`   Total records migrated: ${
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
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
