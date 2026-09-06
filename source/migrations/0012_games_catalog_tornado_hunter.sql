-- Tornado Hunter 200 (a 7. játék): a kliens 'tornado-hunter-200' azonosítóval küld
-- pontszámot és kupon-export is ide írhat kvízt. A games_catalog sor NÉLKÜL minden
-- game_scores / game_quiz_items INSERT FK-sértéssel (23503) némán elveszne — ugyanaz a
-- hiba, amit a 0007 migráció javított az aszteroida/brain-rot játékoknál.

INSERT INTO "games_catalog" ("id", "title", "description", "sort_order")
VALUES
  ('tornado-hunter-200', 'Tornado Hunter 200', '3D viharvadászat: 200 szint, 160 jármű, Storm Coin. A pontosztáskor autonóm matek/angol kvíz dönti el a horgonyzást.', 7)
ON CONFLICT ("id") DO NOTHING;
