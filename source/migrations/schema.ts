import { pgTable, varchar, text, jsonb, timestamp, foreignKey, unique, integer, boolean, index, uniqueIndex, real } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const backups = pgTable("backups", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	name: text().notNull(),
	data: jsonb().notNull(),
	createdBy: varchar("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const aiGenerationRequests = pgTable("ai_generation_requests", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id"),
	prompt: text().notNull(),
	generatedContent: text("generated_content"),
	status: varchar().notNull(),
	error: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "ai_generation_requests_user_id_users_id_fk"
		}),
]);

export const emailSubscriptions = pgTable("email_subscriptions", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id"),
	email: varchar().notNull(),
	classrooms: integer().array().default([RAY[]).notNull(),
	isSubscribed: boolean("is_subscribed").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "email_subscriptions_user_id_users_id_fk"
		}),
	unique("email_subscriptions_email_unique").on(table.email),
]);

export const scheduledJobs = pgTable("scheduled_jobs", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	type: varchar().notNull(),
	scheduledFor: timestamp("scheduled_for", { mode: 'string' }).notNull(),
	payload: jsonb().notNull(),
	status: varchar().default('pending').notNull(),
	error: text(),
	createdBy: varchar("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
}, (table) => [
	index("scheduled_jobs_scheduled_for_idx").using("btree", table.scheduledFor.asc().nullsLast().op("timestamp_ops")),
	index("scheduled_jobs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "scheduled_jobs_created_by_users_id_fk"
		}),
]);

export const htmlFiles = pgTable("html_files", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id"),
	title: text().notNull(),
	content: text().notNull(),
	description: text(),
	classroom: integer().default(1).notNull(),
	contentType: varchar("content_type").default('html').notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("html_files_classroom_created_idx").using("btree", table.classroom.asc().nullsLast().op("int4_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("html_files_classroom_idx").using("btree", table.classroom.asc().nullsLast().op("int4_ops")),
	index("html_files_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("html_files_display_order_idx").using("btree", table.displayOrder.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "html_files_user_id_users_id_fk"
		}),
]);

export const systemPrompts = pgTable("system_prompts", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	name: text().notNull(),
	prompt: text().notNull(),
	description: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const materialViews = pgTable("material_views", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id"),
	materialId: varchar("material_id").notNull(),
	viewedAt: timestamp("viewed_at", { mode: 'string' }).defaultNow().notNull(),
	userAgent: text("user_agent"),
}, (table) => [
	index("material_views_material_idx").using("btree", table.materialId.asc().nullsLast().op("text_ops")),
	index("material_views_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("material_views_viewed_at_idx").using("btree", table.viewedAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "material_views_user_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.materialId],
			foreignColumns: [htmlFiles.id],
			name: "material_views_material_id_html_files_id_fk"
		}),
]);

export const users = pgTable("users", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	email: varchar(),
	password: varchar(),
	firstName: varchar("first_name"),
	lastName: varchar("last_name"),
	profileImageUrl: varchar("profile_image_url"),
	isAdmin: boolean("is_admin").default(false).notNull(),
	isBanned: boolean("is_banned").default(false).notNull(),
	lastSeenAt: timestamp("last_seen_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	googleId: varchar("google_id"),
}, (table) => [
	unique("users_email_unique").on(table.email),
	unique("users_google_id_unique").on(table.googleId),
]);

export const weeklyEmailReports = pgTable("weekly_email_reports", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	periodStart: timestamp("period_start", { mode: 'string' }).notNull(),
	periodEnd: timestamp("period_end", { mode: 'string' }).notNull(),
	reportType: varchar("report_type").notNull(),
	metrics: jsonb().notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }).defaultNow().notNull(),
});

export const tags = pgTable("tags", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	color: varchar(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("tags_name_unique").on(table.name),
]);

export const extraEmailAddresses = pgTable("extra_email_addresses", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	email: varchar().notNull(),
	classrooms: integer().array().default([RAY[]).notNull(),
	addedBy: varchar("added_by"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.addedBy],
			foreignColumns: [users.id],
			name: "extra_email_addresses_added_by_users_id_fk"
		}),
	unique("extra_email_addresses_email_unique").on(table.email),
]);

export const materialComments = pgTable("material_comments", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	materialId: varchar("material_id").notNull(),
	authorName: varchar("author_name").notNull(),
	authorEmail: varchar("author_email").notNull(),
	body: text().notNull(),
	isApproved: boolean("is_approved").default(false).notNull(),
	userId: varchar("user_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	approvedBy: varchar("approved_by"),
}, (table) => [
	index("material_comments_approved_idx").using("btree", table.isApproved.asc().nullsLast().op("bool_ops")),
	index("material_comments_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("material_comments_material_created_idx").using("btree", table.materialId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("material_comments_material_idx").using("btree", table.materialId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.materialId],
			foreignColumns: [htmlFiles.id],
			name: "material_comments_material_id_html_files_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "material_comments_user_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.approvedBy],
			foreignColumns: [users.id],
			name: "material_comments_approved_by_users_id_fk"
		}),
]);

export const materialLikes = pgTable("material_likes", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	materialId: varchar("material_id").notNull(),
	fingerprint: varchar().notNull(),
	userId: varchar("user_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("material_likes_fingerprint_idx").using("btree", table.fingerprint.asc().nullsLast().op("text_ops")),
	uniqueIndex("material_likes_material_fingerprint_unique").using("btree", table.materialId.asc().nullsLast().op("text_ops"), table.fingerprint.asc().nullsLast().op("text_ops")),
	index("material_likes_material_idx").using("btree", table.materialId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.materialId],
			foreignColumns: [htmlFiles.id],
			name: "material_likes_material_id_html_files_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "material_likes_user_id_users_id_fk"
		}),
]);

export const materialRatings = pgTable("material_ratings", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	materialId: varchar("material_id").notNull(),
	rating: integer().notNull(),
	fingerprint: varchar().notNull(),
	userId: varchar("user_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("material_ratings_fingerprint_idx").using("btree", table.fingerprint.asc().nullsLast().op("text_ops")),
	index("material_ratings_material_idx").using("btree", table.materialId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.materialId],
			foreignColumns: [htmlFiles.id],
			name: "material_ratings_material_id_html_files_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "material_ratings_user_id_users_id_fk"
		}),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id"),
	email: varchar(),
	endpoint: text().notNull(),
	keys: jsonb().notNull(),
	userAgent: text("user_agent"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "push_subscriptions_user_id_users_id_fk"
		}),
	unique("push_subscriptions_endpoint_unique").on(table.endpoint),
]);

export const emailLogs = pgTable("email_logs", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	htmlFileId: varchar("html_file_id"),
	recipientEmail: varchar("recipient_email").notNull(),
	status: varchar().notNull(),
	resendId: varchar("resend_id"),
	error: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.htmlFileId],
			foreignColumns: [htmlFiles.id],
			name: "email_logs_html_file_id_html_files_id_fk"
		}),
]);

export const materialStats = pgTable("material_stats", {
	materialId: varchar("material_id").primaryKey().notNull(),
	totalViews: integer("total_views").default(0).notNull(),
	uniqueViewers: integer("unique_viewers").default(0).notNull(),
	totalLikes: integer("total_likes").default(0).notNull(),
	averageRating: real("average_rating").default(0),
	lastViewedAt: timestamp("last_viewed_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.materialId],
			foreignColumns: [htmlFiles.id],
			name: "material_stats_material_id_html_files_id_fk"
		}),
]);

export const materialTags = pgTable("material_tags", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	materialId: varchar("material_id").notNull(),
	tagId: varchar("tag_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("material_tags_material_idx").using("btree", table.materialId.asc().nullsLast().op("text_ops")),
	uniqueIndex("material_tags_material_tag_unique").using("btree", table.materialId.asc().nullsLast().op("text_ops"), table.tagId.asc().nullsLast().op("text_ops")),
	index("material_tags_tag_idx").using("btree", table.tagId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.materialId],
			foreignColumns: [htmlFiles.id],
			name: "material_tags_material_id_html_files_id_fk"
		}),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: "material_tags_tag_id_tags_id_fk"
		}),
]);
