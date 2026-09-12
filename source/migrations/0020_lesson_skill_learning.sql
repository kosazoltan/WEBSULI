CREATE TABLE IF NOT EXISTS lesson_skill_audits (
  run_id varchar NOT NULL REFERENCES lesson_workflow_runs(id) ON DELETE CASCADE,
  execution integer NOT NULL,
  audit jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, execution)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lesson_skill_lessons (
  owner_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill varchar NOT NULL,
  method_version varchar NOT NULL,
  fingerprint varchar NOT NULL,
  code varchar NOT NULL,
  step varchar NOT NULL,
  state varchar NOT NULL CHECK (state IN ('active','observed','disabled')),
  occurrences integer NOT NULL DEFAULT 1,
  recovered integer NOT NULL DEFAULT 0,
  last_run varchar NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, skill, method_version, fingerprint)
);
