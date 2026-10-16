-- Websuli Design §7: memóriakártya-ismétlés (docs/specs/2026-10-16-websuli-ismetles.md). Additív és idempotens; csak azonosítók,
-- értékelés és időpontok (adattakarékosság). A régi alkalmazásverzió érintetlenül hagyja.
CREATE TABLE IF NOT EXISTS review_states (
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id varchar NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  card_id varchar(80) NOT NULL,
  interval_days integer NOT NULL,
  repetitions integer NOT NULL,
  due_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id, card_id)
);
CREATE TABLE IF NOT EXISTS review_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id varchar NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  card_id varchar(80) NOT NULL,
  rating varchar(8) NOT NULL CHECK (rating IN ('again', 'known')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_events_learner_idx ON review_events(user_id, lesson_id, created_at);
