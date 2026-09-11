CREATE TABLE IF NOT EXISTS lesson_workflow_runs (
  id varchar PRIMARY KEY,
  owner_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state varchar NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL,
  checkpoints jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_token varchar,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS lesson_workflow_owner_created ON lesson_workflow_runs(owner_id, created_at DESC);
