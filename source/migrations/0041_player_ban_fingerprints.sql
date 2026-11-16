-- JM7b-utójavítás K1 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md „JM7b-utójavítás K1”; tulajdonosi döntés
-- 2026-11-16: „Tiltás megőrzése ujjlenyomattal”): a TILTOTT játékos-fiók törlésekor a cím KULCSOLT, visszafejthetetlen
-- ujjlenyomata (HMAC-SHA256 a szerver titkából levezetett kulccsal, a kanonizált címen) és a tiltás ideje marad meg, hogy
-- ugyanazzal a címmel újra belépve se jöhessen létre tiltás nélküli fiók. A teljes cím NEM tárolódik.
-- Additív, idempotens (IF NOT EXISTS); meglévő táblát nem módosít; a flagtől (PLAYER_ACCOUNTS) függetlenül lefut, és magában
-- ártalmatlan (üres tábla, amelyet csak a játékos-fiók kódja olvas / ír). A kényszernevek a Drizzle-sémáéval azonosak.
-- Visszaállítás (down) — csak a K1 kódjának visszavonásával együtt (a kód a táblát olvassa), az ujjlenyomatokat is törli:
--   DROP TABLE IF EXISTS player_ban_fingerprints;
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
-- `key_id`: a HMAC-kulcs rövid azonosítója — a `SESSION_SECRET` rotációja után a régi kulcsú sorok felismerhetők: az ÉLŐ tiltott
-- fiókoké újraszámolódik, a törölt fiókoké (visszafejthetetlen) tudottan elvész (a takarító darabszámmal, cím nélkül naplózza).
CREATE TABLE IF NOT EXISTS player_ban_fingerprints (
  fingerprint char(64) PRIMARY KEY,
  key_id char(16) NOT NULL,
  banned_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
