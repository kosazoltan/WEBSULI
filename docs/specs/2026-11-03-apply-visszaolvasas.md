# Lecke-javítás alkalmazása: hamis „eltér a jelölttől” hiba borítóváltáskor

Éles lelet 2026-11-03 (egy 9. évfolyamos irodalom-lecke célzott javítása, `<javítás-azonosító>`): az „Alkalmazás” 500-at adott
(„Az alkalmazott lecke eltér a jelölttől.”), pedig a tranzakció teljesen lefutott (lecke 2. verzió, mentés, kvízexport,
`status = applied`).

## Mért tények
- `server/studio/structured-improvement.ts` `applyStructuredImprovement`: a lecke a `withLessonArt(repair.candidate, …)`
  eredményét menti — az arculat (`art`) mentéskor újraválasztódik (review #274, spec 2026-10-17-lecke-betoltes). A mentés
  `backupData.expectedCurrentHash`-ként ennek a hash-ét rögzíti.
- `server/workflows/apply.ts` visszaolvasása a mentett `lessons.json` hash-ét a NYERS `repair.candidate` hash-éhez méri.
  Ha a mentéskori arculat eltér a jelöltben tároltól (új borító a katalógusban, évfolyamváltás), a két hash sosem egyezik:
  a munkafolyamat hibával zárul, a felület hibát mutat, bár a módosítás élesben van.
- Az ismételt kérés (`status = applied` ág) ugyanígy bukik, tehát a futás nem zárható le.

## Cél
- A visszaolvasás a tranzakció által ténylegesen írt állapotot igazolja: a lecke az `art` mezőn kívül megegyezik a jelölttel,
  ÉS a hash-ét a javítás (`improvedFileId`) valamelyik mentése `expectedCurrentHash`-ként rögzítette.
- Sorrendfüggetlen (review #378): a visszaállítás is ugyanezzel az `improvedFileId`-vel ír mentést, de annak hash-e a
  visszaállított állapoté, amely a tartalmi feltételen bukik — a mentések időrendje (azonos `createdAt`) nem számít.
- A leckét és a mentéseket egy `repeatable read`, csak-olvasó tranzakció pillanatképéből olvassa (review #378: közben lefutó
  visszaállítás ne keveredjen a régi sorral).
- A `canonicalJson` / `repairHash` semleges modulba (`server/lib/canonical-hash.ts`) kerül; a régi exportok megmaradnak.

## Nem-cél
- Az arculatválasztás (`withLessonArt`) és a tranzakció logikája változatlan.
- A HTML-anyagok ágának visszaolvasása változatlan.

## Edge case-ek
- Nincs mentés vagy nincs benne egyező `expectedCurrentHash` → hiba (nem igazolható).
- A lecke a jelölthöz képest az `art`-on kívül is eltér → hiba.
- Visszaállítás utáni ismételt alkalmazás-kérés → hiba marad (a lecke már nem a jelölt) — ez helyes.

## Elfogadás (EARS)
- HA a mentett lecke = `withLessonArt(jelölt)` és a hash-ét a javítás mentése rögzítette, AKKOR a visszaolvasás sikeres akkor is,
  ha az `art` eltér a jelöltétől.
- HA a lecke tartalma (az `art`-on kívül) eltér a jelölttől, AKKOR hiba.
- HA nincs a hash-t rögzítő mentés, AKKOR hiba.
- HA több mentés tartozik a javításhoz, AKKOR a sorrendjük nem befolyásolja az eredményt; visszaállított lecke nem igazolt.
- Élesben a 2026-11-03-i javítás alkalmazásának újrakérése a deploy után sikeres választ ad, és a futás `done` állapotú.
