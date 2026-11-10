-- Spec docs/specs/2026-11-10-fejezet-kisfilmek.md (4.2): a leckefejezetek rajzfilmes kisfilmjei (jelenet-JSON). A lecke `json`-ja
-- érintetlen marad; a kisfilm a fejezet indexéhez, címéhez és a tanítószöveg lenyomatához kötött. Additív, idempotens;
-- visszaállítás: a lesson_clips tábla eldobása (a kód nélküle is fut — a lecke kisfilm nélkül is teljes).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lesson_clips (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id varchar NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  section_index integer NOT NULL CHECK (section_index >= 0),
  -- A fejezetcím a gyártáskor: eltérő című fejezethez a kisfilm nem megy ki.
  heading varchar(255) NOT NULL,
  -- A fejezet tanítószövegének sha256 lenyomata; kézi kisfilmnél NULL (azt csak a cím köti).
  source_hash char(64),
  status varchar(8) NOT NULL CHECK (status IN ('ready', 'failed')),
  clip jsonb,
  origin varchar(8) NOT NULL CHECK (origin IN ('handmade', 'auto')),
  model varchar(80),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS lesson_clips_section_unique ON lesson_clips(lesson_id, section_index);
