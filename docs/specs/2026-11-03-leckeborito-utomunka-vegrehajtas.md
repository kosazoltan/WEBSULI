# Végrehajtás — leckeborító-utómunka (terv: `docs/specs/2026-11-03-leckeborito-utomunka.md`)

Munkakönyvtár: `source/`.

## T1 — képtervek és képek
- `design-assets/prompts.json`: a 4 leckeborító `prompt`/`alt` mezője a tanítószövegből újraírva; 3 új tétel az anyagokhoz
  (`lessonCoverId` a tantárgy + cím + sáv hármasból).
- `generate.ts --only … --resolution 1K` (tételenként 2 jelölt), szemle nagyítva, a jobb jelölt kiválasztása; `approve.ts`.
- Ellenőrzés: `git diff shared/design-asset-catalog.ts` — 4 bejegyzés módosul (prompt-lenyomat, dátum, alt), 3 új.

## T2 — anyag-borítók a főoldalon
- `shared/lesson-cover.ts`: `MATERIAL_COVERS` + `materialCoverId(fileId)` (csak katalógusban lévő borító).
- `server/storage.ts` `getAllHtmlFiles`: `cover: covers.get(id) ?? materialCoverId(id)`.
- `scripts/design-assets/pin-lesson-covers.mts`: a csere végén kiírja a főoldali lista frissülésének idejét (TTL).
- Ellenőrzés: `node --import tsx --test tests/material-covers.test.ts` → `ℹ fail 0`.

## T3 — kapuk és élesítés
- `npm test`, `npx tsc --noEmit` (+ teszt), `npx eslint client/src server --max-warnings 0`, `npm run build`.
- PR → CI → automatikus merge; Render-revízió; a 4 lecke és a főoldal 390 / 1280 px-en.
