-- Audit 2026-09-05 (docs/specs/audit-4day-fixes-2026-09-05.md), szelet A + C.
-- Additív, újrafuttatható migráció.
--
-- 1) game_quiz_items.lesson_id — a publikálási kapu exportja leckéhez köthető,
--    így az újra-publikálás idempotens (előbb törli a lecke korábbi tételeit).
-- 2) lektor_notes.round — a lektor a saját körének jegyzeteit írja; az author
--    round N csak az N-1 kör blokkolóit kapja, nem a stale uniót.

ALTER TABLE "game_quiz_items" ADD COLUMN IF NOT EXISTS "lesson_id" varchar;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_quiz_items_lesson_id_fk') THEN
    ALTER TABLE "game_quiz_items" ADD CONSTRAINT "game_quiz_items_lesson_id_fk"
      FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "game_quiz_items_lesson_id_idx" ON "game_quiz_items" ("lesson_id");
--> statement-breakpoint

ALTER TABLE "lektor_notes" ADD COLUMN IF NOT EXISTS "round" integer NOT NULL DEFAULT 0;
