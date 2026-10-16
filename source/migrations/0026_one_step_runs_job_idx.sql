-- Spec 2026-10-16-gyartas-haladas (review #264): a draftlista futó tétele a job legutóbbi futását keresi (job_id, updated_at DESC). Additív, idempotens.
CREATE INDEX IF NOT EXISTS one_step_runs_job_updated_idx ON one_step_runs (job_id, updated_at DESC);
