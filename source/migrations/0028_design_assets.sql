-- Websuli ikonkészlet (docs/specs/2026-10-17-websuli-ikonkeszlet.md): a jóváhagyott, MI-generált saját képek (tantárgyikonok,
-- hősök, borítók, kabala) bájtjai és metaadatai. Additív és idempotens; a szerver induláskor a verziókezelt katalógusból tölti.
CREATE TABLE IF NOT EXISTS design_assets (
  id varchar(64) PRIMARY KEY,
  kind varchar(16) NOT NULL CHECK (kind IN ('mascot', 'hero', 'icon', 'cover')),
  band varchar(16) NOT NULL CHECK (band IN ('explorer', 'adventure', 'studio', 'laboratory', 'future')),
  subjects text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  alt text NOT NULL,
  mime varchar(32) NOT NULL,
  sha256 char(64) NOT NULL,
  bytes bytea NOT NULL,
  origin text NOT NULL,
  model varchar(80) NOT NULL,
  prompt_hash varchar(16) NOT NULL,
  approved_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS design_assets_kind_band_idx ON design_assets(kind, band);
