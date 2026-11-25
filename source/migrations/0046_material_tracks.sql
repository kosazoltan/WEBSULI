-- #1986 (tulajdonosi kérés 2026-11-24; spec: docs/specs/2026-11-24-gimi-felveteli-csoport.md): külön tananyagcsoportok.
-- A csoport anyaga a saját tartalmi évfolyamán marad (html_files.classroom); a tagságot a tracks tömb hordozza.
-- A track_assignments a fiók–csoport hozzárendelés a P-020 fiókkulcsán (gmail: pontok és +címke nélkül) — Google- és
-- játékos-fiókra egyaránt. Additív, idempotens. A hozzárendeléseket az admin veszi fel (Csoport-hozzárendelések kártya) — a
-- repó NYILVÁNOS, valódi cím nem kerülhet bele (no-real-emails-guard).
-- Visszaállítás (down) — csak a #1986 kódjának visszavonásával együtt:
--   DROP TABLE IF EXISTS track_assignments; ALTER TABLE html_files DROP COLUMN IF EXISTS tracks;
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE html_files ADD COLUMN IF NOT EXISTS tracks text[] NOT NULL DEFAULT '{}'::text[];
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS track_assignments (
  track varchar(32) NOT NULL,
  email_key varchar(254) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (track, email_key)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS track_assignments_email_key_idx ON track_assignments (email_key);
