import cron from "node-cron";
import { storage } from "./storage";
import { logger } from "./lib/logger";

/**
 * Cleanup old applied improved files (older than 7 days)
 * Runs daily at midnight
 */
export function setupCleanupImprovedFiles() {
  // Run daily at midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    try {
      logger.info('[CLEANUP-IMPROVED] 🕒 Running scheduled cleanup of old applied improved files...');
      
      const deletedCount = await storage.cleanupOldAppliedImprovedFiles();
      
      if (deletedCount > 0) {
        logger.info(`[CLEANUP-IMPROVED] ✅ Deleted ${deletedCount} old applied improved files`);
      } else {
        logger.info('[CLEANUP-IMPROVED] ℹ️  No old applied improved files to delete');
      }
    } catch (error: unknown) {
      logger.error('[CLEANUP-IMPROVED] ❌ Error during cleanup:', error);
    }
  });

  logger.info('[CLEANUP-IMPROVED] ✅ Scheduled cleanup job started (daily at 00:00)');
  logger.info('[CLEANUP-IMPROVED] ♻️  Retention: 7 days for applied improved files');
}

