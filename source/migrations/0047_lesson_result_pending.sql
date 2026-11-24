-- U4 összevont eredménylevél (docs/specs/2026-11-24-osszevont-eredmenylevel.md, Adatmodell): a kétrészes lecke végleges
-- részeredményének tartós félretétele, amíg a másik rész el nem készül (vagy 7 nap el nem telik). Részenként egy NYITOTT sor
-- tanulónként (owner_key) és leckénként; az elküldött sor megmarad (a kör felhasználásának tartós nyoma, review #583), a
-- tanulói tartalom (graded, learner) elküldés után törölhető — nyitott sorban kötelező. Additív, idempotens.
-- Visszaállítás (down): DROP TABLE IF EXISTS lesson_result_pending;
CREATE TABLE IF NOT EXISTS lesson_result_pending (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id varchar NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  owner_key varchar(128) NOT NULL,
  kind varchar(8) NOT NULL CHECK (kind IN ('tasks', 'quiz')),
  round_id varchar(128) NOT NULL,
  graded jsonb,
  learner jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sent_at timestamp with time zone,
  sent_reason varchar(8) CHECK (sent_reason IN ('pair', 'timeout')),
  CONSTRAINT lesson_result_pending_open_has_content CHECK (sent_at IS NOT NULL OR (graded IS NOT NULL AND learner IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_result_pending_open_unique ON lesson_result_pending(lesson_id, owner_key, kind) WHERE sent_at IS NULL;
-- A söprő (U4c) a régi nyitott sorokat keresi.
CREATE INDEX IF NOT EXISTS lesson_result_pending_open_age ON lesson_result_pending(created_at) WHERE sent_at IS NULL;
