-- Szólétra + Kockavadász meta frissítés / új játék a katalógusban

UPDATE "games_catalog"
SET
  "title" = 'Szólétra (HU ↔ EN)',
  "description" = 'Magyar és angol szavak: minden találat egy léc — mászz a csúcsra!'
WHERE "id" = 'word-ladder-hu-en';
--> statement-breakpoint

INSERT INTO "games_catalog" ("id", "title", "description", "sort_order")
VALUES (
  'block-craft-quiz',
  'Kockavadász kvíz',
  'Minecraft hangulatú 2D világ: bányássz blokkokat — csak jó kvízre tűnik el a kocka.',
  4
)
ON CONFLICT ("id") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "sort_order" = EXCLUDED."sort_order";
