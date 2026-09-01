-- AUDIT 2026-09-01: a kliens 'space-asteroid-quiz' és 'brain-rot-steal' azonosítóval küld
-- pontszámot, és az AI-kvízgenerálás is 'space-asteroid-quiz' alá szúr be, de ezek a sorok
-- sosem kerültek a games_catalog-ba → game_scores / game_quiz_items FK-sértés (23503),
-- a pontok és a generált kvízek némán elvesztek.

INSERT INTO "games_catalog" ("id", "title", "description", "sort_order")
VALUES
  ('space-asteroid-quiz', 'Galaktikus aszteroida kvíz', 'Űrhajós lövöldözés: minden aszteroida egy tananyag-kérdés.', 5),
  ('brain-rot-steal', 'Brain Rot vadászat', 'Kapd el a szörnyeket helyes válaszokkal, mielőtt elszöknek.', 6)
ON CONFLICT ("id") DO NOTHING;
