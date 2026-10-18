-- Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S4): egy inaktivitási időszakra egy riasztás. Additív, idempotens.
ALTER TABLE learners ADD COLUMN IF NOT EXISTS inactivity_alerted_at timestamp with time zone;
--> statement-breakpoint
-- Review #304: címzettenkénti kézbesítés az aktuális inaktivitási időszakban (kulcs: az utolsó tevékenység ideje vagy 'never').
ALTER TABLE learners ADD COLUMN IF NOT EXISTS inactivity_alert_key text;
--> statement-breakpoint
ALTER TABLE learners ADD COLUMN IF NOT EXISTS inactivity_alerted_to text[] NOT NULL DEFAULT '{}';
