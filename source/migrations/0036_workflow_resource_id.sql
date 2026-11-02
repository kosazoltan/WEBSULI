-- Spec docs/specs/2026-10-19-eroforras-s2b.md: a futás→job keresés (`snapshot->>'resourceId'`) jobonként a teljes futástábla
-- pillanatképét kicsomagolta (élesen 145 ms / 45 742 buffer egy darabszámhoz). Tárolt generált oszlop + index: a kicsomagolás
-- egyszer, íráskor történik. Additív, idempotens; visszaállítás: DROP INDEX + DROP COLUMN.
-- Review #328: korlátos zárvárakozás (a futtató fájlonként tranzakcióban fut) — ütközésnél a build gyorsan bukik, nem akad el.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE lesson_workflow_runs ADD COLUMN IF NOT EXISTS resource_id varchar GENERATED ALWAYS AS (snapshot->>'resourceId') STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS lesson_workflow_resource_id ON lesson_workflow_runs(resource_id);
