import { sqlite } from './db';

// Initialize SQLite database tables
export function initializeDatabase() {
  console.log('[DB INIT] Creating database tables...');
  
  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');
  
  // Create tables
  const tables = [
    // System prompts
    `CREATE TABLE IF NOT EXISTS system_prompts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    
    // Users
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT,
      first_name TEXT,
      last_name TEXT,
      profile_image_url TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_banned INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`,
    
    // HTML files
    `CREATE TABLE IF NOT EXISTS html_files (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      description TEXT,
      classroom INTEGER NOT NULL DEFAULT 1,
      content_type TEXT NOT NULL DEFAULT 'html',
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    
    // Email subscriptions
    `CREATE TABLE IF NOT EXISTS email_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT NOT NULL UNIQUE,
      classrooms TEXT NOT NULL DEFAULT '[1]',
      is_subscribed INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    
    // Extra email addresses
    `CREATE TABLE IF NOT EXISTS extra_email_addresses (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      classrooms TEXT NOT NULL DEFAULT '[1]',
      added_by TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    
    // Email logs
    `CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      html_file_id TEXT,
      recipient_email TEXT NOT NULL,
      status TEXT NOT NULL,
      resend_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL
    )`,
    
    // AI generation requests
    `CREATE TABLE IF NOT EXISTS ai_generation_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      prompt TEXT NOT NULL,
      generated_content TEXT,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL
    )`,
    
    // Push subscriptions
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT,
      endpoint TEXT NOT NULL UNIQUE,
      keys TEXT NOT NULL,
      user_agent TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    
    // Backups
    `CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL
    )`,
    
    // Material views
    `CREATE TABLE IF NOT EXISTS material_views (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      material_id TEXT NOT NULL,
      viewed_at TEXT NOT NULL,
      user_agent TEXT
    )`,
    
    // Tags
    `CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT,
      created_at TEXT NOT NULL
    )`,
    
    // Material tags
    `CREATE TABLE IF NOT EXISTS material_tags (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(material_id, tag_id)
    )`,
    
    // Material stats
    `CREATE TABLE IF NOT EXISTS material_stats (
      material_id TEXT PRIMARY KEY,
      total_views INTEGER NOT NULL DEFAULT 0,
      unique_viewers INTEGER NOT NULL DEFAULT 0,
      total_likes INTEGER NOT NULL DEFAULT 0,
      average_rating REAL DEFAULT 0,
      last_viewed_at TEXT,
      updated_at TEXT NOT NULL
    )`,
    
    // Material likes
    `CREATE TABLE IF NOT EXISTS material_likes (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      user_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(material_id, fingerprint)
    )`,
    
    // Material ratings
    `CREATE TABLE IF NOT EXISTS material_ratings (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      user_id TEXT,
      created_at TEXT NOT NULL
    )`,
    
    // Scheduled jobs
    `CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`,
    
    // Material comments
    `CREATE TABLE IF NOT EXISTS material_comments (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_email TEXT NOT NULL,
      body TEXT NOT NULL,
      is_approved INTEGER NOT NULL DEFAULT 0,
      user_id TEXT,
      created_at TEXT NOT NULL,
      approved_at TEXT,
      approved_by TEXT
    )`,
    
    // Weekly email reports
    `CREATE TABLE IF NOT EXISTS weekly_email_reports (
      id TEXT PRIMARY KEY,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      report_type TEXT NOT NULL,
      metrics TEXT NOT NULL,
      sent_at TEXT NOT NULL
    )`,
  ];
  
  // Create indexes
  const indexes = [
    // html_files indexes
    'CREATE INDEX IF NOT EXISTS html_files_classroom_idx ON html_files(classroom)',
    'CREATE INDEX IF NOT EXISTS html_files_created_at_idx ON html_files(created_at)',
    'CREATE INDEX IF NOT EXISTS html_files_classroom_created_idx ON html_files(classroom, created_at)',
    
    // material_views indexes
    'CREATE INDEX IF NOT EXISTS material_views_material_idx ON material_views(material_id)',
    'CREATE INDEX IF NOT EXISTS material_views_user_idx ON material_views(user_id)',
    'CREATE INDEX IF NOT EXISTS material_views_viewed_at_idx ON material_views(viewed_at)',
    
    // material_tags indexes
    'CREATE INDEX IF NOT EXISTS material_tags_material_idx ON material_tags(material_id)',
    'CREATE INDEX IF NOT EXISTS material_tags_tag_idx ON material_tags(tag_id)',
    
    // material_likes indexes
    'CREATE INDEX IF NOT EXISTS material_likes_material_idx ON material_likes(material_id)',
    'CREATE INDEX IF NOT EXISTS material_likes_fingerprint_idx ON material_likes(fingerprint)',
    
    // material_ratings indexes
    'CREATE INDEX IF NOT EXISTS material_ratings_material_idx ON material_ratings(material_id)',
    'CREATE INDEX IF NOT EXISTS material_ratings_fingerprint_idx ON material_ratings(fingerprint)',
    
    // scheduled_jobs indexes
    'CREATE INDEX IF NOT EXISTS scheduled_jobs_status_idx ON scheduled_jobs(status)',
    'CREATE INDEX IF NOT EXISTS scheduled_jobs_scheduled_for_idx ON scheduled_jobs(scheduled_for)',
    
    // material_comments indexes
    'CREATE INDEX IF NOT EXISTS material_comments_material_idx ON material_comments(material_id)',
    'CREATE INDEX IF NOT EXISTS material_comments_approved_idx ON material_comments(is_approved)',
    'CREATE INDEX IF NOT EXISTS material_comments_created_at_idx ON material_comments(created_at)',
    'CREATE INDEX IF NOT EXISTS material_comments_material_created_idx ON material_comments(material_id, created_at)',
  ];
  
  try {
    // Create all tables
    tables.forEach(sql => {
      sqlite.exec(sql);
    });
    console.log('[DB INIT] ✅ Tables created successfully');
    
    // Create all indexes
    indexes.forEach(sql => {
      sqlite.exec(sql);
    });
    console.log('[DB INIT] ✅ Indexes created successfully');
    
    console.log('[DB INIT] ✅ Database initialization complete');
  } catch (error) {
    console.error('[DB INIT] ❌ Error initializing database:', error);
    throw error;
  }
}
