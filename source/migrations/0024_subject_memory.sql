-- Spec 2026-10-06-s5-tantargyi-memoria: tantárgyi memória (kanban-kártyák), additív, idempotens.
-- Kártya = egy tantárgy visszatérő hibaosztálya egy lépésen; az események táblája az idempotencia alapja (egy bizonyíték egyszer számol).
-- Számozás: a 0023-at az S8 ág (feat/s8-tanuloi-eredmenyesseg) foglalja, ezért 0024.
CREATE TABLE IF NOT EXISTS subject_memory_cards (
  fingerprint varchar(32) PRIMARY KEY,
  subject varchar(32) NOT NULL,
  step varchar(32) NOT NULL,
  code varchar(64) NOT NULL,
  occurrences integer NOT NULL DEFAULT 0,
  first_seen timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  status varchar(8) NOT NULL CHECK (status IN ('open','watch','closed')),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  corrective_summary text,
  corrective_at timestamptz,
  corrective_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS subject_memory_cards_subject_status_idx ON subject_memory_cards (subject, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS subject_memory_events (
  card_fingerprint varchar(32) NOT NULL REFERENCES subject_memory_cards(fingerprint) ON DELETE CASCADE,
  evidence_key varchar(160) NOT NULL,
  seen_at timestamptz NOT NULL,
  PRIMARY KEY (card_fingerprint, evidence_key)
);
