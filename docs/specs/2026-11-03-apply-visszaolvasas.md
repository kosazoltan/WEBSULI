# Lecke-javítás alkalmazása: hamis „eltér a jelölttől” hiba borítóváltáskor

Éles lelet 2026-11-03 (Antigoné célzott javítása, improved file `bb9dca4d…`): az „Alkalmazás” 500-at adott
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
- A visszaolvasás a tranzakció által ténylegesen írt állapotot igazolja: a lecke hash-e = az alkalmazáskori mentés
  `expectedCurrentHash`-e, ÉS a lecke az `art` mezőn kívül megegyezik a jelölttel.
- Az alkalmazáskori mentés: az adott javításhoz (`improvedFileId`) tartozó LEGKORÁBBI mentés (egy későbbi visszaállítás
  is ugyanezzel az `improvedFileId`-vel ír mentést, annak `expectedCurrentHash`-e a visszaállított állapoté).

## Nem-cél
- Az arculatválasztás (`withLessonArt`) és a tranzakció logikája változatlan.
- A HTML-anyagok ágának visszaolvasása változatlan.

## Edge case-ek
- Nincs mentés vagy nincs benne `expectedCurrentHash` → hiba (nem igazolható).
- A lecke a jelölthöz képest az `art`-on kívül is eltér → hiba.
- Visszaállítás utáni ismételt alkalmazás-kérés → hiba marad (a lecke már nem a jelölt) — ez helyes.

## Elfogadás (EARS)
- HA a mentett lecke = `withLessonArt(jelölt)` és a mentés hash-e egyezik, AKKOR a visszaolvasás sikeres akkor is, ha az `art` eltér a jelöltétől.
- HA a lecke tartalma (az `art`-on kívül) eltér a jelölttől, AKKOR hiba.
- HA nincs alkalmazáskori mentés, AKKOR hiba.
- HA több mentés tartozik a javításhoz, AKKOR a legkorábbi hash-e számít.
- Élesben a `bb9dca4d…` alkalmazásának újrakérése a deploy után sikeres választ ad, és a futás `done` állapotú.
