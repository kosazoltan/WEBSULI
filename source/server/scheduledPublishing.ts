import cron from "node-cron";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as sqlTemplate } from "drizzle-orm";

export function setupScheduledPublishing() {
  // Run every minute to check for scheduled jobs
  cron.schedule("* * * * *", async () => {
    try {
      // Skip if DATABASE_URL is not available (e.g., in certain deployment environments)
      if (!process.env.DATABASE_URL) {
        console.log('[SCHEDULED] DATABASE_URL not available, skipping scheduled publishing check');
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
          const payload = job.payload as any;
          
          if (job.type === 'publish_material' && payload.materialId) {
            // Publish the material (update to make it visible)
            await db.execute(sqlTemplate`
              UPDATE "htmlFiles"
              SET "userId" = ${payload.userId || 'dev-admin-local'}
              WHERE id = ${payload.materialId}
            `);
          }

          // Mark job as completed
          await db.execute(sqlTemplate`
            UPDATE scheduled_jobs
            SET status = 'completed', completed_at = NOW()
            WHERE id = ${job.id}
          `);
        } catch (error: any) {
          // Mark job as failed
          await db.execute(sqlTemplate`
            UPDATE scheduled_jobs
            SET status = 'failed', error = ${error.message}
            WHERE id = ${job.id}
          `);
        }
      }
    } catch (error: any) {
      // Silently skip if table doesn't exist (e.g., in fresh deployments)
      if (error?.code === '42P01') {
        // Table doesn't exist - skip silently for this run
        return;
      }
      console.error("Scheduled publishing cron error:", error);
    }
  });

  console.log("Scheduled publishing cron job started (runs every minute)");
}
