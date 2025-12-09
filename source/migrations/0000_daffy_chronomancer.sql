-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "backups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generation_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"prompt" text NOT NULL,
	"generated_content" text,
	"status" varchar NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"email" varchar NOT NULL,
	"classrooms" integer[] DEFAULT '{RAY[}' NOT NULL,
	"is_subscribed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_subscriptions_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "html_files" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"description" text,
	"classroom" integer DEFAULT 1 NOT NULL,
	"content_type" varchar DEFAULT 'html' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_prompts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_views" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"material_id" varchar NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"google_id" varchar,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "weekly_email_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"report_type" varchar NOT NULL,
	"metrics" jsonb NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "extra_email_addresses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"classrooms" integer[] DEFAULT '{RAY[}' NOT NULL,
	"added_by" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "extra_email_addresses_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "material_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" varchar NOT NULL,
	"author_name" varchar NOT NULL,
	"author_email" varchar NOT NULL,
	"body" text NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by" varchar
);
--> statement-breakpoint
CREATE TABLE "material_likes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" varchar NOT NULL,
	"fingerprint" varchar NOT NULL,
	"user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_ratings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"fingerprint" varchar NOT NULL,
	"user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"email" varchar,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"user_agent" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"html_file_id" varchar,
	"recipient_email" varchar NOT NULL,
	"status" varchar NOT NULL,
	"resend_id" varchar,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_stats" (
	"material_id" varchar PRIMARY KEY NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"unique_viewers" integer DEFAULT 0 NOT NULL,
	"total_likes" integer DEFAULT 0 NOT NULL,
	"average_rating" real DEFAULT 0,
	"last_viewed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" varchar NOT NULL,
	"tag_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generation_requests" ADD CONSTRAINT "ai_generation_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_subscriptions" ADD CONSTRAINT "email_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "html_files" ADD CONSTRAINT "html_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_views" ADD CONSTRAINT "material_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_views" ADD CONSTRAINT "material_views_material_id_html_files_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."html_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_email_addresses" ADD CONSTRAINT "extra_email_addresses_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_comments" ADD CONSTRAINT "material_comments_material_id_html_files_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."html_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_comments" ADD CONSTRAINT "material_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_comments" ADD CONSTRAINT "material_comments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_likes" ADD CONSTRAINT "material_likes_material_id_html_files_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."html_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_likes" ADD CONSTRAINT "material_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_ratings" ADD CONSTRAINT "material_ratings_material_id_html_files_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."html_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_ratings" ADD CONSTRAINT "material_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_html_file_id_html_files_id_fk" FOREIGN KEY ("html_file_id") REFERENCES "public"."html_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_stats" ADD CONSTRAINT "material_stats_material_id_html_files_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."html_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_tags" ADD CONSTRAINT "material_tags_material_id_html_files_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."html_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_tags" ADD CONSTRAINT "material_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_jobs_scheduled_for_idx" ON "scheduled_jobs" USING btree ("scheduled_for" timestamp_ops);--> statement-breakpoint
CREATE INDEX "scheduled_jobs_status_idx" ON "scheduled_jobs" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "html_files_classroom_created_idx" ON "html_files" USING btree ("classroom" int4_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "html_files_classroom_idx" ON "html_files" USING btree ("classroom" int4_ops);--> statement-breakpoint
CREATE INDEX "html_files_created_at_idx" ON "html_files" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "html_files_display_order_idx" ON "html_files" USING btree ("display_order" int4_ops);--> statement-breakpoint
CREATE INDEX "material_views_material_idx" ON "material_views" USING btree ("material_id" text_ops);--> statement-breakpoint
CREATE INDEX "material_views_user_idx" ON "material_views" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "material_views_viewed_at_idx" ON "material_views" USING btree ("viewed_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "material_comments_approved_idx" ON "material_comments" USING btree ("is_approved" bool_ops);--> statement-breakpoint
CREATE INDEX "material_comments_created_at_idx" ON "material_comments" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "material_comments_material_created_idx" ON "material_comments" USING btree ("material_id" text_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "material_comments_material_idx" ON "material_comments" USING btree ("material_id" text_ops);--> statement-breakpoint
CREATE INDEX "material_likes_fingerprint_idx" ON "material_likes" USING btree ("fingerprint" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "material_likes_material_fingerprint_unique" ON "material_likes" USING btree ("material_id" text_ops,"fingerprint" text_ops);--> statement-breakpoint
CREATE INDEX "material_likes_material_idx" ON "material_likes" USING btree ("material_id" text_ops);--> statement-breakpoint
CREATE INDEX "material_ratings_fingerprint_idx" ON "material_ratings" USING btree ("fingerprint" text_ops);--> statement-breakpoint
CREATE INDEX "material_ratings_material_idx" ON "material_ratings" USING btree ("material_id" text_ops);--> statement-breakpoint
CREATE INDEX "material_tags_material_idx" ON "material_tags" USING btree ("material_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "material_tags_material_tag_unique" ON "material_tags" USING btree ("material_id" text_ops,"tag_id" text_ops);--> statement-breakpoint
CREATE INDEX "material_tags_tag_idx" ON "material_tags" USING btree ("tag_id" text_ops);
*/