import cron from "node-cron";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as sqlTemplate } from "drizzle-orm";
import { logger } from "./lib/logger";

export function setupScheduledPublishing() {
  // Run every minute to check for scheduled jobs
  cron.schedule("* * * * *", async () => {
    try {
      // Skip if DATABASE_URL is not available (e.g., in certain deployment environments)
      if (!process.env.DATABASE_URL) {
        logger.info('[SCHEDULED] DATABASE_URL not available, skipping scheduled publishing check');
        return;
      }
      
      const sql = neon(process.env.DATABASE_URL);
      const db = drizzle(sql);

      // Get pending scheduled jobs that are ready to execute
      const jobs = await db.execute(sqlTemplate`
        SELECT id, type, payload
        FROM scheduled_jobs
        WHERE status = 'pending'
          AND scheduled_for <= NOW()
        LIMIT 10
      `);

      for (const job of jobs.rows) {
        try {
          const payload = job.payload as { materialId?: string; userId?: string };
          
          if (job.type === 'publish_material' && payload.materialId) {
            // Publish the material (update to make it visible)
            // AUDIT 2026-09-01: a tábla neve html_files, az oszlopé user_id (schema.ts);
            // az idézőjeles camelCase azonosító 42P01-gyel bukott, minden job "failed" lett.
            await db.execute(sqlTemplate`
              UPDATE html_files
              SET user_id = ${payload.userId || 'dev-admin-local'}
              WHERE id = ${payload.materialId}
            `);
          }

          // Mark job as completed
          await db.execute(sqlTemplate`
            UPDATE scheduled_jobs
            SET status = 'completed', completed_at = NOW()
            WHERE id = ${job.id}
          `);
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          // Mark job as failed
          await db.execute(sqlTemplate`
            UPDATE scheduled_jobs
            SET status = 'failed', error = ${err.message}
            WHERE id = ${job.id}
          `);
        }
      }
    } catch (error: unknown) {
      // Silently skip if table doesn't exist (e.g., in fresh deployments)
      if (error instanceof Error && 'code' in error && (error as Record<string, unknown>).code === '42P01') {
        // Table doesn't exist - skip silently for this run
        return;
      }
      logger.error("Scheduled publishing cron error:", error);
    }
  });

  logger.info("Scheduled publishing cron job started (runs every minute)");
}
