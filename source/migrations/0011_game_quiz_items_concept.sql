-- LS-5 — a játék-kvíz bank elemei a lecke fogalmaihoz kötve, hogy a
-- feedback-loop a játékbeli hibákat is fogalomhoz tudja rendelni.
-- Additív migráció: meglévő sort nem módosít, újrafuttatható.

ALTER TABLE "game_quiz_items" ADD COLUMN IF NOT EXISTS "concept_id" varchar(64);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_quiz_items_concept_id_fk') THEN
    ALTER TABLE "game_quiz_items" ADD CONSTRAINT "game_quiz_items_concept_id_fk"
      FOREIGN KEY ("concept_id") REFERENCES "km_concepts"("id") ON DELETE SET NULL;
  END IF;
END $$;
