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

## D1H-1 — kész (#594, 8a83c4c3)

## D1H-2 — fénykép / nehezen rajzolható ábra kivágása KÉP forrásból
1. RED: `source/tests/source-image-crops.test.ts`:
   - leltár: a `photo` fajta (`data.depicts`) és a nem kötelező `crop` ({x, y, w, h}, 0–1 arányok; hibás alak → a keret elmarad,
     a tétel marad); a leltár-szerződés kimondja a `photo`-t és a `crop`-ot; a rajzoló promptok leltára a `photo` tételt nem kapja;
   - `placeSourceImages`: képfájlból a keret szerinti rész kivágva (WEBP, ≤ 1600 px), a tárba téve, a `sourceImage` blokk a
     fogalmakat tanító fejezetbe kerül `sourceVisualId`-val; forrásmegjelölés: webes forrásnál a W1b fejlécéből (URL + cím), feltöltöttnél
     a fájlnév; keret nélküli tétel, PDF-forrás (D1H-3) és a már megrajzolt ábra kimarad; legfeljebb 6 kép; a lecke sémája érvényes;
   - `dropUnknownSourceImages`: a tárban nem létező azonosítójú `sourceImage` blokk eldobva (a modell által kitalált azonosító);
   - forrásfedettség: a `photo` és a `diagram` tétel a rá hivatkozó `sourceImage` blokkal „megjelent”;
   - kapcsoló: `STUDIO_SOURCE_IMAGES` csak pontos `on`-ra BE.
2. GREEN: `shared/source-visuals.ts`, `server/studio/source-image-crops.ts`, `server/source-images.ts` (létező azonosítók),
   `server/studio/step-io.ts` (prompt-leltár), `server/studio/gates/source-coverage-gate.ts`, `server/studio/single-run/engine.ts`
   (az ábra-forduló után, kapcsoló + forrásvizuál BE mellett), `server/studio/pipeline-store.ts` (mentési határ).
3. Próbahiba commit után; kapulánc; PR.

## D1H-2 — kész (#596, 5d91d7cb)

## D1H-3 — kivágás PDF-oldalból
Döntés: a PDF-oldal raszterizálása a meglévő `pdfjs-dist` (3.11, legacy) + új, ELŐRE FORDÍTOTT natív függőség: `@napi-rs/canvas`
(nincs fordítás a Renderen; a platform-bináris opcionális függőségként jön). Kísérlet (2026-11-25, scratch): a vektoros alakzat és a
szabványos betűs szöveg is kirajzolódik (`standardFontDataUrl` a csomag `standard_fonts` könyvtárára).
1. RED: `source/tests/pdf-page-render.test.ts` — a megadott oldal képpé (PNG) a hosszabb oldalon ≤ 2400 px; nem létező oldal és nem
   PDF → hiba; a `placeSourceImages` PDF-forrásnál a keret szerinti részt vágja ki (a kivágás helye színnel ellenőrizve), a
   forrásmegjelölés oldalszámot kap (feltöltöttnél „…, N. oldal”; webes szkennelt PDF-nél a W1b-fejléc); egy futásban az oldal egyszer
   raszterizálódik.
2. GREEN: `server/studio/pdf-page-render.ts`, `server/studio/source-image-crops.ts`, `package.json` (`@napi-rs/canvas`).
3. Próbahiba commit után (külön, leválasztott munkafán, ha a lánc fut); kapulánc; PR.

## D1H-4
A D1H-3 beolvadása után: `STUDIO_SOURCE_IMAGES=on` élesben, mérés egy valódi (képes PDF + webes kép) leckén.
