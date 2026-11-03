# Végrehajtás — új leckék automatikus borítója (terv: `docs/specs/2026-11-03-leckeborito-auto.md`)

Munkakönyvtár: `source/`. Alap: a `feat/leckeborito` (PR #382) ága.

## T1 — közös hash-ellenőrzés a szerveren
- `server/lib/lesson-art-pin.ts`: `hashWithoutArt`, `pinnedArt`, `verifyPinned`, `SKIPPED_FILES` (a szkript-lib innen importál).
- Ellenőrzés: `node --import tsx --test tests/pin-lesson-covers.test.ts` → `ℹ fail 0`.

## T2 — adatbázisban gyártott borító megjelenítése és megtartása
- `shared/design-assets.ts` `resolveStoredArt`: katalógusban nem szereplő `cover-l-*` csak a lecke mostani kulcsával; tartalékkép.
- `shared/lesson-art-compute.ts`: kulcsszavas borító híján a táblában meglévő tartalomkulcsú borító; DB-s pin csak azonos kulccsal.
- Ellenőrzés: `node --import tsx --test tests/lesson-cover.test.ts tests/lesson-cover-auto.test.ts`.

## T3 — gyártó modul és háttérfolyamat
- `server/lesson-covers.ts`: kivonat → Haiku-képterv → Seedream 1K → Haiku-kapu → beszúrás → tranzakciós összekötés; plafon, vészfék.
- `server/index.ts`: indítás csak élesben, E2E-n kívül.
- `tests/s7-workflow-guard.test.ts` engedélylista: az új lecke-írás „scheduled” kategóriával (dokumentált spec-változás).
- Ellenőrzés: `node --import tsx --test tests/lesson-cover-auto.test.ts tests/s7-workflow-guard.test.ts` → `ℹ fail 0`.

## T4 — kapuk és élesítés
- `npm test`, `npx tsc --noEmit` (+ `-p tsconfig.test.json`), `npx eslint client/src server --max-warnings 0`, `npm run build`.
- PR → CI → merge; Render-revízió; a Render-napló „[lesson-covers] a leckeborító-háttérfolyamat elindult” sora.
