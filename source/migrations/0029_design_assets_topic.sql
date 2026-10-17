-- Websuli arculati bank (docs/specs/2026-10-17-arculati-bank.md): a témaköri borító témakörkulcsa, és két új fajta
-- (blokkjelző, fejezetelválasztó). Additív és idempotens.
ALTER TABLE design_assets ADD COLUMN IF NOT EXISTS topic varchar(64);
ALTER TABLE design_assets DROP CONSTRAINT IF EXISTS design_assets_kind_check;
ALTER TABLE design_assets ADD CONSTRAINT design_assets_kind_check CHECK (kind IN ('mascot', 'hero', 'icon', 'cover', 'marker', 'divider'));
