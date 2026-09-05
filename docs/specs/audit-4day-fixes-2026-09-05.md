# Spec: 4-napos fejlesztés-audit javításai (2026-09-02..09-05)

> Dátum: 2026-09-05 · Szerző: Hermes Agent · Állapot: JÓVÁHAGYVA (tulajdonosi utasítás: „a teljes javítás, merge, push, deploy engedélyezve ebben a sessionben")
> Kanban: WEBSULI #175 · Osztály: L (több modul, biztonsági határ, üzleti láncszem-pótlás)

## Mért jelenlegi állapot (2026-09-05, repóból + éles DB-ből)

Bázis: main `9f7060a`, `tsc` 0, lint 0 warning, unit 528/528, e2e 22/22, CI zöld, prod probék OK
(`/api/lessons` 200, `/api/studio/maps` 401, `/lesson/*` szigorú CSP Vercelről).

Élő Neon-mérés: `lessons` 2 sor, **mindkettő `published_at = NULL`**; `studio_jobs` utolsó
sikeres sora `step='gate', status='ok'`; `GET /api/lessons` → `{"lessons":[]}`; `coupons` 0 sor.
Azaz a LessonStudio 4 nap alatt leszállított teljes csővezetéke (extract→…→lektor) **soha
nem juttat el egy leckét a gyerekhez**: a `gate` lépésen a job örökre parkol, publikálási
végpont nincs, `html_files` sor (`contentType:'lesson'`) nem születik, így a lecke a
főoldalon/Preview-ban elérhetetlen, a kupon-lánc (Próba→kupon→játék) pedig el sem indulhat.

Három párhuzamos, olvasási audit (szerver-studio / kliens / szerver-egyéb) 55 findingot adott;
minden felvett tétel alább saját forrás-olvasással újra megerősítve (file:line). Elutasított
vagy halasztott tételek a 9. szakaszban, indoklással.

## 1. Cél

A négy nap fejlesztésének **üzleti láncszem-hiányait és a mért biztonsági/működési hibáit**
zárni úgy, hogy egy feltöltött forrásból a gyerek számára ténylegesen elérhető, publikált lecke
szülessen, és a jutalom-lánc (Próba → kupon → bónusz) valóban működjön.

## 2. NEM cél

- Új pipeline-lépés (gateHelper/quizPolish) modell-hívással; a kapu **determinisztikus** marad.
- Játék-logika átírása (WordLadder/Tsunami/BrainRot belső szabályai), kliens-oldali XP-védelem.
- Prompt-szövegek átírása, modell-váltás.
- Weekly e-mail adatköre (O-F07) — tulajdonosi döntést igényel, külön ticket.
- Design-refaktor, stílus-egységesítés a felsorolt tételeken túl.

## 3. Érintett területek (szeletenként)

| Szelet | Fájlok | Finding |
|---|---|---|
| **A. Publikálási kapu + lecke-anyag** | `server/studio/step-runner.ts` (gate ág), `server/studio/one-step.ts`, `server/studio/lesson-pipeline-routes.ts` (drive/one-step, publish végpont), `shared/studio-ui.ts` (fázis-lista, „gate"→„Kapu" szöveg), `client/src/components/studio/JobMonitor.tsx`, `SourceUploadForm.tsx` (kész → link), `client/src/App.tsx` (+`/lesson/:id`), `client/src/game-engine/CouponHud.tsx` | S-F02, S-F17, C-F01, saját mérés |
| **B. Próba/kupon integritás** | `server/studio/lesson-routes.ts`, `server/rewards/store.ts`, `server/studio/quiz-export.ts` / `lesson-pipeline-routes.ts` export-quiz | S-F03, S-F06, S-F11, S-F01 (részben: served_items publikáláskor) |
| **C. Pipeline-integritás** | `server/studio/step-runner.ts` (`loadBlockerNotes` round-szűrés, `finishedAt`), `server/studio/run-extraction.ts` (tranzakció + 0 fogalom = hiba) | S-F04, S-F05, S-F12 |
| **D. Biztonság/üzemeltetés** | `server/lib/body-limits.ts`, `server/ai/models.ts` (`assertDistinctFamilies` fallback-párok), `render.yaml` (`db:migrate` ne nyelje el a hibát, `npm ci`), `server/ai/AICache.ts` (`unref`) | O-F01, O-F02, O-F05, O-F14 |
| **E. Kliens-hibák** | `client/src/pages/admin.tsx` (`validTabs`), `client/src/components/studio/FeedbackPanel.tsx` (isError ág), `JobMonitor.tsx` (resume pending + onDone effect), `ParentDashboardPanel.tsx` (apiRequest + HU címkék), `LessonStudioPanel.tsx` (jobId sessionStorage) | C-F02, C-F03, C-F09, C-F10, C-F11, C-F12, C-F04 |

## 4. Rögzített döntések és kényszerek

1. **A kapu determinisztikus:** `gate` lépésben `checkCoverageGate(lesson, map.concepts)` fut
   (a meglévő, tesztelt `coverage.ts`), plusz `lessonSchema.safeParse`. Siker → `done` +
   **automatikus publikálás**: `html_files` sor (`contentType:'lesson'`, cím = lecke címe,
   classroom = térkép osztálya, content = rövid HTML-csonk „Ezt a leckét a Websuli lecke-futtató
   jeleníti meg"), `lessons.htmlFileId` beállítva, `lessons.publishedAt = now()`,
   `lessons.coverage` = a kapu pillanatképe; **minden fogalomhoz kötött `check` blokk exportja**
   `game_quiz_items`-be a 4 kupon-motoros játékra (master plan §14/6) — idempotensen (előző
   `(lessonId, gameId)` sorok törlése előbb; ehhez `game_quiz_items.lesson_id` oszlop, migráció
   `0014`). Kapu-bukás → `nextStep({gatePassed:false})` szerint author-kör (meglévő szabály).
2. A tulajdonos kifejezett akarata (#174 „one-step tényleg egylépéses"): a kész lecke **azonnal
   látható** a gyereknek; admin-előnézet a `/preview/:htmlFileId` útvonalon marad.
3. `/lesson/:lessonId` publikus útvonal a kliensben: a `lessons.id`-ből `htmlFileId`-t kér
   (`GET /api/lessons/:id` → `{htmlFileId}`) és a Preview-ra irányít; a CouponHud linkje így él.
4. **Próba-idempotencia:** egy `(learner, lessonId, sectionIdx)` hármasra **legfeljebb egy
   kupon adható 24 órán belül**; ismételt tökéletes Próba → `coupon: null`, `alreadyRewarded:true`.
   A `concept_results` mentése marad (tanulási statisztika), a kupon-kiadás nem.
5. **Bónusz atomi:** feltételes `UPDATE ... WHERE NOT (claimed_items @> '["id"]')` — 0 érintett
   sor = már beváltva (409).
6. **served_items:** a kupon `start`-nál a szerver a lecke `game_quiz_items` azonosítóit (a
   kupon `lessonId`-jére exportáltak) beírja `served_items`-be; így a `bonus` végpont élő.
   A játékok bekötése a `claimBonus`-ra külön szelet (nem-cél), de a szerver oldal teljes.
7. **Lektor-jegyzet körönként:** `lektor_notes.round` oszlop (migráció `0014`), `saveNotes`
   a job aktuális körét írja, `loadBlockerNotes(jobId, round)` csak az **utolsó** kör
   blokkolóit adja az author-promptnak.
8. `finishedAt` csak `done`/`error` lépésnél kap értéket; köztes átmenetnél `null`.
9. `run-extraction`: térkép + fogalmak **egy tranzakcióban**; 0 ellenőrzött fogalom → hiba
   (nincs térkép-sor, nincs mérgezett input_hash cache).
10. `body-limits`: a sütis előszűrő marad optimalizációnak, de a nagy parser **csak** a valóban
    nagy-body-t igénylő `POST/PUT/PATCH` metódusokon fut; GET/DELETE mindig standard.
11. `assertDistinctFamilies`: minden (author primary|fallback) × (lektor primary|fallback)
    pár családja különbözik, különben indulási hiba. Ha a jelenlegi táblázat sérti
    (author-fallback `qwen3.8-max` == lektor-primary `qwen3.8-max`), a lektor fallback
    `z-ai/glm-5.3` marad, az author fallback `x-ai/grok-4.6`-ra vált (más család).
12. `render.yaml`: `npm ci --include=dev --legacy-peer-deps && npm run db:migrate && npm run build`
    — a migráció hibája **buktatja** a buildet (idempotens, IF NOT EXISTS).
13. Nyelv: kód-komment/commit angol vagy a repo meglévő magyar stílusa; UI-szöveg magyar.

## 5. Edge case-ek

- Kapu bukik a round-limit után → `error` a meglévő `pipeline.ts` szabály szerint (nem végtelen).
- Lecke már publikált (második one-step ugyanarra a térképre): új `lessons` sor **új** `html_files`
  sorral; a régi marad publikálva (verziózás külön tétel — nem-cél).
- Export-quiz: lecke `check` blokk fogalom nélkül → kihagyva (meglévő szabály); 0 sor → nem hiba a
  kapunál (publikálás megtörténik, log warn).
- Próba ismétlés más `sectionIdx`-re → új kupon jár; azonos szakasz 24 órán belül → nem.
- Két párhuzamos bonus → pontosan egy sikeres.
- `lektor_notes.round` régi soroknál `0` default; `loadBlockerNotes` round-szűrése a job
  `round`-jával egyezik (author round N a lektor round N-1 jegyzeteit kapja → **a lektor a saját
  körének round-ját írja, az author az előző kör (round−1) blokkolóit olvassa**).
- `body-limits`: `Cookie: connect.sid=x` hamis sütivel GET → standard parser; POST `/api/studio/`
  hamis sütivel → nagy parser (elfogadott maradék kockázat, 401 után), dokumentálva.

## 6. Elfogadási kritériumok (EARS)

- WHEN a lektor 0 blokkolóval zár THEN the system SHALL run the deterministic gate, and on pass
  SHALL set `lessons.publishedAt`, create the `html_files` (`contentType:'lesson'`) row, link
  `lessons.htmlFileId`, snapshot `coverage`, export concept-bound checks to `game_quiz_items`,
  and move the job to `done` — so `GET /api/lessons` lists the lesson and
  `GET /api/lessons/by-file/:htmlFileId` returns 200.
- WHEN the gate fails coverage THEN the system SHALL transition per `nextStep({gatePassed:false})`
  and SHALL NOT publish.
- WHEN a one-step run reaches `gate` THEN `decideOneStepAction` SHALL return `continue` and the
  driver SHALL finish at `done` with `lessonId` and `htmlFileId` in the progress payload.
- WHEN the same learner posts a perfect Próba twice for one section within 24h THEN the second
  response SHALL have `coupon: null` and no new `coupons` row.
- WHEN two bonus claims race for one item THEN exactly one SHALL succeed (409 for the other).
- WHEN a coupon starts THEN `served_items` SHALL contain the lesson's exported quiz item ids.
- WHEN the author runs round N THEN its blocker input SHALL contain only round N−1 lektor notes.
- WHEN extraction yields 0 verified concepts THEN no `knowledge_maps` row SHALL exist for that hash.
- WHEN a request is GET/DELETE THEN the standard 1 MB parser SHALL apply regardless of cookie.
- WHEN any author×lektor primary/fallback pair shares a family THEN `assertDistinctFamilies`
  SHALL throw at startup.
- WHEN `/admin?tab=knowledge-maps` is opened THEN that tab SHALL be active.
- WHEN `/lesson/:lessonId` is opened for a published lesson THEN the runtime SHALL render it.

## 7. Tesztterv — RED tesztek NÉV szerint, a kód előtt

| Teszt-fájl | Eset | Célszimbólum |
|---|---|---|
| `tests/studio-gate-publish.test.ts` (ÚJ) | gate pass → done + publish hívások (memória-store: `publishLesson` hívva `lessonId`, coverage snapshot); gate fail → author round+1, publish NEM hívva; 0 fogalom-kötésű check → publikál, export 0 | `runPipelineStep` gate ág, `PipelineStore.publishLesson` |
| `tests/studio-one-step.test.ts` (BŐVÍT) | `decideOneStepAction({step:"gate"})` → `continue` (ma is az, de pin) ; `oneStepPhaseRows` „gate" fázis sor | `decideOneStepAction`, `ONE_STEP_PHASES` |
| `tests/pipeline-state.test.ts` (BŐVÍT) | `nextStep({step:"gate", gatePassed:true})` → done (pin) | `nextStep` |
| `tests/proba-server-grading.test.ts` vagy ÚJ `tests/coupon-idempotency.test.ts` | pure `shouldIssueCoupon(existing, now)` → false ha 24h-n belül volt; true különben | ÚJ pure fn `rewards/coupons.ts` |
| `tests/coupon-clock.test.ts`/ÚJ `tests/bonus-atomic.test.ts` | `claimBonusSql` feltétel tartalmazza `@>`; store `persistBonusAtomic` visszatér `claimed:false` 0 sornál (mock db) | `rewards/store.ts` |
| `tests/lesson-pipeline-runner.test.ts` (BŐVÍT) | round-2 author input blokkolói csak round-1 jegyzetek; `finishedAt` null köztes átmenetnél | `loadBlockerNotes(jobId, round)`, `advanceJob` |
| `tests/studio-extractor.test.ts` (BŐVÍT) | 0 checked concept → `runExtraction` throws, insert nem hívva (injektált store) | `run-extraction.ts` |
| `tests/body-limits.test.ts` (BŐVÍT) | GET + hamis süti → false; POST + süti + prefix → true; DELETE → false | `needsLargeBody` |
| `tests/models-routing.test.ts` (BŐVÍT) | fallback-pár azonos család → throw; alap-tábla → nem dob | `assertDistinctFamilies` |
| `tests/studio-ui-pure.test.ts` (BŐVÍT) | `ADMIN_TABS` tartalmazza `knowledge-maps`; admin.tsx validTabs ebből származik (statikus guard) | `shared/studio-ui.ts` / `admin.tsx` |
| `tests/render-blueprint.test.ts` (ÚJ) | `render.yaml` buildCommand nem tartalmaz `|| echo`, tartalmaz `npm ci` | render.yaml |
| `tests/websuli.spec.ts` (Playwright, BŐVÍT ha seedelhető) | `/lesson/:id` publikált lecke → runtime látszik | App route |

Reverz-mutációk kötelezők minden szeletre (kapu-feltétel megfordítása, `@>` kivétele, round-szűrő
törlése, `npm ci` visszaírása `npm install`-ra) — mindegyiknek RED-et kell adnia.

## 8. Kockázatok / visszavonási terv

- Automatikus publikálás rossz leckét tehet ki → a kapu (schema + coverage + lektor 0 blokkoló)
  a védelem; admin `DELETE /api/html-files/:id` visszavon (cascade törli a `lessons` sort).
- Migráció `0014` additív (két oszlop, default) — visszavonás: oszlopok ignorálhatók.
- Render build most már bukik migrációs hibán → szándékos; a régi verzió marad élőben.
- Kupon-idempotencia csökkenti a gyerek jutalmát ismétlésnél → tulajdonosi szándék (farmolás tilos).

## 9. Elutasított / halasztott auditor-tételek (indoklással)

- S-F07/F08/F16 (max_tokens, gateHelper/quizPolish deklaráció): a kapu determinisztikus lett,
  a phantom lépések listája kozmetikai — `/ai-status` szövegében jelölve „nem futó" (kis fix).
- S-F10 (szinkron from-map/approve/resume végpontok): valós, de az egylépéses út a fő; külön ticket.
- S-F13/F14 (progress TTL, one_step_runs növekedés): alacsony kockázat, külön ticket.
- S-F09 (fix-concept prompt kulcs): elfogadva mint XS: dedikált `studio.author.fix.v1` kulcs.
- C-F06 (WordLadder XP kliens-trust), C-F08 (feedback szín), C-F13/F14 (Próba üres beküldés,
  match index-egyezés — a szerver rendez, UNVERIFIED), C-F15..F20: halasztva, játék-regresszió
  kockázat magas, kézi QA kell Dominikkal.
- O-F03/F06/F08/F09/F10/F11 (improve continuation/verify finomítások): a #171 friss, mérési
  adat nélkül nem nyúlunk hozzá; külön ticket.
- O-F07 (weekly e-mail adatköre): tulajdonosi döntés.
- O-F12 (SESSION_SECRET generateValue): dashboard-érték már él; blueprint-újraalkalmazás nem
  tervezett; dokumentálva.
