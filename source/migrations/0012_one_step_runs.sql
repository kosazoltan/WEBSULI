-- #168: az egylépeses gyártás futás-státusza túléli a szerver-újraindulást.
-- A one_step_runs a kliens állapotjelzőjének forrása; a gyártott adat maga a
-- knowledge_maps/studio_jobs/lessons táblákban él.
CREATE TABLE IF NOT EXISTS "one_step_runs" (
  "id" varchar PRIMARY KEY,
  "phase" varchar(16) NOT NULL,
  "detail" text,
  "error" text,
  "map_id" varchar,
  "job_id" varchar,
  "lesson_id" varchar,
  "started_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "one_step_runs_updated_idx" ON "one_step_runs" ("updated_at");
