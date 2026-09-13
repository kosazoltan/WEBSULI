# WebSuli tananyagkészítő pipeline — állapotátadás

**Dátum:** 2026-09-13 17:45 UTC

**Repo:** `D:\repo\WEBSULI`

**Ág / HEAD:** `main` / `76d7a6d80fca78c5a27bf7e57799296878da970b`

## Átadási összefoglaló

A projekt kódja a 7.4-es tananyag-minimumokat és a régi, hibás internetes HTML-ek látható minőségjelzését tartalmazó éles állapotban van. Az ellenőrzött éles `/api/health` válasz revíziója `76d7a6d80fca78c5a27bf7e57799296878da970b`.

A legutóbbi kifejezett új témához, **Egervár ostromához**, nincs mentett pipeline-futás. Új Egervár-tananyag nem készült, kézi tananyagírás nem történt, és a jelenlegi ellenőrzés nem írt az éles adatbázisba.

## Ellenőrzött tesztelési állapot

### PASS

- `node --import tsx generation-release-preflight.local.mts` — exit 0; `unfinishedJobs: []`, `webRuns: []`, `productionWrites: 0`.
- Teljes helyi `npm.cmd run verify` — PASS; a 7.4-es kiadási ciklusban típusellenőrzés, lint, unit tesztek és build is lefutott.
- HTML-perzisztencia célzott Playwright-próba — PASS, 10/10.
- A legutóbbi éles minőségellenőrzésben a 45/75 bank, 15/25 kör, tíz módszertípus, kapukérdések, forrásbizonyíték és lektori kapu regressziói ellenőrizve lettek.
- Az éles régi Trója-előnézet betöltése böngészőben — PASS technikai megjelenítésként; a tartalom minőségét a kapu továbbra is hibásnak jelöli.

### Ellenőrzött, de nem új gyártási bizonyíték

- A régi Trója/Odüsszeusz rekord azonosítója: `b1ba2127-76e3-48fe-bde3-797179f77d9f`.
- Állapota lezárt (`done`), régi `fusion-7.4-2`, 17 szöveges feladat és 34 kvízkérdés, hiányzó `sorting` módszerrel és csak egy kapukérdéssel.
- A rekord olvasható maradt, de az előnézet egyértelműen közli, hogy nem új, ellenőrzött kiadás. Ezt a tananyagot nem szabad új Egervár- vagy Trója-futás alapjaként elfogadni.
- A korábbi angol webes futás (`af8ef8c4-41b8-466c-8acc-d008551c00de`) szintén lezárt; ez nem kapcsolódik az Egervár-feladathoz.

## NOT RUN / nyitott feladatok

1. **Egervár új internetes tananyagának tényleges indítása és végigfuttatása** — NOT RUN.
2. Forráskeresés, tényleges forrásszöveg-letöltés, szerzői jelölt, bankgyártás, független lektor, publikáció és éles visszaolvasás — NOT RUN az Egervár-témában.
3. Valós, hitelesített admin-munkamenetben történő folytatás — BLOCKED: a jelenlegi Chrome-munkamenet nem adminisztrátori; az admin útvonal a nyilvános oldalra irányít.
4. Máté Szilvia aktuális Gmail-címének whitelist- és teljes adminjogosultság-ellenőrzése — ebben a munkamenetben nincs friss, hitelesített eredmény; jogosultságot nem módosítottunk.
5. Az önkorrekciós/tanulási mechanizmus hibaarány-csökkenése — a futó runtime-tudástár bekötése ellenőrzött, de új Egervár-futásból még nincs mérés.

## Kötelező folytatási sorrend

1. Adminisztrátori bejelentkezés után nyisd meg a WebSuli Tananyag Studio webes készítőjét.
2. Indíts **új** internetes kutatási futást Egervár ostromáról; régi Trója- vagy más tananyag ne legyen bemenet.
3. A pipeline saját QMD/IAM/Cogni/Kanban/MEMORY/SOUL/RUNBOOK/SKILL tudástárát és mentett checkpointjait használja.
4. A rendszer az évfolyamot a forrásból állapítsa meg, és ehhez igazítsa a nyelvezetet, színintenzitást, betűméretet, szemléltetést és feladattípusokat.
5. Publikáció előtt minden kapu legyen sikeres: ténylegesen letöltött források, teljes tanítás, 45 egyedi szöveges feladat, 75 egyedi kvízkérdés, 15/25-ös teljes kör, mind a tíz módszertípus, legalább két különböző kapukérdés és független lektori elfogadás.
6. Hiányzó bank, módszer, kapukérdés, forrásbizonyíték vagy lektori hiba esetén a futás álljon meg; ne legyen kézi pótlás és ne legyen „kész” jelzés.
7. A kész jelöltet csak szerveroldali mentés, teljes kapu, publikáció és éles API/HTML visszaolvasás után lehet elfogadni.
8. Ezután valódi Chrome-ellenőrzés szükséges legalább 390, 844 és 1440 px nézetben: minden fejezet, mind a tíz módszer, a 15/25-ös kör, teljes bank, válaszmegőrzés, külső túlcsordulás és JavaScript-hiba.

## Fontos korlátok

- A helyi szintetikus fixture, a `tmp/quality-grounded-accepted` és a korábbi Trója-jelölt nem tekinthető új Egervár-tananyag bizonyítékának.
- A zöld unit vagy szerkezeti teszt önmagában nem jelent pedagógiai elfogadást vagy éles publikációt.
- A jelenlegi handoff létrehozása dokumentációs művelet; tananyag- és adatbázis-írás nem történt.

## Kapcsolódó állapotnaplók

- `docs/handoffs/2026-09-12-lesson-quality-v74.md`
- `docs/handoffs/2026-09-12-final-pipeline-acceptance.md`
- `docs/handoffs/2026-09-12-upload-acceptance.md`
- `docs/specs/2026-09-13-stale-web-lesson-quality-gate.md`
- `docs/lesson-improvement.md`
