# D1H — a forrás fényképei és nehezen rajzolható ábrái kivágott képként, forrásmegjelöléssel

Forrás: tulajdonosi döntés 2026-11-24 (D1 módosítva HIBRID-re): „táblázat / folyamatábra újrarajzolva, fénykép és nehezen rajzolható
ábra kivágott képként átemelve forrásmegjelöléssel”. Ez felülírja a 2026-11-18-i D1 „A” döntést (`2026-11-18-tananyag-gyartas-
minoseg.md` 9. pont: „kivágott kép nem”). A követelmény-revízió (#5/#6) lelete: D1-HIBRID hiányzó — a leckeséma csak újrarajzolt
ábrát ismer (`SOURCE_VISUAL_ANIM_KINDS`), képtárolás és képes leckeelem nincs.

## Cél
A forrás vizuális leltára (1. állomás, `SOURCE_VISUALS_CONTRACT`) a fényképet és a nehezen rajzolható ábrát kivágási kerettel jelöli; a
program a forrásfájlból (kép vagy PDF-oldal) kivágja, tárolja, és a lecke egy `sourceImage` elemben, forrásmegjelöléssel mutatja.
A táblázat, folyamat, döntési fa, szabálydoboz, képes kártya továbbra is újrarajzolva.

## Döntések (a tulajdonosi döntés végrehajtási részletei)
- Tárolás: a kivágott kép bájtjai az adatbázisban (`lesson_source_images`, tartalomcímzett: sha256), legfeljebb 1600 px hosszabb
  oldal, WEBP; végpont `GET /api/source-images/:id` (nyilvános, változatlan → hosszú gyorsítótár, `nosniff`).
- Forrásmegjelölés kötelező: a webes forrásnál az URL és a cím, a feltöltött forrásnál a fájlnév és (PDF-nél) az oldalszám.
- Kapcsoló: `STUDIO_SOURCE_IMAGES` (alapból KI; a D1H-4 élesíti mérés után). KI állapotban a gyártás változatlan.
- A régi kliens az ismeretlen ábrafajtát ma is kihagyja (`ANIM_KINDS` szűrés) — a lecke nem törik el.

## Szeletek
- **D1H-1:** séma (`sourceImage` ábrafajta + paraméterek), tárolás (migráció 0049), végpont, lejátszó-megjelenítés (figure + forrás).
- **D1H-2:** a leltár `photo` fajtája és a `box` kivágási keret (fénykép / nehezen rajzolható ábra); kivágás KÉP forrásból (sharp),
  a gyártás a leltár-azonosító alapján tölti a paramétereket (a modell nem ír képazonosítót); hiányzó kivágás → az elem kimarad.
  A lecke mentésének határa eldobja azt a `sourceImage`-et, amelynek azonosítója nincs a tárban (a modell által kitalált azonosító
  így nem juthat a leckébe). A D1H-1-ben a fajta a gyártó promptjaiban nem hirdetett, és a lejátszó a betölthetetlen képet elrejti.
- **D1H-3:** kivágás PDF-oldalból: az oldal raszterizálása (pdfjs + szerveroldali vászon), majd ugyanaz az út.
- **D1H-4:** élesítés a kapcsolóval, mérés egy valódi leckén (képes PDF és webes kép).

## Elfogadás (összesen)
- A forrás fényképe a leckében kivágott képként, alt-szöveggel és forrásmegjelöléssel jelenik meg; a táblázat újrarajzolt marad.
- A kép nélküli / kivágás nélküli `sourceImage` elem nem kerül a leckébe; KI kapcsolónál a gyártás bájtra azonos.
- Biztonság: csak a forrásfájl bájtjaiból vágunk (nincs külső letöltés a gyártásban); a kép mérete, típusa korlátozott; a végpont
  csak tartalomcímzett azonosítót fogad.
