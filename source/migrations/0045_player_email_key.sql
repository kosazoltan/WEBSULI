-- P-020 (tulajdonosi döntés 2026-11-23; terv: docs/specs/2026-11-23-jatekosfiok-gmail-normalizalas.md): a játékos-fiók
-- postafiókonként egyedi. `email_key` = a fiókkulcs, GENERÁLT oszlop (nem felejthető el, a régi kód beszúrása is kitölti,
-- a meglévő sorokra a visszatöltés automatikus). Szabály (konzervatív, egyezik a codes.ts `accountEmailKey`-vel): CSAK
-- gmail.com / googlemail.com címen a `+címke` levágva, a pontok törölve a helyi részből, googlemail.com -> gmail.com; minden más
-- domainen csak trim + kisbetű (ott a `+címke` megmarad).
-- Meglévő ütközés: NEM vonjuk össze és NEM töröljük — az érintett sorok `email_key_conflict = true` jelölést kapnak, a kézi
-- összevonáshoz az admin végpont listázza őket (GET /api/admin/game-accounts/email-collisions). Az egyedi index RÉSZLEGES
-- (a jelölt sorokat kihagyja), így meglévő ütközésen sem bukik (a futtató a „duplicate key” hibát csendben átugraná), új
-- ütközést viszont nem enged. Additív, idempotens (IF NOT EXISTS; a jelölés újrafuttatva ugyanazt adja).
-- Visszaállítás (down) — csak a P-020 kódjának visszavonásával együtt (a kód az oszlopot olvassa):
--   DROP INDEX IF EXISTS player_accounts_email_key_unique;
--   ALTER TABLE player_accounts DROP COLUMN IF EXISTS email_key_conflict, DROP COLUMN IF EXISTS email_key;
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS email_key varchar(254) GENERATED ALWAYS AS (
  CASE WHEN split_part(lower(btrim(email)), '@', 2) IN ('gmail.com', 'googlemail.com')
       THEN replace(split_part(split_part(lower(btrim(email)), '@', 1), '+', 1), '.', '') || '@gmail.com'
       ELSE lower(btrim(email)) END
) STORED;
--> statement-breakpoint
ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS email_key_conflict boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE player_accounts p SET email_key_conflict = true
 WHERE NOT p.email_key_conflict
   AND EXISTS (SELECT 1 FROM player_accounts o WHERE o.email_key = p.email_key AND o.id <> p.id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS player_accounts_email_key_unique ON player_accounts (email_key) WHERE NOT email_key_conflict;
