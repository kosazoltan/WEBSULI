-- Napi tananyag-emlékeztető (docs/specs/2026-10-18-napi-emlekezteto.md). Additív, idempotens.
-- A tanuló neve a címhez (a nevesített cím kap napi levelet); a név az adatbázisban él, a repóban nem.
ALTER TABLE extra_email_addresses ADD COLUMN IF NOT EXISTS student_name varchar(80);

-- Ismétlésvédelem: címenként naponta legfeljebb egy levél (két példány / újraindítás esetén is).
CREATE TABLE IF NOT EXISTS daily_reminder_emails (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar NOT NULL,
  day date NOT NULL,
  material_id varchar NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_reminder_emails_email_day_unique ON daily_reminder_emails(email, day);
