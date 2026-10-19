-- „Mai felfedezés” hírlevél (docs/specs/2026-10-19-mai-felfedezes-hirlevel.md, S1): érdeklődés és kapcsoló. Additív, idempotens; alapból KI.
ALTER TABLE learners ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE learners ADD COLUMN IF NOT EXISTS newsletter boolean NOT NULL DEFAULT false;
