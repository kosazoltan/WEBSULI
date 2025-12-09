import cron from 'node-cron';
import { storage } from './storage';
import fs from 'fs/promises'; // Async file I/O
import fsSync from 'fs'; // For synchronous operations where needed
import path from 'path';

// Backup configuration
const BACKUP_DIR = path.join(process.cwd(), 'backups');

/**
 * SECURITY: Sanitize filename to prevent path traversal attacks
 * Only allows alphanumeric characters, hyphens, underscores, and dots
 * Blocks directory traversal patterns (.. / \)
 */
function sanitizeBackupFilename(filename: string): string | null {
  // Block path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  // Only allow safe characters in backup filenames
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(filename)) {
    return null;
  }
  // Must be a .json file
  if (!filename.endsWith('.json')) {
    return null;
  }
  return filename;

}

/**
 * SECURITY: Get safe filepath within BACKUP_DIR
 * Returns null if filename is invalid or path would escape BACKUP_DIR
 */
function getSafeBackupPath(filename: string): string | null {
  const sanitized = sanitizeBackupFilename(filename);
  if (!sanitized) {
    return null;
  }
  const filepath = path.join(BACKUP_DIR, sanitized);
  // Double-check the resolved path is still within BACKUP_DIR
  if (!filepath.startsWith(BACKUP_DIR)) {
    return null;
  }
  return filepath;
}
const MAX_BACKUP_AGE_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const BACKUP_SCHEDULE = '0 2 * * *'; // Daily at 2:00 AM
const EVENT_BACKUP_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes

// Debounce state for event-driven backups
let lastEventBackupTime = 0;
let pendingEventBackup: NodeJS.Timeout | null = null;

// Ensure backup directory exists (synchronous on module load)
if (!fsSync.existsSync(BACKUP_DIR)) {
  fsSync.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log('[AUTO-BACKUP] Created backups directory:', BACKUP_DIR);
}

/**
 * Creates a timestamped JSON backup file
 * Format: backup_YYYYMMDD_HHMMSS.json
 */
export async function createAutoBackup(reason: 'scheduled' | 'event' | 'pre-restore' = 'scheduled'): Promise<string | null> {
  try {
    // SECURITY: timestamp and reason are both server-controlled, NOT user input
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `backup_${timestamp}_${reason}.json`;
    // nosemgrep: path-join-resolve-traversal
    const filepath = path.join(BACKUP_DIR, filename);

    // Get all data from database using storage snapshot export
    const snapshotData = await storage.exportBackupSnapshot();

    // Create backup object
    const backupData = {
      timestamp: new Date().toISOString(),
      reason,
      version: '1.0',
      data: snapshotData,
      stats: {
        htmlFiles: snapshotData.htmlFiles.length,
        users: snapshotData.users.length,
        extraEmails: snapshotData.extraEmails.length,
        materialViews: snapshotData.materialViews.length,
        emailSubscriptions: snapshotData.emailSubscriptions.length,
        tags: snapshotData.tags.length,
        systemPrompts: snapshotData.systemPrompts.length,
        emailLogs: snapshotData.emailLogs.length,
      }
    };

    // Write to file (async to avoid blocking event loop)
    await fs.writeFile(filepath, JSON.stringify(backupData, null, 2), 'utf-8');

    console.log(`[AUTO-BACKUP] ✅ Backup created: ${filename} (${snapshotData.htmlFiles.length} materials)`);

    // Clean old backups
    await cleanOldBackups();

    return filename;
  } catch (error) {
    console.error('[AUTO-BACKUP] ❌ Failed to create backup:', error);
    return null;
  }
}

/**
 * Deletes backups older than MAX_BACKUP_AGE_DAYS
 */
async function cleanOldBackups(): Promise<number> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = files.filter(f => f.startsWith('backup_') && f.endsWith('.json'));
    
    const now = Date.now();
    const maxAge = MAX_BACKUP_AGE_DAYS * 24 * 60 * 60 * 1000; // Convert days to ms
    
    let deletedCount = 0;

    for (const file of backupFiles) {
      // SECURITY: Use sanitized path even for readdir results
      const filepath = getSafeBackupPath(file);
      if (!filepath) {
        continue; // Skip invalid filenames
      }
      const stats = await fs.stat(filepath);
      const fileAge = now - stats.mtimeMs;

      if (fileAge > maxAge) {
        await fs.unlink(filepath);
        deletedCount++;
        console.log('[AUTO-BACKUP] 🗑️  Deleted old backup:', file);
      }
    }

    if (deletedCount > 0) {
      console.log('[AUTO-BACKUP] Cleaned', deletedCount, 'old backup(s)');
    }

    return deletedCount;
  } catch (error) {
    console.error('[AUTO-BACKUP] ❌ Failed to clean old backups:', error);
    return 0;
  }
}

/**
 * Lists all available backups
 */
export async function listBackups(): Promise<Array<{ filename: string; size: number; created: Date }>> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = files.filter(f => f.startsWith('backup_') && f.endsWith('.json'));

    const backupInfoPromises = backupFiles.map(async (file) => {
      // SECURITY: Use sanitized path even for readdir results
      const filepath = getSafeBackupPath(file);
      if (!filepath) {
        return null; // Skip invalid filenames
      }
      const stats = await fs.stat(filepath);
      return {
        filename: file,
        size: stats.size,
        created: stats.mtime,
      };
    });

    const backupInfos = (await Promise.all(backupInfoPromises)).filter(Boolean) as Array<{ filename: string; size: number; created: Date }>;
    return backupInfos.sort((a, b) => b.created.getTime() - a.created.getTime());
  } catch (error) {
    console.error('[AUTO-BACKUP] ❌ Failed to list backups:', error);
    return [];
  }
}

/**
 * Reads a specific backup file
 */
export async function readBackup(filename: string): Promise<any | null> {
  try {
    // SECURITY: Use sanitized path helper to prevent path traversal
    const filepath = getSafeBackupPath(filename);
    if (!filepath) {
      console.error('[AUTO-BACKUP] ❌ Invalid filename rejected:', String(filename).substring(0, 50));
      return null;
    }
    
    try {
      await fs.access(filepath);
    } catch {
      console.error('[AUTO-BACKUP] ❌ Backup not found:', String(filename).substring(0, 50));
      return null;
    }

    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[AUTO-BACKUP] ❌ Failed to read backup:', error);
    return null;
  }
}

/**
 * Debounced event-driven backup
 * Prevents backup spam during rapid CRUD operations
 */
export function triggerEventBackup() {
  const now = Date.now();
  
  // If a backup was created recently, schedule a debounced backup
  if (now - lastEventBackupTime < EVENT_BACKUP_DEBOUNCE_MS) {
    // Clear existing pending backup
    if (pendingEventBackup) {
      clearTimeout(pendingEventBackup);
    }
    
    // Schedule new backup after debounce period
    pendingEventBackup = setTimeout(async () => {
      await createAutoBackup('event');
      lastEventBackupTime = Date.now();
      pendingEventBackup = null;
    }, EVENT_BACKUP_DEBOUNCE_MS - (now - lastEventBackupTime));
    
    console.log('[AUTO-BACKUP] 📅 Event backup scheduled (debounced)');
  } else {
    // Create backup immediately
    createAutoBackup('event').then(() => {
      lastEventBackupTime = Date.now();
    });
  }
}

/**
 * Start scheduled backup job
 */
export function startAutoBackupJob() {
  // Daily backup at 2:00 AM
  cron.schedule(BACKUP_SCHEDULE, async () => {
    console.log('[AUTO-BACKUP] 🕒 Running scheduled daily backup...');
    await createAutoBackup('scheduled');
  });

  console.log(`[AUTO-BACKUP] ✅ Scheduled backup job started (daily at 02:00)`);
  console.log(`[AUTO-BACKUP] 📁 Backup directory: ${BACKUP_DIR}`);
  console.log(`[AUTO-BACKUP] ♻️  Retention: ${MAX_BACKUP_AGE_DAYS} days`);

  // Create initial backup on startup
  setTimeout(async () => {
    console.log('[AUTO-BACKUP] Creating initial backup on startup...');
    await createAutoBackup('scheduled');
  }, 5000); // 5 second delay to ensure DB is ready
}
