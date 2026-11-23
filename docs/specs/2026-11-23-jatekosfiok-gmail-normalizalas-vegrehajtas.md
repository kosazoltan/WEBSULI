# Végrehajtás — játékos-fiók Gmail-normalizálás (terv: `docs/specs/2026-11-23-jatekosfiok-gmail-normalizalas.md`, P-020)

Ügynöknek szóló lépések, sorrendben. Minden lépés után a megadott ellenőrzés.

1. **RED — egységteszt** `source/tests/player-codes.test.ts`: `accountEmailKey` (Gmail-pont, `+címke`, googlemail, más domain
   `+címke` megmarad, kisbetű); a 0040 ↔ séma oszlop-egyezés a későbbi `ALTER TABLE player_accounts ADD COLUMN` sorokat is
   számolja; a 0045 additív (nincs DROP).
2. **RED — DB-teszt** `source/tests/player-account-db.integration.ts` (P-020 blokk): alias-belépés ugyanazt a fiókot adja
   (kódos + Google); az egyedi index új ütközést elutasít; a 0045 egy külön sémában meglévő ütközésen fut (kétszer), jelöl,
   nem töröl; SQL ↔ TS kulcs egyezik; admin ütközés-lista maszkolt. Ellenőrzés: `env -u DATABASE_URL npm --prefix source run
   test:learning-db` → az új tesztek buknak.
3. **Kód**:
   - `source/server/player/codes.ts`: `accountEmailKey`.
   - `source/migrations/0045_player_email_key.sql`: generált `email_key`, `email_key_conflict`, ütközés-jelölés, részleges egyedi index.
   - `source/shared/schema.ts`: a két oszlop + `uniqueIndex(...).where(...)`.
   - `source/server/player/store.ts` `confirmVerifiedEmail`, `account-store.ts` `upsertGooglePlayer`: `email_key` szerinti
     feloldás a kanonikus zár alatt, csak hiányában INSERT.
   - `account-store.ts` `listEmailCollisions` + `admin-routes.ts` `GET /email-collisions`.
   - `source/scripts/run-learning-db-tests.ts`: 0045 a migrációs fájlból, kétszer.
   - `source/tests/no-real-emails-guard.test.ts`: az új szintetikus Gmail-szavak a fájlra szűkített listára.
   - A régi, „két alias két fiók” elvárású tesztek az új szabályra igazítva (Gmail-aliasok egy fiók; más domain `+címke` külön).
4. **GREEN**: `npm --prefix source test` érintett fájljai + `test:learning-db` zöld; `npm run gate:stage`.
5. Kapuk: `gate:push` → `local-review.mjs` → PR-leírás → `gate:pr` → push → PR → CI → bot-szálak → `pre-merge-gate.mjs`. Merge NEM.

## Végrehajtási napló

- 2026-11-23 — terv + végrehajtási utasítás kész; RED/GREEN eredmények a PR-leírásban.
- 2026-11-23 — review #554 (Codex P1/P2, Copilot, Vercel): (1) `users` admin-tiltás postafiókra (`userBannedSql`,
  `mailboxKeySql`) belépéskor és kérésenként; (2) törléskor az alias függő kódjai is; (3) részleges index helyett
  (email_key, email_key_dup) egyedi index — a jelölt csoport mellé sem fér új alias, és a keresést is kiszolgálja. RED: a két
  új DB-teszt a régi szerverkóddal bukott; GREEN: `test:learning-db` 267/267.
