-- Additive: old application versions can leave this table untouched on rollback.
CREATE TABLE IF NOT EXISTS lesson_attempts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id varchar NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  bank_version varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  questions jsonb NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  hints jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb,
  started_at timestamp NOT NULL DEFAULT now(),
  finished_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_attempts_active_unique ON lesson_attempts(user_id, lesson_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS lesson_attempts_history_idx ON lesson_attempts(user_id, lesson_id, started_at);
CREATE INDEX IF NOT EXISTS lesson_attempts_report_idx ON lesson_attempts(lesson_id, finished_at);
