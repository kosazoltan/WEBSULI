# Végrehajtás — leckénkénti borítókép (terv: `docs/specs/2026-11-03-leckeborito.md`)

Munkakönyvtár: `source/`. Tananyag-generálás és szövegmodell-hívás nincs; fizetős hívás csak a képgyártás.

## T1 — leckék kiolvasása és képtervek
- Csak olvasó kivonat (`withReadOnlyDb`) minden publikált leckéről: cím, tantárgy, évfolyam, fejezetcímek, az első magyarázatok eleje;
  tartalomkulcsonként egy sor (Antigoné nélkül).
- Kulcsonként egy `design-assets/prompts.json` tétel: `id` = `lessonCoverId`, `kind: cover`, sáv, `subjects` (a lecke tantárgya),
  `keywords` (a cím), magyar `alt`, `aspect_ratio: "3:2"`, a kivonat alapján kézzel írt angol jelenetleírás (a terv szabályai szerint).
- Ellenőrzés: `npx tsx scripts/design-assets/generate.ts --only <id-k> --resolution 1K --dry-run` → „N kép · ≈ 0,045·N USD”.

## T2 — képek és szemle
- `generate.ts --resolution 1K` (új kapcsoló; alapértelmezés 2K marad) kötegekben; `review-page.ts` válogatóoldal; a feliratos,
  idegen tartalmú vagy ijesztő képek újragenerálása (javított leírással).
- Ellenőrzés: minden kulcshoz pontosan egy elfogadott jelölt a választás-JSON-ban.

## T3 — jóváhagyás
- `approve.ts <választás.json>` → `client/public/design/<sáv>/cover-l-*.webp` + katalógus.
- Ellenőrzés: `git diff shared/design-asset-catalog.ts` csak hozzáadás; `tests/design-assets.test.ts` zöld (séma, fájlok).

## T4 — választó- és védőlogika
- `shared/lesson-cover.ts` (`lessonCoverId`, `isLessonCoverId`); `shared/design-assets.ts` (`pickLessonArt` kulcsos borító elsőbbsége,
  `pictureFits` a `cover-l-*` képre); `shared/lesson-art-compute.ts` (`pinned`); `server/design-assets.ts` `withLessonArt` átadja a
  korábbi `art.picture`-t.
- Ellenőrzés: `node --import tsx --test tests/lesson-cover.test.ts tests/cover-gorog-drama.test.ts tests/design-assets.test.ts` → `ℹ fail 0`.

## T5 — csereszkript
- `scripts/design-assets/pin-lesson-covers.mts`: próbafutás / `--write <mentés.json>` / `--restore <mentés.json>`; a tiszta tervező és
  hash-ellenőrző mag `scripts/design-assets/pin-lesson-covers-lib.ts`, tesztje `tests/pin-lesson-covers.test.ts`.
- Ellenőrzés: a teszt (csak `art.picture` változik, hash-eltérés → hiba, Antigoné kimarad, visszaállítás) zöld.

## T6 — kapuk és élesítés
- `npm test`, `npx tsc --noEmit` (+ `-p tsconfig.test.json`), `npx eslint client/src server --max-warnings 0`, `npm run build`.
- PR → CI → merge; Render-revízió = merge commit (`https://websuli.vip/api/health`); `https://websuli.vip/design/<sáv>/cover-l-….webp` 200.
- Ezután a csere: próbafutás → `--write` → leckénkénti hash-egyezés a kimenetben; mintaleckék a böngészőben 390 és 1280 px-en.
