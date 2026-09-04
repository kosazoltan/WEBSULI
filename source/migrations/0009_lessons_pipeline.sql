-- LS-2 — strukturált lecke, csővezeték-futások és lektori jegyzetek.
-- Additív migráció: meglévő táblát nem módosít, minden lépés újrafuttatható.

CREATE TABLE IF NOT EXISTS "lessons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"html_file_id" varchar,
	"map_id" varchar NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"json" jsonb NOT NULL,
	"coverage" jsonb,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "studio_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" varchar,
	"map_id" varchar NOT NULL,
	"step" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"model" varchar(120),
	"prompt_version" varchar(32),
	"input_hash" varchar(64) NOT NULL,
	"output" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "lektor_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"kind" varchar(24) NOT NULL,
	"subkind" varchar(32),
	"severity" varchar(12) NOT NULL,
	"message" text NOT NULL,
	"block_path" varchar(32),
	"resolved_by" varchar,
	"resolution" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "lessons_map_id_idx" ON "lessons" ("map_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lessons_html_file_id_idx" ON "lessons" ("html_file_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lessons_published_at_idx" ON "lessons" ("published_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "studio_jobs_map_id_idx" ON "studio_jobs" ("map_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_jobs_lesson_id_idx" ON "studio_jobs" ("lesson_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_jobs_input_hash_idx" ON "studio_jobs" ("input_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_jobs_step_status_idx" ON "studio_jobs" ("step", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "lektor_notes_job_id_idx" ON "lektor_notes" ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lektor_notes_severity_idx" ON "lektor_notes" ("job_id", "severity");
--> statement-breakpoint

-- A lecke a html_files sorral együtt tűnik el, a térkép viszont NEM törölhető,
-- amíg lecke hivatkozik rá (restrict): a publikált lecke forrása megőrzendő.
DO $$ BEGIN
 ALTER TABLE "lessons" ADD CONSTRAINT "lessons_html_file_id_html_files_id_fk"
   FOREIGN KEY ("html_file_id") REFERENCES "html_files"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "lessons" ADD CONSTRAINT "lessons_map_id_knowledge_maps_id_fk"
   FOREIGN KEY ("map_id") REFERENCES "knowledge_maps"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "studio_jobs" ADD CONSTRAINT "studio_jobs_lesson_id_lessons_id_fk"
   FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "studio_jobs" ADD CONSTRAINT "studio_jobs_map_id_knowledge_maps_id_fk"
   FOREIGN KEY ("map_id") REFERENCES "knowledge_maps"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "lektor_notes" ADD CONSTRAINT "lektor_notes_job_id_studio_jobs_id_fk"
   FOREIGN KEY ("job_id") REFERENCES "studio_jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "lektor_notes" ADD CONSTRAINT "lektor_notes_resolved_by_users_id_fk"
   FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
