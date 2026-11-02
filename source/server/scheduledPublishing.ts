import cron from "node-cron";
import { sql as sqlTemplate } from "drizzle-orm";
import { db } from "./db";
import { logger } from "./lib/logger";

export function setupScheduledPublishing() {
  // Spec 2026-10-19-eroforras-s1: óránként (korábban percenként — a `scheduled_jobs` üres, semmi nem ír bele, a percenkénti
  // lekérdezés viszont soha nem hagyta elaludni a Neon-adatbázist).
  cron.schedule("0 * * * *", runScheduledPublishingCheck);
  logger.info("Scheduled publishing cron job started (runs hourly)");
}

/** Share the application's selected DEV/production database and connection pool. */
export async function runScheduledPublishingCheck() {
    try {
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
}
