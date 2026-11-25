-- D1H-1 (docs/specs/2026-11-25-d1h-kivagott-kep.md, tulajdonosi döntés 2026-11-24: D1 HIBRID): a forrás kivágott képei,
-- tartalomcímzetten (id = a bájtok sha256-ja). A lecke `sourceImage` ábrája hivatkozik rájuk; a `GET /api/source-images/:id` adja.
-- Additív, idempotens. Visszaállítás (down): DROP TABLE IF EXISTS lesson_source_images;
CREATE TABLE IF NOT EXISTS lesson_source_images (
  id char(64) PRIMARY KEY,
  mime varchar(32) NOT NULL,
  bytes bytea NOT NULL,
  source_url text,
  source_file text,
  page smallint,
  credit text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
