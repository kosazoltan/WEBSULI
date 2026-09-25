# Spec: Internetes tananyag a feltöltős Studio-gyártással (2. szelet: módszer)

> Dátum: 2026-09-25 · Szerző: Claude Code (felhő-munkamenet) · Állapot: JÓVÁHAGYVA (tulajdonosi döntés 2026-09-25: „Csináld” a 1. szelet 9. pontjára)
> Előzmény: `docs/specs/2026-09-25-webes-gyartas-elakadas.md` (1. szelet, PR #125 → #127). Végrehajtás: `docs/specs/2026-09-25-webes-studio-atadas-vegrehajtas.md`.

## 1. Cél

Az internetes tananyagkészítés ugyanazt a módszert kapja, mint a feltöltött forrás. A program a forrásgyűjtés (web_search + web_fetch) után
a ténylegesen letöltött oldalak szövegét **szöveges forrásfájlként** átadja az egylépéses Studio-gyártásnak (`runOneStep`). A
feltöltős út adja a teljes módszert:
- forrásból megállapított tantárgy és évfolyam, és a tanár kérésében megadott évfolyam;
- kurált tudástár, forrás-helyesbítés;
- tervező, szerző;
- Opus magyarázó ábrák, vizuális világ;
- vak megoldó, bank-ellenőr, lektor, kapu;
- Studio-lecke (négylapos runtime).

## 2. NEM cél

- A forrásgyűjtés (Opus + web_search/web_fetch, `web-provider-turn` checkpoint) nem változik.
- Az egylépéses Studio-gyártás belső lépései és kapui nem változnak.
- A régi, önálló HTML-es webes út nem törlődik. `WEB_RESEARCH_PIPELINE=html` környezeti változóval visszakapcsolható; ez a visszavonási terv.
- A korábban elkészült webes HTML-leckék nem íródnak át.

## 3. Érintett területek

- `source/server/workflows/engine.ts` — `outsideWorkflow()`: a háttérben induló Studio-futás ne örökölje a webes workflow-környezetet.
- `source/server/studio/lesson-pipeline-routes.ts` — `startOneStepRun()` és `oneStepRunView()` export. A meglévő POST/GET útvonal is ezeket használja.
- `source/server/studio/web-research-runner.ts` — `gatherWebSources()` kiemelése. A régi út is ezt hívja.
- `source/server/studio/web-studio-handoff.ts` (ÚJ) — források → forrásfájlok (mérethatárral), a Studio-futás indítása és követése.
- `source/server/studio/web-research-jobs.ts` — a Studio-eredmény kezelése: nincs HTML-mentés; visszaolvasás és folytatás.
- `source/server/studio/web-research-job-store.ts` — `verifyStudioLesson()`.
- `source/server/studio/web-research-routes.ts` — a gyártó kiválasztása (`WEB_RESEARCH_PIPELINE`).
- `source/shared/web-research-job.ts` — `output?: "studio" | "html"`, `studioRunId?`.
- `source/client/src/components/studio/WebResearchAgentPanel.tsx` — kész Studio-lecke: megnyitás-link, nincs iframe-előnézet.
- Tesztek, dokumentáció (`docs/lesson-improvement.md`), LEDGER.

## 4. Rögzített döntések

1. Forrásfájl letöltött oldalanként: `kind: "text"`. A név az URL-ből képzett (`fetchedSourcesToExtractorFiles`). A tartalom első sora `Forrás: <URL>`, a második `Cím: <cím>`, utána a letöltött szöveg. Így az URL a tudástár forrásszövegében megmarad.
2. Mérethatár a tantárgy- és évfolyam-felismerő modell kerete miatt:
   - legfeljebb 60 000 karakter oldalanként;
   - legfeljebb 200 000 karakter összesen, a letöltési sorrendben;
   - üres oldal kimarad;
   - ha így egy forrás sem marad, a futás érthető hibával áll meg.
3. `OneStepRequest`: `title = input.title`, `instructions = input.message` (legfeljebb 4000 karakter), `files` = a fenti fájlok. A keresési korosztály csak a gyűjtés támpontja, az évfolyamot a Studio állapítja meg.
4. A Studio-futás a webes workflow-környezeten kívül indul (`outsideWorkflow`), saját `upload` workflow-val.
   - A webes job `studioRunId`-t tárol.
   - Folytatáskor az élő vagy kész futást követi, újat nem indít.
   - Hibás vagy parkolt futás után újat indít.
5. Követés:
   - 3 s-onként `oneStepRunView` a Studio-futás fázisával és részleteivel, mint státusz;
   - legfeljebb 120 perc;
   - `done` → eredmény (`lessonId`, `htmlFileId`);
   - `error` → `WebResearchFailure` a Studio hibaüzenetével;
   - `parked` → hiba a részletekkel.
6. A webes job a Studio-eredménynél nem ír `html_files` sort, mert a Studio már közzétette. Visszaolvasás: `verifyStudioLesson(htmlFileId, lessonId)`, vagyis a lecke publikált és a `html_files` sorra mutat. A workflow eredménye `{ kind: "material", id: htmlFileId }`. A web lépéssor változatlan (generate → knowledge → author → gate → publish → readback).
7. Alapértelmezett gyártó: `studio`. `WEB_RESEARCH_PIPELINE=html` → a régi `generateWebResearchLesson`.

## 5. Edge case-ek

- Minden letöltött oldal üres → a Studio indítása előtt hiba.
- Szerver-újraindulás a követés alatt → a webes workflow `interrupted`. Az 1. szelet szabálya szerint hiba, folytatással. A folytatás a mentett `studioRunId`-t követi. Ha azt a boot-söprés hibásnak jelölte, új futás indul.
- A Studio a tudástár-gyorsítótárból azonnal kész leckét ad → azonnali `done`.
- Régi (HTML) job olvasása és folytatása változatlanul működik.

## 6. Elfogadási kritériumok (EARS)

- WHEN a gyűjtés letöltött forrásokat ad THEN the system SHALL azokat URL-fejléccel, mérethatáron belül, `text` fájlként egylépéses Studio-futásnak átadni, a tanár üzenetével mint kéréssel.
- WHEN a Studio-futás `done` THEN the system SHALL a webes jobot `done`-ra állítani `materialId = htmlFileId`-vel, `html_files` írás nélkül, visszaolvasás után.
- WHEN a Studio-futás `error`/`parked` THEN the system SHALL a webes jobot a Studio okával hibára állítani.
- WHEN egy hibás webes jobot folytatnak és a mentett Studio-futás még fut vagy kész THEN the system SHALL azt követni, újat nem indítani.
- WHEN `WEB_RESEARCH_PIPELINE=html` THEN the system SHALL a régi önálló HTML-es utat futtatni.
- WHEN a panel kész Studio-jobot kap (HTML nélkül) THEN the panel SHALL a megnyitás-linket mutatni, hibajelzés nélkül.

## 7. Tesztterv

- `tests/web-studio-handoff.test.ts`: fájlképzés (fejléc, határok, üres oldal); követés (done, error, parked, meglévő futás követése, időkorlát).
- `tests/web-research-jobs.test.ts`: Studio-eredmény → done `html_files` írás nélkül, visszaolvasás-hiba → error; folytatás a mentett `studioRunId`-vel.
- `tests/web-research-completion.spec.ts`: kész Studio-job a panelen (390/1440 px).
- Teljes kapu: check, check:test, lint, test, build.
- `tests/lesson-html-spec.test.ts` („a webes ügynök route-ja…”): a forrásszöveg-minta a kiemelés miatt a `gatherWebSources` → `downloaded` → `sources` láncra változik (ugyanaz az invariáns: a visszaadott forrás a letöltött oldal, nem a keresési találat).
- NOT RUN: éles internetes gyártás, mert nincs éles hálózat és kulcs a munkamenetben. Élő próbát a tulajdonos vagy egy helyi munkamenet futtathat.

## 8. Kockázatok / visszavonás

- A Studio-gyártás hosszabb (mérve 600–2300 s), mint a régi webes út. A követés 120 perces.
- A webes forrásszöveg zajos (menü, lábléc). A tudástár idézetellenőrzése szűr, és az igazolatlan fogalom nem kerül a leckébe.
- Visszavonás: `WEB_RESEARCH_PIPELINE=html` (kód nélkül), vagy a PR revertje.
