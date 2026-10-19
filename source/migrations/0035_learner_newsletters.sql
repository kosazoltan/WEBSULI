-- „Mai felfedezés” hírlevél (docs/specs/2026-10-19-mai-felfedezes-hirlevel.md, S2): tanulónként és naponként egy hírlevél
-- (foglalás → küldés). Additív, idempotens.
CREATE TABLE IF NOT EXISTS learner_newsletters (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id varchar NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  day date NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 1,
  article_url text,
  article_title text,
  material_id varchar,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS learner_newsletters_learner_day_idx ON learner_newsletters (learner_id, day);
