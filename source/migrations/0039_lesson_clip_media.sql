-- Spec docs/specs/2026-11-10-fejezet-kisfilmek-v2.md (6.): a kisfilmek médiája (kezdőkép, hang, átkódolt mozgókép) tartalomcímzetten.
-- Az azonosító a tartalom sha256-jának első 32 hexa jegye, ezért a sor soha nem módosul. Additív, idempotens;
-- visszaállítás: a lesson_clip_media tábla eldobása (a kisfilm ilyenkor állóképpel és a felolvasás tartalék hangjával megy).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lesson_clip_media (
  id char(32) PRIMARY KEY,
  kind varchar(8) NOT NULL CHECK (kind IN ('image', 'audio', 'video')),
  mime varchar(40) NOT NULL,
  bytes bytea NOT NULL,
  size integer NOT NULL CHECK (size > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
