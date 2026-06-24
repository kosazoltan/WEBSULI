-- B4: Add error_logs table (was defined in shared/schema.ts but missing migration)
-- Generated: 2026-06-24

CREATE TABLE IF NOT EXISTS "error_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" varchar(32) NOT NULL,
	"error_type" varchar(50) NOT NULL,
	"severity" varchar(10) DEFAULT 'ERROR' NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"commit_sha" varchar(40),
	"app_name" varchar(50) DEFAULT 'Websuli' NOT NULL,
	"repo_path" varchar(100) DEFAULT 'D:/repo/WEBSULI' NOT NULL,
	"environment" varchar(20) DEFAULT 'production' NOT NULL,
	"breadcrumbs" jsonb,
	"url" varchar(500),
	"request_id" varchar(100),
	"request_method" varchar(10),
	"request_body" text,
	"user_id" varchar(100),
	"user_email" varchar(200),
	"browser" varchar(300),
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"email_sent_at" timestamp,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"resolved_commit" varchar(40),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "error_logs_fingerprint_unique" UNIQUE("fingerprint")
);

CREATE INDEX IF NOT EXISTS "error_logs_fingerprint_idx" ON "error_logs" USING btree ("fingerprint");
CREATE INDEX IF NOT EXISTS "error_logs_severity_idx" ON "error_logs" USING btree ("severity");
CREATE INDEX IF NOT EXISTS "error_logs_resolved_idx" ON "error_logs" USING btree ("resolved");
CREATE INDEX IF NOT EXISTS "error_logs_created_at_idx" ON "error_logs" USING btree ("created_at");
