-- Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S1). Additív, idempotens.
-- A tanuló egy sor; az e-mail-címek learner_id-vel kapcsolódnak. A nevek az adatbázisban élnek, a repóban nem.
CREATE TABLE IF NOT EXISTS learners (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  grade integer NOT NULL,
  token_version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS learners_name_lower_unique ON learners (lower(name));
--> statement-breakpoint
ALTER TABLE extra_email_addresses ADD COLUMN IF NOT EXISTS learner_id varchar REFERENCES learners(id) ON DELETE SET NULL;
--> statement-breakpoint
INSERT INTO learners (name, grade)
SELECT DISTINCT ON (lower(trim(student_name))) trim(student_name), classrooms[1]
FROM extra_email_addresses
WHERE student_name IS NOT NULL AND trim(student_name) <> '' AND array_length(classrooms, 1) > 0
ORDER BY lower(trim(student_name)), is_active DESC, updated_at DESC
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE extra_email_addresses e SET learner_id = l.id
FROM learners l
WHERE e.learner_id IS NULL AND e.student_name IS NOT NULL AND lower(trim(e.student_name)) = lower(l.name);
--> statement-breakpoint
-- Megtekintés és eredmény tanulónként; megőrzés 365 nap (napi törlés, S4).
CREATE TABLE IF NOT EXISTS learner_activity (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id varchar NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  material_id varchar,
  kind varchar(16) NOT NULL CHECK (kind IN ('view', 'result')),
  percent integer,
  summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS learner_activity_learner_created_idx ON learner_activity (learner_id, created_at DESC);
