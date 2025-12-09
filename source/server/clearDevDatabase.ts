import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "../shared/schema";
import { sql } from 'drizzle-orm';

async function clearDevDatabase() {
  console.log('🧹 Clearing DEV database...\n');

  const devSql = neon(process.env.DEV_DATABASE_URL!);
  const devDb = drizzle(devSql, { schema });

  try {
    // Delete in reverse foreign key dependency order
    console.log('Deleting material_comments...');
    await devDb.execute(sql`DELETE FROM material_comments`);
    
    console.log('Deleting material_ratings...');
    await devDb.execute(sql`DELETE FROM material_ratings`);
    
    console.log('Deleting material_stats...');
    await devDb.execute(sql`DELETE FROM material_stats`);
    
    console.log('Deleting material_tags...');
    await devDb.execute(sql`DELETE FROM material_tags`);
    
    console.log('Deleting tags...');
    await devDb.execute(sql`DELETE FROM tags`);
    
    console.log('Deleting email_logs...');
    await devDb.execute(sql`DELETE FROM email_logs`);
    
    console.log('Deleting material_likes...');
    await devDb.execute(sql`DELETE FROM material_likes`);
    
    console.log('Deleting material_views...');
    await devDb.execute(sql`DELETE FROM material_views`);
    
    console.log('Deleting extra_email_addresses...');
    await devDb.execute(sql`DELETE FROM extra_email_addresses`);
    
    console.log('Deleting email_subscriptions...');
    await devDb.execute(sql`DELETE FROM email_subscriptions`);
    
    console.log('Deleting html_files...');
    await devDb.execute(sql`DELETE FROM html_files`);
    
    console.log('Deleting system_prompts...');
    await devDb.execute(sql`DELETE FROM system_prompts`);
    
    console.log('Deleting users...');
    await devDb.execute(sql`DELETE FROM users`);
    
    console.log('Deleting backups...');
    await devDb.execute(sql`DELETE FROM backups`);

    console.log('\n✅ DEV database cleared successfully!');
    
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    throw error;
  }
}

clearDevDatabase().then(() => {
  console.log('\n✅ All done!');
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
