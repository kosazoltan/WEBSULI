-- P-020 (tulajdonosi döntés 2026-11-23; terv: docs/specs/2026-11-23-jatekosfiok-gmail-normalizalas.md): a játékos-fiók
-- postafiókonként egyedi. `email_key` = a fiókkulcs, GENERÁLT oszlop (nem felejthető el, a régi kód beszúrása is kitölti,
-- a meglévő sorokra a visszatöltés automatikus). Szabály (konzervatív, egyezik a codes.ts `accountEmailKey` / `mailboxKeySql`
-- függvénnyel): CSAK gmail.com / googlemail.com címen a `+címke` levágva, a pontok törölve a helyi részből,
-- googlemail.com -> gmail.com; minden más domainen csak trim + kisbetű (ott a `+címke` megmarad).
-- Meglévő ütközés: NEM vonjuk össze és NEM töröljük. Az azonos kulcsú sorok `email_key_dup` sorszámot kapnak (a legrégebbi 0,
-- a többi 1, 2, …), és az egyedi index az (email_key, email_key_dup) PÁRON van — így meglévő ütközésen sem bukik (a futtató a
-- „duplicate key” hibát csendben átugraná), de minden ÚJ sor (alapértéke 0) ütközik a csoport legrégebbi sorával: új alias
-- adatbázis-szinten sem jöhet létre (a régi alkalmazáspéldányból sem). Az index a kulcs szerinti keresést is kiszolgálja.
-- A kézi összevonáshoz az admin végpont listázza a csoportokat (GET /api/admin/game-accounts/email-collisions).
-- Additív, idempotens (IF NOT EXISTS; a sorszámozás változatlan adaton újrafuttatva nem ír).
-- Visszaállítás (down) — csak a P-020 kódjának visszavonásával együtt (a kód az oszlopot olvassa):
--   DROP INDEX IF EXISTS player_accounts_email_key_unique;
--   ALTER TABLE player_accounts DROP COLUMN IF EXISTS email_key_dup, DROP COLUMN IF EXISTS email_key;
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS email_key varchar(254) GENERATED ALWAYS AS (CASE WHEN split_part(lower(btrim(email)), '@', 2) IN ('gmail.com', 'googlemail.com') THEN replace(split_part(split_part(lower(btrim(email)), '@', 1), '+', 1), '.', '') || '@gmail.com' ELSE lower(btrim(email)) END) STORED;
--> statement-breakpoint
ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS email_key_dup smallint NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE player_accounts p SET email_key_dup = r.n - 1
  FROM (SELECT id, row_number() OVER (PARTITION BY email_key ORDER BY created_at, id) AS n FROM player_accounts) r
 WHERE r.id = p.id AND p.email_key_dup <> r.n - 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS player_accounts_email_key_unique ON player_accounts (email_key, email_key_dup);
