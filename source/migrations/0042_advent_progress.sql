-- Adventi naptár, S2a (docs/specs/2026-11-18-adventi-naptar.md R7, 12.4, 16.6, 16.8; végrehajtás: …-vegrehajtas.md „S2a”):
-- alanyonként és évadonként egy előrehaladás-sor (advent_progress), és az egyszeri értesítő levél címzettenkénti foglalása
-- (advent_announcements — a cím maga nem tárolódik, csak kulcsolt lenyomata).
-- Additív, idempotens (IF NOT EXISTS); a kényszernevek a Drizzle-sémáéval (shared/schema.ts) azonosak.
-- A funkciót az ADVENT_CALENDAR bevezetési flag kapcsolja (alapból KI) — kikapcsolva a táblák nem használtak.
-- Visszaállítás (down), csak ha a funkciót végleg elvetjük — az adatot is törli:
--   DROP TABLE IF EXISTS advent_announcements;
--   DROP TABLE IF EXISTS advent_progress;
-- Ideiglenes visszakapcsoláshoz elég az ADVENT_CALENDAR=off (a táblák maradhatnak).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS advent_progress (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  season integer NOT NULL,
  subject_kind varchar(8) NOT NULL,
  subject_id varchar(64) NOT NULL,
  learner_id varchar,
  player_id varchar,
  grade integer,
  round integer NOT NULL DEFAULT 1,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  doors jsonb NOT NULL DEFAULT '{}'::jsonb,
  finished_at timestamp with time zone,
  passed_at timestamp with time zone,
  mailed_to text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT advent_progress_learner_id_learners_id_fk FOREIGN KEY (learner_id) REFERENCES learners(id) ON DELETE CASCADE,
  CONSTRAINT advent_progress_player_id_player_accounts_id_fk FOREIGN KEY (player_id) REFERENCES player_accounts(id) ON DELETE CASCADE,
  CONSTRAINT advent_progress_kind_check CHECK (subject_kind IN ('learner', 'player', 'device', 'preview')),
  CONSTRAINT advent_progress_learner_check CHECK ((subject_kind = 'learner') = (learner_id IS NOT NULL)),
  CONSTRAINT advent_progress_player_check CHECK ((subject_kind = 'player') = (player_id IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS advent_progress_subject_unique ON advent_progress (season, subject_kind, subject_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS advent_progress_kind_updated_idx ON advent_progress (subject_kind, updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS advent_announcements (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  season integer NOT NULL,
  recipient_hash char(64) NOT NULL,
  source varchar(16) NOT NULL,
  status varchar(8) NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS advent_announcements_recipient_unique ON advent_announcements (season, recipient_hash);
