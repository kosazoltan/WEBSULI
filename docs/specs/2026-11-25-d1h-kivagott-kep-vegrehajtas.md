# D1H — végrehajtási utasítás

Terv: `docs/specs/2026-11-25-d1h-kivagott-kep.md`.

## D1H-1
1. RED: `source/tests/source-image-schema.test.ts` (a `sourceImage` paraméterei: `imageId` sha256-hex, `alt` 1–200, `credit` 1–200,
   `sourceUrl` https vagy hiányzik; kapcsoló KI → a modell sémája nem fogadja el); `source/tests/source-images-db.integration.ts`
   (tárolás idempotens a tartalomcímre; a végpont a képet a helyes MIME-vel, `nosniff`-fel, hosszú gyorsítótárral adja; hibás
   azonosító 400, ismeretlen 404); e2e: `source/tests/lesson-source-image.spec.ts` (a lecke a képet alt-tal és forrásmegjelöléssel mutatja).
2. GREEN: `shared/lesson-schema.ts` (`ANIM_KINDS` + `sourceImage`), `shared/lesson-visual-params.ts` (paraméterséma),
   `migrations/0049_lesson_source_images.sql` + `shared/schema.ts`, `server/source-images.ts` (tárolás + végpont), kliens megjelenítő.
3. Próbahiba commit után; kapulánc; PR.

## D1H-2 … D1H-4
A D1H-1 beolvadása után, ugyanebben a fájlban részletezve.
