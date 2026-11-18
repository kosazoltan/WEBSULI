-- Spec docs/specs/2026-11-18-tananyag-gyartas-minoseg.md (S8b, D4): a nyelvleckék előre gyártott felolvasó hangjai az adatbázisban.
-- Az azonosító a (hangverzió, nyelv, normalizált szöveg) lenyomatának első 32 hexa jegye (shared/tts-audio-key.ts); a felolvasott
-- szöveg nem tárolódik, a sor soha nem módosul. Additív, idempotens; visszaállítás: DROP TABLE lesson_tts_audio (a lecke ilyenkor a
-- böngésző hangjával szól).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lesson_tts_audio (
  id char(32) PRIMARY KEY,
  voice_version varchar(16) NOT NULL,
  language varchar(8) NOT NULL,
  mime varchar(40) NOT NULL,
  bytes bytea NOT NULL,
  size integer NOT NULL CHECK (size > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS lesson_tts_audio_voice_language_idx ON lesson_tts_audio (voice_version, language);
