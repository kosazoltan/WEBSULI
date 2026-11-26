-- D-04 (tulajdonosi döntés, 2026-11-19): a Kockavadász „Rúnabánya” új pontskálája új pontkulcsot kap
-- ('block-craft-quiz-v2'). A game_scores.game_id idegen kulcs a games_catalog-ra, ezért a kulcs katalógussora
-- NÉLKÜL minden új pont-INSERT FK-sértéssel (23503) elveszne (a 0007 / 0012 migráció mintája).
-- Csak hozzáadó: a régi 'block-craft-quiz' pontsorokhoz nem nyúl (archív; nincs nullázás, nincs átváltás).
-- A sor nem önálló játék: a szerver a lobbi-katalógusból kiszűri (shared/game-score-keys.ts, lobbyCatalog).

INSERT INTO "games_catalog" ("id", "title", "description", "sort_order")
VALUES
  ('block-craft-quiz-v2', 'Kockavadász — Rúnabánya (pontkulcs)', 'A Kockavadász Rúnabánya pontskálájának ranglista-kulcsa; nem önálló játék.', 1000)
ON CONFLICT ("id") DO NOTHING;
