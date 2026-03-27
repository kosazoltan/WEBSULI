-- Játék katalógus és ponttábla (Neon): Google OAuth + e-mail lista tagjai szinkronizálhatnak

CREATE TABLE IF NOT EXISTS "games_catalog" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

INSERT INTO "games_catalog" ("id", "title", "description", "sort_order")
VALUES
	('tsunami-english', 'Szökőár szökés — Angol', 'Harmadikos angol kvízek hullám elől', 1),
	('word-ladder-hu-en', 'Szólétra (HU ↔ EN)', 'Hamarosan elérhető', 2),
	('speed-quiz-math', 'Gyors matek sprint', 'Hamarosan elérhető', 3)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "game_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"difficulty" varchar(32) DEFAULT 'normal' NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"best_run_xp" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"best_run_seconds" integer DEFAULT 0 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_scores_user_game_difficulty_unique" UNIQUE ("user_id", "game_id", "difficulty")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "game_scores" ADD CONSTRAINT "game_scores_user_id_users_id_fk"
   FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "game_scores" ADD CONSTRAINT "game_scores_game_id_games_catalog_id_fk"
   FOREIGN KEY ("game_id") REFERENCES "games_catalog"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "game_scores_game_difficulty_best_run_idx"
  ON "game_scores" ("game_id", "difficulty", "best_run_xp" DESC);
