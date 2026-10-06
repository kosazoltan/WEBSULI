-- Spec 2026-10-06-s8-tanuloi-eredmenyesseg: tételenkénti tanulói eredményesség a katalógushoz (additív, idempotens).
-- Kulcs: a katalógus-tétel tartalmi lenyomata (catalog_items.fingerprint, S1 itemFingerprint). Csak összesített darabszám —
-- nincs felhasználó-, lecke- vagy kör-azonosító.
CREATE TABLE IF NOT EXISTS catalog_item_outcomes (
  fingerprint varchar(32) PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  correct integer NOT NULL DEFAULT 0 CHECK (correct >= 0 AND correct <= attempts),
  independent_correct integer NOT NULL DEFAULT 0 CHECK (independent_correct >= 0 AND independent_correct <= correct),
  rate real GENERATED ALWAYS AS (CASE WHEN attempts > 0 THEN correct::real / attempts END) STORED,
  updated_at timestamptz NOT NULL DEFAULT now()
);
