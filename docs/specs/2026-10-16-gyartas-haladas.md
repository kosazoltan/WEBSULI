# A tananyaggyártás észlelhetősége (haladásjelzés) — terv

Tulajdonosi kérés (2026-10-16): a draftból indított újragyártás nagyon hosszúnak és elakadtnak tűnt. Ellenőrzés (éles DB, csak
olvasás, job `b3c07512`): a futás nem akadt el; a workflow-lízing élt, a bankcsomagok készültek. A haladásjelző viszont 16:24 óta
ugyanazt a szöveget mutatta („Ábrák és gyakorlóbank készül…”), mert a motor a gyakorlóbank alatt nem jelez haladást. A
gyakorlóbank a leghosszabb szakasz: mérve 13 perc.

## Cél
- A gyakorlóbank alatt fejezetenként (bankegységenként) frissülő szöveg: „Gyakorlóbank: 2/5 fejezet kész — a 3. készül…”. Javító
  kísérletnél jelzés: „… a 3. fejezet javító kísérlete (2.)”.
- A lektori bankjavítás is jelezzen haladást.
- Az állomás javító fordulója is jelzés legyen.
- Az eltelt idő, az utolsó haladásjelzés óta eltelt idő, és az, hogy él-e a háttérfolyamat (workflow-lízing). Ez a futáskövetőben
  és a draftlista futó tételénél is látszik.
- A szerver számolja (másodpercben), így a kliens órája és az időzóna nélküli oszlopok nem torzítanak.

## Nem-cél
A gyártás sebessége, a lépések sorrendje, a modellhívások. Új adatbázisoszlop nem kell: a `one_step_runs` `started_at` és
`updated_at` mezője és a workflow-lízing elég.

## Érintett fájlok
- `server/studio/experience-builder.ts`: `onProgress`.
- `server/studio/single-run/engine.ts`: haladás-szövegek.
- `server/studio/lesson-pipeline-routes.ts`: futásnézet és draftlista.
- `shared/studio-ui.ts`: típus és szöveg-segéd.
- `client/src/components/studio/CreationProgress.tsx` és `DraftLessons.tsx`.
- Tesztek: unit, DB, e2e.

## Szélső esetek
- A folytatott bank (ellenőrzőpontból) a már kész egységeket is késznek számolja.
- Párhuzamos egységeknél (concurrency > 1) a darab legfeljebb az összes.
- Lejárt lízing futó fázisban: „a háttérfolyamat nem jelez”. Ez nem hibaállapot; a söprés zárja.
- Régi futásnál időadat nélkül nincs idősor (nem kitalált érték).

## Elfogadás (EARS)
- **Bank közben:** HA a gyakorlóbank egy egysége elkészül, AKKOR a futás részlete a kész / összes darabot mutatja.
- **Javító kísérlet:** HA a bank egysége javító kísérletbe lép, AKKOR a részlet ezt jelzi.
- **Futás nézete:** AMÍG a futás fut, a futásnézet és a draftlista futó tétele mutatja az eltelt időt, az utolsó jelzés óta eltelt
  időt és a háttérfolyamat élő voltát.
- **Telefon:** a telefon szélességén nincs vízszintes kilógás.
