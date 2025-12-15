import cron from "node-cron";
import { storage } from "./storage";

/**
 * Cleanup old applied improved files (older than 7 days)
 * Runs daily at midnight
 */
export function setupCleanupImprovedFiles() {
  // Run daily at midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    try {
      console.log('[CLEANUP-IMPROVED] 🕒 Running scheduled cleanup of old applied improved files...');
      
      const deletedCount = await storage.cleanupOldAppliedImprovedFiles();
      
      if (deletedCount > 0) {
        console.log(`[CLEANUP-IMPROVED] ✅ Deleted ${deletedCount} old applied improved files`);
      } else {
        console.log('[CLEANUP-IMPROVED] ℹ️  No old applied improved files to delete');
      }
    } catch (error: any) {
      console.error('[CLEANUP-IMPROVED] ❌ Error during cleanup:', error);
    }
  });

  console.log('[CLEANUP-IMPROVED] ✅ Scheduled cleanup job started (daily at 00:00)');
  console.log('[CLEANUP-IMPROVED] ♻️  Retention: 7 days for applied improved files');
}

