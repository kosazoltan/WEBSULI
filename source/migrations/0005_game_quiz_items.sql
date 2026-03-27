-- Strukturált játék-kvíz bank (bővíthető); opcionális hivatkozás tananyag (html_files) sorra

CREATE TABLE IF NOT EXISTS "game_quiz_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"tier" varchar(16) NOT NULL,
	"topic" varchar(128),
	"prompt" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"source_material_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "game_quiz_items_game_id_idx" ON "game_quiz_items" ("game_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "game_quiz_items_game_tier_idx" ON "game_quiz_items" ("game_id", "tier");
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "game_quiz_items" ADD CONSTRAINT "game_quiz_items_game_id_games_catalog_id_fk"
   FOREIGN KEY ("game_id") REFERENCES "games_catalog"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "game_quiz_items" ADD CONSTRAINT "game_quiz_items_source_material_id_html_files_id_fk"
   FOREIGN KEY ("source_material_id") REFERENCES "html_files"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

INSERT INTO "game_quiz_items" ("game_id", "tier", "topic", "prompt", "options", "correct_index")
VALUES
	('tsunami-english', 'easy', 'család', 'Hogy mondjuk angolul: nagypapa?', '["grandfather", "grandmother", "uncle", "cousin"]'::jsonb, 0),
	('tsunami-english', 'easy', 'család', 'Hogy mondjuk angolul: nagymama?', '["grandmother", "grandfather", "mother", "aunt"]'::jsonb, 0),
	('tsunami-english', 'easy', 'állat', 'Hogy mondjuk angolul: bárány?', '["lamb", "lion", "lizard", "leopard"]'::jsonb, 0),
	('tsunami-english', 'easy', 'iskola', 'Hogy mondjuk angolul: tábla (iskolai)?', '["board", "door", "floor", "roof"]'::jsonb, 0),
	('tsunami-english', 'medium', 'idő', 'Mit jelent: See you tomorrow.', '["Holnap találkozunk.", "Tegnap voltam ott.", "Most megyek.", "Nem jövök."]'::jsonb, 0),
	('tsunami-english', 'medium', 'ige', 'Melyik illik: We ___ English on Mondays.', '["study", "studies", "studying", "studied"]'::jsonb, 0),
	('tsunami-english', 'medium', 'szókincs', 'Hogy mondjuk angolul: szomszéd?', '["neighbor", "nephew", "nurse", "noodle"]'::jsonb, 0),
	('tsunami-english', 'hard', 'nyelvtan', 'Melyik helyes: „Nem tudtam megoldani.”', '["I couldn''t solve it.", "I can''t solved it.", "I don''t could solve it.", "I not could solve it."]'::jsonb, 0),
	('tsunami-english', 'hard', 'szövegértés', 'Mit jelent: It depends on the weather.', '["Az időjárástól függ.", "Rossz az idő.", "Mindig süt a nap.", "Esik az eső."]'::jsonb, 0),
	('word-ladder-hu-en', 'easy', 'test', '„Fog” (szájban) angolul:', '["toe", "tooth", "tongue", "turtle"]'::jsonb, 1),
	('word-ladder-hu-en', 'easy', 'ruha', '„Kalap” angolul:', '["hat", "hot", "hit", "hut"]'::jsonb, 0),
	('word-ladder-hu-en', 'medium', 'hónap', '„November” angolul:', '["November", "December", "October", "January"]'::jsonb, 0),
	('word-ladder-hu-en', 'hard', 'mondat', 'Melyik illik: She asked me ___ quiet.', '["be", "to be", "being", "been"]'::jsonb, 1);
