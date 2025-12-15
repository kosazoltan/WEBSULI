import { sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, index, uniqueIndex, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// System prompts for AI customization
export const systemPrompts = pgTable("system_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SystemPrompt = typeof systemPrompts.$inferSelect;
export type InsertSystemPrompt = typeof systemPrompts.$inferInsert;

export const insertSystemPromptSchema = createInsertSchema(systemPrompts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  googleId: varchar("google_id").unique(),
  email: varchar("email").unique(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  isBanned: boolean("is_banned").default(false).notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// HTML Files table
export const htmlFiles = pgTable("html_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  classroom: integer("classroom").notNull().default(1),
  contentType: varchar("content_type").notNull().default('html'),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  classroomIdx: index("html_files_classroom_idx").on(table.classroom),
  createdAtIdx: index("html_files_created_at_idx").on(table.createdAt),
  classroomCreatedIdx: index("html_files_classroom_created_idx").on(table.classroom, table.createdAt),
  displayOrderIdx: index("html_files_display_order_idx").on(table.displayOrder),
}));

export const insertHtmlFileSchema = createInsertSchema(htmlFiles).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  title: z.string().min(1, "A cím nem lehet üres"),
  content: z.string().min(1, "A tartalom nem lehet üres"),
  classroom: z.number().int().min(0).max(12).optional(),
  contentType: z.enum(['html', 'pdf']).optional(),
});

export type InsertHtmlFile = z.infer<typeof insertHtmlFileSchema>;
export type HtmlFile = typeof htmlFiles.$inferSelect;

// Email Subscriptions table - classrooms as PostgreSQL integer array
export const emailSubscriptions = pgTable("email_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  email: varchar("email").notNull().unique(),
  classrooms: integer("classrooms").array().notNull().default(sql`ARRAY[1]`),
  isSubscribed: boolean("is_subscribed").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEmailSubscriptionSchema = createInsertSchema(emailSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  classrooms: z.array(z.number().min(0).max(12)).min(1, "Legalább egy osztály kiválasztása kötelező"),
});

export type InsertEmailSubscription = z.infer<typeof insertEmailSubscriptionSchema>;
export type EmailSubscription = typeof emailSubscriptions.$inferSelect;

// Extra email addresses - classrooms as PostgreSQL integer array
export const extraEmailAddresses = pgTable("extra_email_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  classrooms: integer("classrooms").array().notNull().default(sql`ARRAY[1]`),
  addedBy: varchar("added_by").references(() => users.id),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertExtraEmailSchema = createInsertSchema(extraEmailAddresses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  classrooms: z.array(z.number().min(1).max(8)).min(1, "Legalább egy osztály kiválasztása kötelező"),
});

export type InsertExtraEmail = z.infer<typeof insertExtraEmailSchema>;
export type ExtraEmail = typeof extraEmailAddresses.$inferSelect;

// Email Logs table
export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  htmlFileId: varchar("html_file_id").references(() => htmlFiles.id),
  recipientEmail: varchar("recipient_email").notNull(),
  status: varchar("status").notNull(),
  resendId: varchar("resend_id"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEmailLogSchema = createInsertSchema(emailLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogs.$inferSelect;

// AI Generation Requests table
export const aiGenerationRequests = pgTable("ai_generation_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  prompt: text("prompt").notNull(),
  generatedContent: text("generated_content"),
  status: varchar("status").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Push Subscriptions table - keys stored as PostgreSQL jsonb
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  email: varchar("email"),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").notNull(),
  userAgent: text("user_agent"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAiGenerationRequestSchema = createInsertSchema(aiGenerationRequests).omit({
  id: true,
  createdAt: true,
});

export type InsertAiGenerationRequest = z.infer<typeof insertAiGenerationRequestSchema>;
export type AiGenerationRequest = typeof aiGenerationRequests.$inferSelect;

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  endpoint: z.string().url("Az endpoint érvényes URL kell legyen"),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// Backups table - data stored as PostgreSQL jsonb
export const backups = pgTable("backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBackupSchema = createInsertSchema(backups).omit({
  id: true,
  createdAt: true,
});

export type InsertBackup = z.infer<typeof insertBackupSchema>;
export type Backup = typeof backups.$inferSelect;

// Material Views table
export const materialViews = pgTable("material_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  materialId: varchar("material_id").notNull().references(() => htmlFiles.id),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
  userAgent: text("user_agent"),
}, (table) => ({
  materialIdx: index("material_views_material_idx").on(table.materialId),
  userIdx: index("material_views_user_idx").on(table.userId),
  viewedAtIdx: index("material_views_viewed_at_idx").on(table.viewedAt),
}));

export const insertMaterialViewSchema = createInsertSchema(materialViews).omit({
  id: true,
  viewedAt: true,
});

export type InsertMaterialView = z.infer<typeof insertMaterialViewSchema>;
export type MaterialView = typeof materialViews.$inferSelect;

// Tags lookup table
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: varchar("color"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
});

export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tags.$inferSelect;

// Material Tags - Many-to-many
export const materialTags = pgTable("material_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  materialId: varchar("material_id").notNull().references(() => htmlFiles.id),
  tagId: varchar("tag_id").notNull().references(() => tags.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  materialIdx: index("material_tags_material_idx").on(table.materialId),
  tagIdx: index("material_tags_tag_idx").on(table.tagId),
  uniqueMaterialTag: uniqueIndex("material_tags_material_tag_unique").on(table.materialId, table.tagId),
}));

export const insertMaterialTagSchema = createInsertSchema(materialTags).omit({
  id: true,
  createdAt: true,
});

export type InsertMaterialTag = z.infer<typeof insertMaterialTagSchema>;
export type MaterialTag = typeof materialTags.$inferSelect;

// Material Stats
export const materialStats = pgTable("material_stats", {
  materialId: varchar("material_id").primaryKey().references(() => htmlFiles.id),
  totalViews: integer("total_views").default(0).notNull(),
  uniqueViewers: integer("unique_viewers").default(0).notNull(),
  totalLikes: integer("total_likes").default(0).notNull(),
  averageRating: real("average_rating").default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMaterialStatSchema = createInsertSchema(materialStats).omit({
  updatedAt: true,
});

export type InsertMaterialStat = z.infer<typeof insertMaterialStatSchema>;
export type MaterialStat = typeof materialStats.$inferSelect;

// Material Likes
export const materialLikes = pgTable("material_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  materialId: varchar("material_id").notNull().references(() => htmlFiles.id),
  fingerprint: varchar("fingerprint").notNull(),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  materialIdx: index("material_likes_material_idx").on(table.materialId),
  fingerprintIdx: index("material_likes_fingerprint_idx").on(table.fingerprint),
  uniqueMaterialFingerprint: uniqueIndex("material_likes_material_fingerprint_unique").on(table.materialId, table.fingerprint),
}));

export const insertMaterialLikeSchema = createInsertSchema(materialLikes).omit({
  id: true,
  createdAt: true,
});

export type InsertMaterialLike = z.infer<typeof insertMaterialLikeSchema>;
export type MaterialLike = typeof materialLikes.$inferSelect;

// Material Ratings
export const materialRatings = pgTable("material_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  materialId: varchar("material_id").notNull().references(() => htmlFiles.id),
  rating: integer("rating").notNull(),
  fingerprint: varchar("fingerprint").notNull(),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  materialIdx: index("material_ratings_material_idx").on(table.materialId),
  fingerprintIdx: index("material_ratings_fingerprint_idx").on(table.fingerprint),
}));

export const insertMaterialRatingSchema = createInsertSchema(materialRatings).omit({
  id: true,
  createdAt: true,
}).extend({
  rating: z.number().int().min(1).max(5),
});

export type InsertMaterialRating = z.infer<typeof insertMaterialRatingSchema>;
export type MaterialRating = typeof materialRatings.$inferSelect;

// Scheduled Jobs - payload as PostgreSQL jsonb
export const scheduledJobs = pgTable("scheduled_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status").notNull().default('pending'),
  error: text("error"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  statusIdx: index("scheduled_jobs_status_idx").on(table.status),
  scheduledForIdx: index("scheduled_jobs_scheduled_for_idx").on(table.scheduledFor),
}));

export const insertScheduledJobSchema = createInsertSchema(scheduledJobs).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertScheduledJob = z.infer<typeof insertScheduledJobSchema>;
export type ScheduledJob = typeof scheduledJobs.$inferSelect;

// Material Comments
export const materialComments = pgTable("material_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  materialId: varchar("material_id").notNull().references(() => htmlFiles.id),
  authorName: varchar("author_name").notNull(),
  authorEmail: varchar("author_email").notNull(),
  body: text("body").notNull(),
  isApproved: boolean("is_approved").default(false).notNull(),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
}, (table) => ({
  materialIdx: index("material_comments_material_idx").on(table.materialId),
  approvedIdx: index("material_comments_approved_idx").on(table.isApproved),
  createdAtIdx: index("material_comments_created_at_idx").on(table.createdAt),
  materialCreatedIdx: index("material_comments_material_created_idx").on(table.materialId, table.createdAt),
}));

export const insertMaterialCommentSchema = createInsertSchema(materialComments).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
  approvedBy: true,
});

export type InsertMaterialComment = z.infer<typeof insertMaterialCommentSchema>;
export type MaterialComment = typeof materialComments.$inferSelect;

// Weekly Email Reports - metrics as PostgreSQL jsonb
export const weeklyEmailReports = pgTable("weekly_email_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  reportType: varchar("report_type").notNull(),
  metrics: jsonb("metrics").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export const insertWeeklyEmailReportSchema = createInsertSchema(weeklyEmailReports).omit({
  id: true,
  sentAt: true,
});

export type InsertWeeklyEmailReport = z.infer<typeof insertWeeklyEmailReportSchema>;
export type WeeklyEmailReport = typeof weeklyEmailReports.$inferSelect;

// Improved HTML Files table - for AI-improved materials before applying
export const improvedHtmlFiles = pgTable("improved_html_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalFileId: varchar("original_file_id").notNull().references(() => htmlFiles.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  classroom: integer("classroom").notNull().default(1),
  contentType: varchar("content_type").notNull().default('html'),
  improvementPrompt: text("improvement_prompt"),
  improvementNotes: text("improvement_notes"),
  status: varchar("status").notNull().default('pending'), // pending, approved, rejected, applied
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  appliedAt: timestamp("applied_at"),
  appliedBy: varchar("applied_by").references(() => users.id),
}, (table) => ({
  originalFileIdx: index("improved_html_files_original_file_idx").on(table.originalFileId),
  statusIdx: index("improved_html_files_status_idx").on(table.status),
  createdAtIdx: index("improved_html_files_created_at_idx").on(table.createdAt),
  appliedAtIdx: index("improved_html_files_applied_at_idx").on(table.appliedAt),
}));

export const insertImprovedHtmlFileSchema = createInsertSchema(improvedHtmlFiles).omit({
  id: true,
  createdAt: true,
  appliedAt: true,
  appliedBy: true,
});

export type InsertImprovedHtmlFile = z.infer<typeof insertImprovedHtmlFileSchema>;
export type ImprovedHtmlFile = typeof improvedHtmlFiles.$inferSelect;

// Material Improvement Backups table - backups before applying improvements
export const materialImprovementBackups = pgTable("material_improvement_backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalFileId: varchar("original_file_id").notNull().references(() => htmlFiles.id, { onDelete: 'cascade' }),
  improvedFileId: varchar("improved_file_id").references(() => improvedHtmlFiles.id, { onDelete: 'set null' }),
  backupData: jsonb("backup_data").notNull(), // Original file data before replacement
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  notes: text("notes"),
}, (table) => ({
  originalFileIdx: index("material_improvement_backups_original_file_idx").on(table.originalFileId),
  createdAtIdx: index("material_improvement_backups_created_at_idx").on(table.createdAt),
}));

export const insertMaterialImprovementBackupSchema = createInsertSchema(materialImprovementBackups).omit({
  id: true,
  createdAt: true,
});

export type InsertMaterialImprovementBackup = z.infer<typeof insertMaterialImprovementBackupSchema>;
export type MaterialImprovementBackup = typeof materialImprovementBackups.$inferSelect;
