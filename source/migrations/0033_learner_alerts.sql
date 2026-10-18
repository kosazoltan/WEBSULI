-- Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S4): egy inaktivitási időszakra egy riasztás. Additív, idempotens.
ALTER TABLE learners ADD COLUMN IF NOT EXISTS inactivity_alerted_at timestamp with time zone;
