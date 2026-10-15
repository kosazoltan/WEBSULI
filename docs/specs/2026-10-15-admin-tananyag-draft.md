# Megszakadt piszkozatok az adminfelületen — „Tananyag draft” (terv, 2026-10-15)

Tulajdonosi kérés (2026-10-15):
- Ha a gyártás megszakad, és a tanár csak később veszi észre, az addig elkészült tananyag is jelenjen meg az adminfelületen „Tananyag draft” jelzéssel.
- Ne kerüljön ki az éles oldalra.
- Bármikor folytatható legyen onnan, úgy, hogy minden addig elkészült szakasz munkája megmarad.

## Tények (a kódból)
- Az admin „Fájlok” lista és a nyilvános főoldal UGYANAZT a szűretlen `GET /api/html-files` végpontot használja (`server/routes.ts`, `storage.getAllHtmlFiles`).
- Piszkozatnak nincs `html_files` sora: az csak publikáláskor készül (`publishLesson`, `server/studio/step-runner.ts`). Ezért a piszkozat ma
  sehol nem látszik, csak a feltöltő űrlap aktuális futásánál.
- A piszkozat mentett részei (tanítás, kész bankcsomagok, `experienceCheckpoint.parts`) a `studio_jobs.output`-ban vannak. A folytatás a meglévő
  `POST /api/studio/jobs/:id/resume` út, ugyanazzal a döntéssel, mint a futásnézet (`resumeKindOf`, `planRecovery`, végrehajtási keret).
- A folytatás csak a job gazdájának megy (`driveTracked`: „A futás másik készítőhöz tartozik”).

## Cél
- Új, CSAK ADMIN végpont: `GET /api/studio/drafts`. A belépett admin saját piszkozatai: mentett lecke, nem publikált, nem sikeres, nem félretett,
  legújabb elöl, legfeljebb 50 darab. Minden tételhez:
  - cím, tantárgy és évfolyam;
  - a mentett részek száma;
  - a megállás lépése és oka;
  - folytatható-e;
  - fut-e éppen.
- Az admin „Fájlok” fül tetején „Tananyag draftok” blokk. Minden kártyán:
  - „Tananyag draft” jelvény;
  - mentett részek, megállás oka;
  - „Folytatás” gomb (csak folytathatónál);
  - futó jobnál „Folyamatban” jelzés, gomb nélkül.
- A folytatás a meglévő resume út: a kész szakaszok nem gyártódnak újra (ezt a meglévő folytatási logika biztosítja).

## Nem-cél
- Nincs `html_files` sor a piszkozatnak, mert a nyilvános lista kiszivárogtatná.
- Nincs piszkozat-előnézet a leckefuttatóban (külön szelet, ha kell).
- Más admin piszkozata nem látszik (a folytatás úgyis csak a gazdának menne).

## Edge case-ek
- Futó job (`status` pending/running): látszik, „Folyamatban” felirattal, gomb nélkül.
- Nem folytatható megállás (a tervező szerint nem végrehajtható): látszik, a gomb helyett a következő lépés indoka.
- Újragyártással félretett (`superseded`, `remanufactured`) job: nem látszik.
- Publikált lecke: nem látszik.
- Dupla kattintás: szinkron zár, egy kérés.

## Elfogadás (EARS)
- A1: HA egy saját job mentett, nem publikált leckével megállt, AKKOR a `GET /api/studio/drafts` visszaadja, a mentett részek számával és a folytathatósággal.
- A2: A publikált, félretett, sikeres, lecke nélküli és más gazdájú job NEM szerepel.
- A3: A nyilvános `GET /api/html-files` változatlan (piszkozat nem kerül bele).
- A4: Az admin „Fájlok” fülön a piszkozat „Tananyag draft” jelvénnyel látszik. A „Folytatás” a resume végpontot hívja (egyszer), utána a lista frissül.
- A5: Valódi böngészőben (390 és 1366 px) nincs átfedés, levágott szöveg vagy vízszintes görgetés.
