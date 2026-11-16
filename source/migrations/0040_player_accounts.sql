-- JM7a (docs/specs/2026-11-16-jatekok-jatekelmeny.md 10.4, D11 / D12; végrehajtás: …-vegrehajtas.md „JM7a”):
-- játékos-fiók, szerkezetileg külön a `users` táblától (nincs admin-mezője), és az egyszeri e-mailes belépőkódok.
-- Additív, idempotens (IF NOT EXISTS); a kényszernevek a Drizzle-sémáéval (shared/schema.ts) azonosak.
-- A funkciót a PLAYER_ACCOUNTS bevezetési flag kapcsolja (alapból KI) — kikapcsolva a táblák nem használtak.
-- Visszaállítás (down), csak ha a funkciót végleg elvetjük — az adatot is törli:
--   DROP TABLE IF EXISTS player_auth_codes;
--   DROP TABLE IF EXISTS player_accounts;
-- Ideiglenes visszakapcsoláshoz elég a PLAYER_ACCOUNTS=off (a táblák maradhatnak).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS player_accounts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL,
  email_verified_at timestamp with time zone,
  nickname varchar(24),
  nickname_key varchar(32),
  avatar_key varchar(32),
  friend_code char(8),
  linked_learner_id varchar,
  google_sub varchar(64),
  banned_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone,
  CONSTRAINT player_accounts_email_unique UNIQUE (email),
  CONSTRAINT player_accounts_nickname_key_unique UNIQUE (nickname_key),
  CONSTRAINT player_accounts_friend_code_unique UNIQUE (friend_code),
  CONSTRAINT player_accounts_google_sub_unique UNIQUE (google_sub),
  CONSTRAINT player_accounts_linked_learner_id_learners_id_fk FOREIGN KEY (linked_learner_id) REFERENCES learners(id) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS player_auth_codes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized varchar(254) NOT NULL,
  email_hash char(64) NOT NULL,
  limit_hash char(64) NOT NULL,
  code_hash char(64) NOT NULL,
  link_hash char(64) NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT player_auth_codes_link_hash_unique UNIQUE (link_hash)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_auth_codes_email_idx ON player_auth_codes (email_hash, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_auth_codes_limit_idx ON player_auth_codes (limit_hash, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS player_auth_codes_created_idx ON player_auth_codes (created_at);
