import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "../shared/schema";
import { sql } from 'drizzle-orm';
import { logger } from "./lib/logger";

async function clearDevDatabase() {
  logger.info('🧹 Clearing DEV database...\n');

  const devSql = neon(process.env.DEV_DATABASE_URL!);
  const devDb = drizzle(devSql, { schema });

  try {
    // Delete in reverse foreign key dependency order
    logger.info('Deleting material_comments...');
    await devDb.execute(sql`DELETE FROM material_comments`);
    
    logger.info('Deleting material_ratings...');
    await devDb.execute(sql`DELETE FROM material_ratings`);
    
    logger.info('Deleting material_stats...');
    await devDb.execute(sql`DELETE FROM material_stats`);
    
    logger.info('Deleting material_tags...');
    await devDb.execute(sql`DELETE FROM material_tags`);
    
    logger.info('Deleting tags...');
    await devDb.execute(sql`DELETE FROM tags`);
    
    logger.info('Deleting email_logs...');
    await devDb.execute(sql`DELETE FROM email_logs`);
    
    logger.info('Deleting material_likes...');
    await devDb.execute(sql`DELETE FROM material_likes`);
    
    logger.info('Deleting material_views...');
    await devDb.execute(sql`DELETE FROM material_views`);
    
    logger.info('Deleting extra_email_addresses...');
    await devDb.execute(sql`DELETE FROM extra_email_addresses`);
    
    logger.info('Deleting email_subscriptions...');
    await devDb.execute(sql`DELETE FROM email_subscriptions`);
    
    logger.info('Deleting html_files...');
    await devDb.execute(sql`DELETE FROM html_files`);
    
    logger.info('Deleting system_prompts...');
    await devDb.execute(sql`DELETE FROM system_prompts`);
    
    logger.info('Deleting users...');
    await devDb.execute(sql`DELETE FROM users`);
    
    logger.info('Deleting backups...');
    await devDb.execute(sql`DELETE FROM backups`);

    logger.info('\n✅ DEV database cleared successfully!');
    
  } catch (error) {
    logger.error('❌ Error clearing database:', error);
    throw error;
  }
}

clearDevDatabase().then(() => {
  logger.info('\n✅ All done!');
  process.exit(0);
}).catch((err) => {
  logger.error('\n❌ Fatal error:', err);
  process.exit(1);
});
