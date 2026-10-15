-- Tételgyár T7.1 (docs/specs/2026-10-15-tetelgyar-t7-dontobiro-vegrehajtas.md): a döntőbíró gyorsítótára és napi kerete. Additív, idempotens.
-- Adatminimalizálás (tulajdonosi döntés 2026-10-15): a gyerek válaszának szövege NEM tárolódik, csak a kulcs-hash és az ítélet.
CREATE TABLE IF NOT EXISTS arbiter_verdicts (
  cache_key varchar(64) PRIMARY KEY,
  state varchar(8) NOT NULL CHECK (state IN ('ok','partial','fail')),
  score real NOT NULL,
  reason text NOT NULL,
  model varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS arbiter_daily_usage (
  day date PRIMARY KEY,
  calls integer NOT NULL DEFAULT 0
);
