-- Migration: Add material improvement tables
-- Created: 2025-01-XX
-- Description: Adds tables for improving old HTML materials with Claude AI

-- Create improved_html_files table
CREATE TABLE IF NOT EXISTS "improved_html_files" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_file_id" varchar NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"description" text,
	"classroom" integer DEFAULT 1 NOT NULL,
	"content_type" varchar DEFAULT 'html' NOT NULL,
	"improvement_prompt" text,
	"improvement_notes" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp,
	"applied_by" varchar
);
--> statement-breakpoint

-- Create material_improvement_backups table
CREATE TABLE IF NOT EXISTS "material_improvement_backups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_file_id" varchar NOT NULL,
	"improved_file_id" varchar,
	"backup_data" jsonb NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint

-- Foreign keys for improved_html_files
ALTER TABLE "improved_html_files" ADD CONSTRAINT "improved_html_files_original_file_id_html_files_id_fk" 
	FOREIGN KEY ("original_file_id") REFERENCES "html_files"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "improved_html_files" ADD CONSTRAINT "improved_html_files_created_by_users_id_fk" 
	FOREIGN KEY ("created_by") REFERENCES "users"("id");
--> statement-breakpoint

ALTER TABLE "improved_html_files" ADD CONSTRAINT "improved_html_files_applied_by_users_id_fk" 
	FOREIGN KEY ("applied_by") REFERENCES "users"("id");
--> statement-breakpoint

-- Foreign keys for material_improvement_backups
ALTER TABLE "material_improvement_backups" ADD CONSTRAINT "material_improvement_backups_original_file_id_html_files_id_fk" 
	FOREIGN KEY ("original_file_id") REFERENCES "html_files"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "material_improvement_backups" ADD CONSTRAINT "material_improvement_backups_improved_file_id_improved_html_files_id_fk" 
	FOREIGN KEY ("improved_file_id") REFERENCES "improved_html_files"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "material_improvement_backups" ADD CONSTRAINT "material_improvement_backups_created_by_users_id_fk" 
	FOREIGN KEY ("created_by") REFERENCES "users"("id");
--> statement-breakpoint

-- Indexes for improved_html_files
CREATE INDEX IF NOT EXISTS "improved_html_files_original_file_idx" ON "improved_html_files"("original_file_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "improved_html_files_status_idx" ON "improved_html_files"("status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "improved_html_files_created_at_idx" ON "improved_html_files"("created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "improved_html_files_applied_at_idx" ON "improved_html_files"("applied_at");
--> statement-breakpoint

-- Indexes for material_improvement_backups
CREATE INDEX IF NOT EXISTS "material_improvement_backups_original_file_idx" ON "material_improvement_backups"("original_file_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "material_improvement_backups_created_at_idx" ON "material_improvement_backups"("created_at");

