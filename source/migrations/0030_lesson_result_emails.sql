-- Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md): körönként egy levél (ismétlésvédelem).
-- A tanuló szövegét nem tárolja (az csak a levélben megy), csak az azonosítót, a százalékot és a küldés sikerét. Additív, idempotens.
CREATE TABLE IF NOT EXISTS lesson_result_emails (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id varchar NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  kind varchar(8) NOT NULL CHECK (kind IN ('tasks', 'quiz')),
  round_key char(64) NOT NULL,
  percent integer NOT NULL,
  -- Review #280: címzettenkénti kézbesítés — a meghiúsult címzett később pótolható (nem vész el a „mindkét admin” követelmény).
  delivered text[] NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_result_emails_round_unique ON lesson_result_emails(lesson_id, kind, round_key);
