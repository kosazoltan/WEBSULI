# Átadás gépleállítás előtt — tananyagkészítés és előnézet

Dátum: 2026-09-11. Munkakönyvtár: `D:\repo\WEBSULI`.

## Folytatás első lépése

Olvasd el ezt a jegyzetet, az aktuális `AGENTS.md` fájlt, a lent hivatkozott specifikációkat és a Git állapotát. A felhasználó gépleállítást kért: az átadáskor új merge vagy deploy nem indult. A korábbi „lint merge push deploy” felhatalmazás a javítás folytatására megvan.

**A tananyagkészítés javítása már éles. Az előnézet további javítása még PR-ban van, nincs élesítve.** A kettőt ne mosd össze. A már elkészült leckét nem kell újragenerálni.

## Git és CI — utolsó ellenőrzött állapot

- Ág: `codex/material-preview-runtime`, az origin ággal egyezik.
- HEAD: `631f1ef080ad72d5c46fb9dff49b01e67f70cee6` — commitolva és feltöltve.
- Nyitott PR: [#56](https://github.com/kosazoltan/WEBSULI/pull/56).
- Ennek a pontos commitnak a CI-futása: [34607688202](https://github.com/kosazoltan/WEBSULI/actions/runs/34607688202).
- Utolsó lekérdezés: Lint & Typecheck PASS, Unit Tests PASS, Playwright E2E még fut. A teljes CI ekkor még NEM zöld.
- Megőrzendő, ismeretlen eredetű untracked elemek: `.codex/`, `tmp-e2e-b7c2d.txt`, `tmp-e2e-b7c2d2.txt`, `tmp-e2e-b7c2d3.txt`.
- Ez az átadási fájl helyben van mentve; a leállítás előtt nem indítunk miatta új push-t és CI-t.

## Már elkészült, éles javítás — PR #55

[PR #55](https://github.com/kosazoltan/WEBSULI/pull/55) merge commitja és a legutóbb ellenőrzött frontend/backend éles verzió:
`a8c1c2e1a1971677c0165bb03f61e76fa24dce45`.

A két szolgáltatás egyező verzióját 13:36:02 UTC-kor ellenőriztük. Bizonyíték: `tmp/generation-diagnosis/deployment-evidence.json`.

Bizonyított korábbi hiba: a böngészőhöz kötött internetes tananyagkészítés két teljes HTML-javítási kör után, kb. 928 másodpercnél terminális eredmény és mentett tananyag nélkül szakadt meg. A kapcsolatot lezáró infrastruktúra-elem pontos azonosítása NEM bizonyított. A minőségellenőrzés elrejtette a részletes sémahibákat, és a prompt egy már elavult `hasOwnWord` pontozási szabályt is tartalmazott. Nem bizonyított általános Chrome/Comet fájlengedély-hiba.

A javítás:

- Tartós szerveroldali feladat, a böngésző csak követi az állapotot; újratöltés után ugyanahhoz a futáshoz kapcsolódik vissza.
- Idempotens kérésazonosító és felhasználónkénti elkülönítés, ismételt kérésből nincs új AI-futás.
- `running → ready → done` állapotok, validált eredmény tartós mentése és tranzakciós közzététele.
- Sikertelen közzététel után a már elkészült eredmény új AI-hívás nélkül menthető újra.
- Pontos sémahiba, tokenmennyiség, időtartam és megállási ok eltárolása; szigorú tartalmi séma megmaradt.
- A HTML-pontozási prompt összhangba került a tényleges pontozóval.

Érintett fő fájlok: `source/server/studio/web-research-runner.ts`, `web-research-jobs.ts`, `web-research-job-store.ts`, `web-research-routes.ts`; `source/shared/web-research-job.ts`; `source/client/src/components/studio/WebResearchAgentPanel.tsx`; `source/server/improve/verify-lesson-method.ts`; `source/server/ai/lesson-html-spec.ts`.

Terv és végrehajtás: `docs/specs/2026-09-11-web-research-background.md`, `docs/specs/2026-09-11-web-research-background-vegrehajtas.md`. Tartós módszertan: `docs/lesson-improvement.md`.

PR #55 ellenőrzése: CI 34604407515 PASS; lint/typecheck, 1139 unit teszt, 136 Playwright teszt. Külön PostgreSQL tranzakciós/visszagörgetési és konkurenciaellenőrzés is PASS; az izolált tesztkonténerek eltávolítva.

## Valódi éles eredmény — már automatikusan elmentve

[Az új angollecke megnyitása](https://websuli.vip/preview/af8ef8c4-41b8-466c-8acc-d008551c00de).

Az eredeti kérés: „Keres Magyarországi Nat2020 Általános Iskola 4. Osztály. Szeptember hónapban vett angol gyakorló tananyagot és készíts belőle. A gyermek részére megfelelő tananyagot.”

- Valódi Chrome-indítás élesben: 13:39:07 UTC. Cím: Angol gyakorlás.
- 16 forrás, 338171 ms (5 perc 38 másodperc), 29994 kimeneti token, `end_turn`.
- Első kísérletre elkészült, javítókör nélkül; állapot `done`, automatikus mentés.
- A gyártás közbeni tényleges böngésző-újratöltés után ugyanaz a futás sikeresen folytatódott.
- Nyilvános API és adatbázis tartalma egyezik; szigorú kapu `ok: true`, hibák nélkül.
- 4. osztály, 12 fogalom, 8 módszer, 12 feladat (köztük 4 szóbeli), 24 kvízkérdés.
- Tartalom SHA-256: `e5fa8f1cd37fb718bab942958f663a6a184a4bcdc57f321e523d78a709b3c883`.
- Üres feladatok: 0/12; mintaválaszok: 12/12; részleges válasz: 11,5/12; teljes kvíz: 24/24. Hibás első kvízválasz utólagos átjelölése nem ad pontot.
- A négy lap működött, Nunito betöltődött és a magyar ékezetek megjelentek. 390×844, 844×390 és 1440×900 Chrome nézetben vízszintes túlcsordulás nem volt.
- Régi tananyag nem lett felülírva.

Bizonyítékok: `tmp/web-research-diagnosis/background-live/` (job, progress, candidate); `tmp/web-research-diagnosis/live/` (published.html, data.json, readback.json, score-evidence.json, render-evidence.json és képernyőképek).

## PR #56 — kész kód, hátralévő merge/deploy/éles ellenőrzés

A valódi új lecke próbáján két további hiba igazolódott: `logger is not defined` a szerver által HTML-be injektált segédben; fekvő mobilnézetben a 400 px minimális iframe-magasság kilógott a 390 px magas ablakból.

Módosítások:

- `source/server/routes.ts`: kizárólag a böngészőbe injektált szöveges sablonokban hét `logger.*` hívásból `console.*` lett. A szerveroldali logger megmaradt. Tárolási és beszédfelismerési hibakezelés is érintett.
- `source/client/src/pages/Preview.tsx`: HTML-előnézet teljes rendelkezésre álló dinamikus magasságban, fejléc a normál elrendezés része, `min-h-0`, iframe 400 px minimum nélkül. A strukturált LessonView megmaradt.
- `source/client/src/App.tsx` és `source/client/src/index.css`: a külső keret és a body is dinamikus mobilmagasságot használ, régi böngészőhöz megmaradó 100vh tartalékkal.
- `source/tests/preview-navigation.spec.ts`: a tényleges szerveroldali sablonokat AST-ből kiolvasó teszt, három ablakméret, tárolási fallback, diktálási jogosultságmegtagadás és inicializálási hiba, nagyobb 100vh és hiányzó dvh támogatás szimulációja. A meglévő strukturált előnézeti tesztek megmaradtak.
- Specifikáció: `docs/specs/2026-09-11-material-preview-runtime.md` és `docs/specs/2026-09-11-material-preview-runtime-vegrehajtas.md`.

Ellenőrzések:

- Az első PR #56 commiton (`bd4b0b9add203aa47f40e7d3ade9f8c997ab9e5c`) teljes helyi `npm.cmd run verify` PASS, 1139 unit; a 34606778272 CI is PASS.
- A review három érdemi észrevétele (régi böngésző tartalék, külső 100vh keretek, diktálási hibaágak tesztje) javítva a jelenlegi `631f1ef` commitban.
- A jelenlegi commiton 10 célzott Chrome-teszt PASS (8,3 s); `npm.cmd run check`, `check:test`, `lint`, `git diff --check` PASS.
- A jelenlegi teljes CI E2E része az átadáskor még futott; a korábbi commit zöld eredménye nem helyettesíti ezt.
- Fizikai mobil/Safari próba NEM FUTOTT; Chrome ablakméretek és célzott CSS-szimuláció futott.
- A PR #56 javítása utáni valódi éles ellenőrzés NEM FUTOTT, mert még nincs élesítve.

## Folytatási sorrend

1. Git státusz, HEAD és PR #56 legújabb review/CI állapot ellenőrzése. A `34607688202` eredményét olvasd vissza; bukás esetén a konkrét okot javítsd. Ne feltételezd a végső tesztszámot.
2. Újabb élesítés előtt olvasási preflight a `source` könyvtárból: `node --import tsx generation-release-preflight.local.mts`. Aktív tananyagkészítést ne szakíts meg deployjal.
3. Zöld, pontos commitra vonatkozó CI és rendezett review után PR #56 merge, majd main frissítés `git pull --ff-only` paranccsal. Nincs `--admin` vagy `--no-verify` kerülőút.
4. Frontend ÉS backend verziókövetés: `node --import tsx generation-deploy-watch.local.mts <MERGE_SHA>`. Mindkettőn az új merge commit legyen ellenőrizve.
5. A már elmentett angollecke visszaolvasása: `node --import tsx web-research-readback.local.mts af8ef8c4-41b8-466c-8acc-d008551c00de`.
6. Valódi éles render: `node --import tsx web-research-render.local.mts`; pontozás: `node --import tsx web-research-score.local.mts`. Képernyőképek megtekintése, mind a négy lap és a három ablakméret ellenőrzése.
7. A render helper utólag szigorított hibamentesség/külső scroll/iframe-határ ellenőrzése, illetve a score helper új CDP-alapú tényleges fontvizsgálata MÉG NEM FUTOTT. Ha a CDP segédtechnikája hibás, a tesztsegédet vizsgáld, ne jelents automatikusan termékhibát.
8. Rövid záró jelentés az új lecke linkjével, mért futási adattal, valódi PASS/FAIL eredményekkel és a tényleges deploy verzióval.

## Visszaállítás, biztonság, helyi eszközök

- PR #56 előtti visszaállási kódverzió: `a8c1c2e1a1971677c0165bb03f61e76fa24dce45`. Ez a javítás nem végez adatbázis-migrációt, a már mentett új lecke megmarad.
- Előző mentés: `tmp/generation-diagnosis/before-generation-2026-09-11T13-26-53-505Z.dump`; 6284445 bájt, 37 tábla. Izolált PostgreSQL visszaállítás ellenőrizve (176 anyag, 16 lecke), éles írás nélkül. Ez az új angollecke ELŐTTI mentés; annak külön readback JSON/HTML példánya is megvan.
- A `source/*.local.mts` segédek Git által figyelmen kívül hagyott helyi fájlok. A fenti parancsokat a `D:\repo\WEBSULI\source` könyvtárból futtasd.
- Célzott előnézeti teszt: `npx.cmd playwright test --config playwright.preview.local.mts --reporter=line` (Vite fixture, nem az éles adatbázishoz kapcsolt Express).
- **Ne indíts teljes helyi Express szervert az éles `.env` adataival:** az indulási job-takarítás éles állapotot módosíthat. Titkokat, környezeti értékeket ne írj ki.
- A helyi ellenőrző folyamatok befejeződtek. A 14:02:25 UTC preflight szerint nincs befejezetlen gyártás és nincs aktív webes tananyagfutás (`unfinishedJobs: []`, `webRuns: []`, `productionWrites: 0`).
- A GitHub CI a gép leállítása után távol tovább futhat. Új élesítés az átadáskor nem indult.
- Böngészőfül-azonosítók újraindítás után nem megbízhatók; új leltárral indulj. Régi konzolhibákat időbélyeg nélkül ne tulajdoníts az új futásnak.
- Megmaradó architektúrális korlát: a böngésző újratöltése kezelt, de a szerverfolyamat AI-futás közbeni teljes újraindítása nem teljes AI-folytatás. Az elárvult futás 25 perc után kifejezett hibát kap. Ne állíts teljes tartós queue-garanciát.

## Rövid indító utasítás a következő munkamenetnek

„Folytasd a `docs/handoffs/2026-09-11-web-research-javitas.md` alapján. Először ellenőrizd a #56 PR pontos CI-ját és review-ját, majd zöld állapotban merge/push/deploy és a meglévő angollecke valódi éles mobil/asztali ellenőrzése következzen. Ne generáld újra a már elkészült leckét, ne indíts helyi Express-t éles környezettel, és őrizd meg az idegen untracked fájlokat.”
