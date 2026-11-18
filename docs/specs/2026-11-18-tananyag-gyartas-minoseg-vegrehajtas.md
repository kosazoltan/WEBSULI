# Végrehajtási utasítás — tananyaggyártás minősége (S1–S10)

Terv: [`docs/specs/2026-11-18-tananyag-gyartas-minoseg.md`](2026-11-18-tananyag-gyartas-minoseg.md). Ez a fájl ügynöknek szól: szeletenként
önállóan végrehajtható. A kódútvonalak a `source/` alatt értendők, ha nem `docs/`, `.agents/`, `.claude/` kezdetűek; a parancsok
a munkafa gyökeréből futnak, ha a lépés mást nem mond.

Sorrend (tulajdonosi döntések 2026-11-18 után): **S1a → S1b → SK1 → S2a → S2b → S3a → S3b → S4a → S4b → SK3 → S10/0 → S10/1 (első
mérés) → S5a → S5b → S6a → S6b → S6c → SK2 → S7a → S7b → S8a → S8b → S8c → SK4 → SK5 → S9 → S10/2 (záró mérés).** Egy alszelet =
egy ág = egy PR. Döntések: D1 újrarajzolás · D2 30 USD próbakeret · D3 ElevenLabs előre gyártva · D4 hangfájlok az adatbázisban,
csak a leckék · D5 fél pontos plafon igen · D6 egyeztetés alatt (az S7a nem indul, amíg nincs döntés).

## 0. Közös szabályok (minden szeletre)

### 0.1 Tiltások

- Tilos módosítani: `client/src/game-engine/**`, `client/src/data/vocabBank/**`, a játékok tesztjei és specjei, `scripts/qa/**`,
  a kapu-hookok, `.claude/settings.json`; a `migrations/**` alatt az S8b egyetlen új fájlján kívül semmi. `db:push` tilos. Ha egy lépés ilyen fájlt kívánna: állj meg, jelentsd az orkesztrátornak.
- Éles adatbázisba írni tilos; olvasás csak írásvédett tranzakcióban. Fizetős próbafutás csak a D2 keretén belül (30 USD; a
  főkönyv-szkript ellenőrzi); éles tömeges hanggyártást ügynök nem indít (a tulajdonos indítja admin-végpontról).
- A repó nyilvános: titok, e-mail-cím, tanulói adat, éles sorazonosító, leckecím-lista, forrásfájl nem kerülhet commitba.
- Tesztet gyengíteni, kihagyni, törölni tilos. Az egyetlen engedett korlátváltozás az S7a 4. lépése (a terv 5. szakasz 9. pontja).

### 0.2 Előkészítés (alszeletenként)

1. `git fetch origin` majd új ág az `origin/main`-ről: `git switch -c <ágnév> origin/main` (az ágnév a szeletnél áll).
2. `npm.cmd ci --prefix source --ignore-scripts` (a `native-arch` helyi bukása ismert kivétel, C-38).
3. Session eleji söprés: `git status --short`; a nyitott PR-ok fájllistája (`gh pr list --state open --json number,title,files`)
   — ha a szelet valamelyik fájlját nyitott PR módosítja, jelentsd az orkesztrátornak a folytatás előtt.
4. Olvasd el a szelet „Fájlok” listájának minden fájlját és a hozzájuk tartozó teszteket, mielőtt szerkesztesz.

### 0.3 Kapuk és kibocsátás (alszeletenként, ebben a sorrendben)

1. Minden szerkesztési szakasz után: `npm run gate:stage` → zöld. Bukásnál az okot javítod; ugyanazt a bukó parancsot változatlan
   bemenettel nem futtatod újra.
2. Lezárt részfeladatonként atomi commit; a commit-üzenet fájlból (`git commit -F <fájl>`).
3. A terv elfogadási listájának a szelethez tartozó pontjait kódból, tesztből és (ahol kell) böngészős próbából újraellenőrzöd.
4. Friss main: `git fetch origin`, majd **`git merge origin/main`** (rebase tilos). Main-merge-et csak ütközésnél vagy az
   orkesztrátor kérésére pusholsz.
5. `npm run gate:push` → zöld.
6. Független ellenőr: friss kontextusú, csak olvasó alügynök a `websuli-fejlesztesi-ellenor` skill szerint (a diffet, a tervet
   és ezt a fájlt kapja, a fejlesztő következtetéseit nem). Az ítélet rögzítése:
   `node scripts/qa/gates/record-review.mjs --head <fej-hash> --verdict IGEN --report <scratchpad>/review-<szelet>/jelentes.md`.
   Érdemi javítás után újra ellenőr.
7. PR-leírás fájlba (a session scratchpadjébe): cél, szelet (S-azonosító), a terv hivatkozása, futtatott ellenőrzések kimenete,
   UI-szeletnél képernyőképek, `Független ellenőr ítélete: IGEN (fej: <hash>)`. Majd `npm run gate:pr -- --body-file <leírás.md>`.
8. Push és PR **csak az orkesztrátor jelzésére**, külön, egyszerű parancsként: friss `.audit-ok` a git-gyökérben, `git push origin
   <ágnév>`, `gh pr create --title "<cím>" --body-file <leírás.md> --base main`.
9. Push után egy hosszú figyelő a CI végére; zöld CI-jú fejre csak blokkoló lelet miatt pusholsz, mindent egy pushban.
   Merge előtt közvetlenül: `npm run gate:merge -- <PR>` (az orkesztrátor futtatja).

### 0.4 Böngészős próba (ahol a szelet előírja)

- E2E-sorompó előtte: `docker ps --filter name=websuli-e2e- --format "{{.Names}} {{.RunningFor}}"`; ha legalább 2 db 90 percnél
  fiatalabb konténer fut, 60 másodpercenként újra, legfeljebb 30 percig. Egyszerre egy böngészős futás.
- Futtatás: `cd source` majd `npx.cmd playwright test -c <konfig> --workers=1`. A sorompó ellenőrzése és az indítás külön lépés.
- Nézetek: 360×640, 390×844, 1280×800. Minden nézetben állítás: nincs oldalszintű vízszintes görgetés
  (`document.documentElement.scrollWidth <= clientWidth`), az új elem a szülő blokkján belül van, nem takar gombot, szöveg nincs
  levágva (az elem `scrollHeight <= clientHeight + 1`, ahol nincs szándékos belső görgetés).
- Új konfig a `playwright.material-title.config.ts` mintájára (vite, ál-API, szolgáltatásmunkás tiltva, `workers: 1`); a port a
  szeletnél áll. Képernyőképek: `source/test-results/<név>/` (nem követett).

### 0.5 Zárás (alszeletenként)

- Jelentés az orkesztrátornak: módosított fájlok, futtatott ellenőrzések PASS / FAIL, nem futtatott ellenőrzés oka, maradó kockázat,
  a fej hash-e. Hiba vagy tévedés esetén ugyanabban a körben csapda-bejegyzés a `docs/agent-csapdak.md`-be (a következő szabad
  C-szám; a fájl végét olvasd el előtte).

### 0.6 Szkript-ellenőr (minden szelet kötelező része — tulajdonosi elv, 2026-11-18)

Elv: a modell kimenetét séma, szabály és mérőszám ítéli meg; ügynök vagy másik modell állítása nem bizonyíték. Minden szelet
lezárása előtt a szelethez tartozó sor ellenőrzői futnak, a kimenetük a PR-leírásba kerül. Új ellenőrző függvényhez a szelet
legalább három mutációs ellenpróbát is ír (elrontott bemenet → a várt ok).

| Szelet | Szkript-ellenőr (parancs vagy teszt) | Mit ítél meg |
|---|---|---|
| S1a | `tests/source-visuals.test.ts` | leltár-séma, létező fájl / oldal / fogalom, korlátok, szóegyezés |
| S1b | `tests/source-visual-coverage.test.ts` | fejezethez rendelés, hiányzó azonosítók |
| SK1 | `tests/source-coverage-gate.test.ts`, `scripts/gates/run-gates.mts` | fedettségi kapu, kihagyás szabálya, egyetlen pótló kör |
| S2a / S2b | `tests/lesson-source-visual-kinds.test.ts`, `playwright.source-visuals.config.ts` | paraméter-séma, SVG-tisztító; átfedés / levágás / görgetés |
| S3a / S3b | `tests/visual-patch.test.ts`, `tests/section-visuals.test.ts`, `tests/single-run-engine.test.ts` | megalapozás a forrástételhez, eldobási ok, szókeret, bankkulcs |
| S4a / S4b | `tests/arithmetic-false-alarms.test.ts`, `tests/single-run-engine.test.ts` | hamis riasztás nélkül; áthelyezés, világ-lista, okok |
| SK3 | `tests/run-budget.test.ts` | körszám-, költség-, időplafon |
| S5a / S5b | `tests/lesson-feedback-openers.test.ts`, `tests/lesson-opener.test.ts`, `tests/seeded.test.ts` | szótár, levágás, determinizmus, verzió |
| S6a–c | `tests/lesson-section-shapes.test.ts`, `tests/lesson-arc.test.ts`, `tests/visual-kind-plan.test.ts`, `scripts/measure/shape-simulation.mts` | kiosztás, ívkapu, arányok, szimuláció |
| SK2 | `tests/variety-metrics.test.ts`, `scripts/measure/variety-measure.mjs` | változatosság-mutatók és küszöbök |
| S7a / S7b | `tests/open-answer-rules-version.test.ts`, `tests/scoring-v2.test.ts`, az arbiter tesztjei | lenyomat-őr, hosszkorlát, plafon |
| S8a–c | `tests/voice-rank.test.ts`, `tests/tts-audio-key.test.ts`, `tests/tts-audio-store.test.ts`, `tests/tts-audio-gate.test.ts` | rangsor, kulcs, méretőr, hangkapu |
| S8d | `tests/speech-preload.test.ts`, `tests/speech-player.test.ts`, `tests/tts-rate-limits.test.ts`, `playwright.lesson-fusion.config.ts` (felolvasás-szűrő) | előtöltési rend és plafonok, hangmotor-állapot, a lejátszó bekötése ál-órával, a korlát bekötése valódi HTTP-n, koppintás → hang idő |
| SK4 / SK5 | `tests/release-gate.test.ts`, `tests/gate-mutations.test.ts`, `scripts/measure/gate-baseline.mts` | kiadás előtti kapu, mutációk, alapvonal |
| S9 | `node scripts/qa/gates/skills-sync-check.mjs` (csak futtatva) | skill forrás ↔ tükör |
| S10 | `scripts/measure/source-gap-table.mts`, a futáskeret főkönyve | hiánytábla gépi része, keret |

---

## S1a — Forrás-vizuálleltár: séma, 1. állomás, mentés, betöltés

Ág: `feat/forras-vizualleltar-s1a`. Fájlok: `shared/source-visuals.ts` (új), `shared/knowledge-map-schema.ts`, `shared/schema.ts`
(csak a `$type` jelölés), `server/studio/single-run/engine.ts`, `server/studio/single-run/live.ts`,
`server/studio/pipeline-store.ts`, `shared/run-telemetry.ts`, `tests/source-visuals.test.ts` (új), `tests/single-run-engine.test.ts`.

1. `shared/source-visuals.ts` (tiszta modul, zod; lookbehind nélkül):
   - `SOURCE_VISUAL_KINDS = ["table","process","decisionTree","ruleBox","pictureCard","colorCode","exercise","diagram"]`.
   - Közös mezők: `id` (`v1`…, ≤ 12 karakter), `kind`, `sourceFile` (≤ 255), `page` (egész ≥ 1), `role` (≤ 200), `title?` (≤ 160),
     `conceptIds: string[]` (≤ 12), `verified?: "text" | "visual-only"` (a program tölti).
   - `data` fajtánként: `table` `{ headers: string[1..8] (≤ 80), rows: string[][] (1..40 sor, cella ≤ 100 — review J5: a legnagyobb tábla beférjen a karakterkeretbe), headerTones?:
     Array<"a"|"b"|"c"|"neutral"> }` · `process` `{ steps: string[2..12] (≤ 200) }` · `decisionTree` `{ root: Node }`, ahol
     `Node = { text (≤ 160), branches?: Array<{ label (≤ 60), node: Node }> (≤ 4) }`, mélység ≤ 4 · `ruleBox` `{ tone:
     "rule"|"warning"|"tip", heading? (≤ 80), items: string[1..8] (≤ 240) }` · `pictureCard` `{ cards: Array<{ label (≤ 60),
     depicts (≤ 160), caption? (≤ 120), example? (≤ 160) }> (1..16) }` · `colorCode` `{ entries: Array<{ color (≤ 30), tone:
     "a"|"b"|"c"|"neutral", meaning (≤ 160) }> (2..6) }` · `exercise` `{ instruction (≤ 300), items: string[] (≤ 20, ≤ 240),
     answerKey?: string[] (≤ 20, ≤ 240), pictures?: string[] (≤ 8, ≤ 160) }` · `diagram` `{ description (≤ 400), parts:
     Array<{ label (≤ 60), meaning (≤ 200) }> (≤ 12) }`.
   - `SOURCE_VISUAL_LIMITS = { maxItems: 60, maxChars: 40000 }`.
   - `sourceVisualTexts(v): string[]` — a tétel minden megjelenő szövege (cellák, lépések, ágak, pontok, feliratok).
   - `sanitizeSourceVisuals(raw: unknown, ctx: { fileNames: string[]; conceptIds: Set<string>; pageTexts?: Record<string,
     Record<number, string>> }): { visuals: SourceVisual[]; dropped: Array<{ id?: string; reason: string }> }` — tételenként:
     séma; `sourceFile` szerepel a `fileNames`-ben; a nem létező `conceptIds` elemek törlődnek (a tétel marad); a `maxItems` /
     `maxChars` feletti tételek kimaradnak; `verified`: ha van `pageTexts[file][page]`, és a `sourceVisualTexts` 3+ betűs szavainak
     legalább 60%-a (ékezet- és kisbetű-hajtogatva) szerepel az oldal szövegében → `"text"`, különben `"visual-only"`.
   - `splitPageTexts(extractedText: string): Record<number, string>` — a `[N. oldal]` jelölők mentén.
2. `tests/source-visuals.test.ts`: fajtánként egy érvényes és egy érvénytelen tétel; nem létező fájl → kimarad okkal; nem létező
   fogalom → az azonosító törlődik; 61 tétel → 60; `verified` mindkét értéke; `splitPageTexts` három oldalon; mélység 5 fa → kimarad.
3. `shared/knowledge-map-schema.ts:70-75`: `sourceFileSchema` bővül: `visuals: z.array(sourceVisualSchema).optional()`.
   `shared/schema.ts:604-606`: a `$type` tömbelemébe `visuals?: SourceVisual[]` (SQL nem változik; migráció nem készül).
4. `engine.ts`: (a) `SingleRunMap` (`:93`) bővül `visuals: SourceVisual[]`; (b) az 1. állomás kérése (`:293-306`) a JSON-alak után
   új bekezdést kap: a forrás minden táblázatáról, folyamatáról, döntési ábrájáról, kiemelt szabálydobozáról, képes kártyájáról,
   színkódjáról, feladatáról és egyéb ábrájáról adjon `visuals` tételt a fenti alakban (az alak a `shared/source-visuals.ts`
   exportált `SOURCE_VISUALS_CONTRACT` szövegéből jön — ugyanott definiáld, egy helyen); hangsúly: a kép tartalmát írja le
   (`depicts`, `pictures`), a táblázatot adatként adja, a színt jelentésként; ha a forrásban nincs ilyen, üres tömb; (c) a `validate`
   ágban (`:310-356`) a fogalmak ellenőrzése UTÁN `sanitizeSourceVisuals` fut — a `dropped` elemek **nem** kerülnek a `problems`
   tömbbe (nincs javító forduló), hanem a `telemetry.gates.visualsDropped` számlálóba és a naplóba; hiányzó / nem tömb `visuals`
   → üres tömb + `telemetry.gates.visualsMissing = 1`.
5. `shared/run-telemetry.ts`: `RunGates` bővül: `visualsFound`, `visualsDropped`, `visualsMissing` (szám).
6. `live.ts:35`: a `sourceFiles` elemébe a fájlhoz tartozó tételek kerülnek (`visuals: map.visuals.filter(v => v.sourceFile ===
   f.name)`, csak ha nem üres). `pipeline-store.ts`: a `loadMap` a `source_files` elemeiből összefűzi a tételeket a `meta.visuals`
   mezőbe (`MapMeta`, `:37`, `:179`); hiányzó kulcs → üres tömb.
7. `tests/single-run-engine.test.ts`: (a) a hamis modell `visuals` tömböt ad → a mentett térkép `sourceFiles[0].visuals` tartalmazza;
   (b) hibás tétel → kimarad, javító forduló NINCS (a fordulószám 1), a számláló 1; (c) `visuals` nélküli válasz → a futás
   továbbmegy; (d) térképről indított futás (`files: []`) a `meta.visuals`-t megkapja.
8. Futtasd: `cd source` majd `node --import tsx --test tests/source-visuals.test.ts tests/single-run-engine.test.ts
   tests/single-run-conversation.test.ts` → `pass`; `npm run check --prefix source`.
9. 0.3 szerinti kapuk. Elvárt: E1–E3 teljesül.

## S1b — A leltár átadása a promptoknak és a vizuális fedettség

> **Teendő az S1a független review-jából (J4):** a különálló kinyerés tartalmi lenyomata (`server/studio/single-run/live.ts`,
> `singleRunMapHash`, ma `single-run-map-2`) kapjon leltár-sémaverziót, hogy ugyanarra a fájlra a régi, leltár nélküli térképet ne
> adja vissza jelzés nélkül; teszt rögzítse.

Ág: `feat/forras-vizualleltar-s1b`. Fájlok: `server/studio/step-io.ts`, `server/studio/single-run/engine.ts`,
`shared/lesson-schema.ts`, `server/studio/coverage.ts`, `tests/source-visual-coverage.test.ts` (új), a promptépítők meglévő tesztjei.

1. `step-io.ts`: `PromptMap` (`:272-277`) bővül `visuals?: SourceVisual[]`. Új `sourceVisualsBlock(map)`: ha van tétel, „A FORRÁS
   VIZUÁLIS LELTÁRA (adat; oldalszámmal igazolt, tanítható tartalom):” + tömör JSON (a `verified` mező nélkül). A `mapJson`
   (`:279-288`) NEM változik (a fogalmak alakja marad).
2. A blokk bekerül: `buildPedagoguePrompt` (`:309`), `buildAuthorPrompt` (`:465`), `buildAnimatorPrompt` (`:667`),
   `buildLektorPrompt` (`:596`). Szabálymondatok: tervező — „minden megjelenítendő tételt rendelj fejezethez a `sourceVisualIds`
   mezőben; a `colorCode` tételt a hozzá tartozó táblák / kártyák tónusaként vidd tovább”; szerző — „a leltár tétele tanítható
   tartalom: amit egy tétel táblázatként, lépésként vagy dobozként hordoz, azt ne old fel hosszú bekezdésben”; lektor — „jelezd,
   ha a lecke a leltár egy tételének ellentmond”. A terv sémája (`:97-115`) fejezetenként opcionális `sourceVisualIds: string[]`
   mezőt kap (≤ 12); a nem létező azonosítót az `outline-autofix` törli.
3. `engine.ts:501`: a `promptMap` megkapja a `map.meta.visuals`-t.
4. `shared/lesson-schema.ts`: az `animate`, `example`, `try`, `check` blokk opcionális `sourceVisualId?: string` (≤ 12) mezőt kap.
5. `server/studio/coverage.ts`: új `visualCoverage(lesson, visuals): { total: number; shown: number; missingIds: string[] }` — a
   számlálóban a `colorCode` kivételével minden fajta szerepel; „megjelent”, ha van rá hivatkozó blokk. A fedettség-kimenet
   (`lessons.coverage` jsonb) `visuals` kulccsal bővül; a `checkCoverageGate` (`:81`) nem változik — a vizuális hiány kapuját az
   SK1 adja (a következő szelet); a hiányzó azonosítók a lektor „előző hiányok” listájában is megjelennek.
6. `tests/source-visual-coverage.test.ts`: 5 tétel, 2 hivatkozott → `{ total: 5, shown: 2 }` + a 3 hiányzó azonosító; csak
   `colorCode` → `total: 0`; leltár nélkül → `{ total: 0, shown: 0, missingIds: [] }`. A promptépítők tesztjeiben: a blokk megjelenik,
   ha van tétel, és nem jelenik meg, ha nincs (a prompt bájtra változatlan leltár nélkül — rögzítsd teszttel).
7. Futtasd: `cd source` majd `node --import tsx --test tests/source-visual-coverage.test.ts tests/coverage-gate.test.ts
   tests/single-run-engine.test.ts` → `pass`; `npm run check --prefix source`.
8. 0.3 szerinti kapuk. Elvárt: E4 teljesül (az E5 az SK1-gyel zárul).

## SK1 — Forrás-fedettségi kapu (az S1b-vel egy körben; külön PR, ha az S1b-vel együtt 400 sor fölé menne)

Ág: `feat/forras-fedettsegi-kapu-sk1` (az S1b ágáról vagy — ha az S1b már bent van — az `origin/main`-ről). Fájlok:
`server/studio/gates/types.ts`, `server/studio/gates/config.ts`, `server/studio/gates/source-coverage-gate.ts`,
`scripts/gates/run-gates.mts` (mind új), `server/studio/step-io.ts`, `server/studio/tools/outline-autofix.ts`,
`server/studio/single-run/engine.ts`, `shared/run-telemetry.ts`, `tests/source-coverage-gate.test.ts` (új),
`tests/single-run-engine.test.ts`.

1. `gates/types.ts`: `GateResult = { gate: string; ok: boolean; problems: string[]; metrics: Record<string, number> }`;
   `GATE_REGISTRY` (név → függvény) — minden kapu ide jegyzi be magát (az SK5 őr-tesztje ebből olvas).
   `gates/config.ts`: `GATE_MODES` — kapunként `"off" | "report" | "enforce"`; a `sourceCoverage` kezdőértéke `"report"`.
2. `gates/source-coverage-gate.ts` (tiszta függvény, modell és adatbázis nélkül):
   `sourceCoverageGate(lesson, visuals, skipped): GateResult & { missingIds: string[] }`.
   - `SOURCE_COVERAGE_THRESHOLDS = { must: ["table","process","decisionTree","ruleBox"], mustShare: 1, should:
     ["pictureCard","exercise","diagram"], shouldShare: 0.8, fidelity: 0.8, maxSkipShare: 0.3 }`; a `colorCode` nem számít.
   - Megfeleltetés: `table` → `table`; `process` → `process`; `decisionTree` → `decisionTree`; `ruleBox` → `ruleBox`;
     `pictureCard` → `pictureCards`; `diagram` → bármely `animate` fajta; `exercise` → `example` / `try` / `check` /
     `pictureCards` blokk. A megfeleltetés állandó tábla ugyanebben a fájlban.
   - „Megjelent”: van `sourceVisualId`-val hivatkozó, a megfeleltetésnek megfelelő blokk, ÉS a tétel `sourceVisualTexts`
     elemeinek (cella, lépés, pont, kártyafelirat; ékezet- és kisbetű-hajtogatva) legalább `fidelity` hányada szerepel a blokk
     `renderedVisualTexts` / blokkszövegében; döntési fánál a levelek száma ≥ a forrás leveleinek száma. Az S2 előtt az új
     fajták még nem léteznek a sémában: a megfeleltetés ismeretlen fajtára „nem jelent meg” eredményt ad (nem dob hibát).
   - Kihagyás: `skipped: Array<{ id; reason: "admin_meta" | "answer_key" | "duplicate" | "decorative"; duplicateOf? }>`.
     Érvényes, ha: az azonosító létezik; `duplicate`-nál a `duplicateOf` létező, MEGJELENT tétel; `decorative` csak
     `diagram` / `pictureCard` fajtánál és üres `conceptIds` mellett; tanított fogalomra hivatkozó tétel csak `duplicate` okkal;
     az érvényes kihagyások száma ≤ `maxSkipShare` × a számlálóban lévő tételek száma (a többlet a lista végéről érvénytelen).
     Érvénytelen kihagyás → a tétel hiányzónak számít, a `problems` megnevezi az okot.
   - Ítélet: `ok`, ha a `must` fajták nem kihagyott tételei mind megjelentek, és a `should` fajtáké legalább `shouldShare`
     arányban (a megengedett hiány: `floor((1 − shouldShare) × n)`). Leltár nélkül: `ok: true`, `metrics.total = 0`.
3. A terv sémája (`step-io.ts:97-115`) opcionális `skippedVisuals` mezőt kap a fenti alakban; a tervező promptja a zárt oklistát
   és a szabályt szó szerint megkapja („kihagyni csak ezekkel az okokkal lehet; minden más tételt rendelj fejezethez”); az
   `outline-autofix` a nem létező azonosítójú kihagyást törli.
4. `engine.ts`, a közzététel előtti végellenőrzésnél (`:862-896`, a meglévő fedettségi kapu mellett): `sourceCoverageGate` fut, az
   eredmény a `telemetry.gateResults` tömbbe kerül (`shared/run-telemetry.ts`: új opcionális mező). Üzemmód szerint:
   `report` → csak mentés és napló; `enforce` → ha nem `ok`: **egy** pótló forduló a fő beszélgetésben („forráspótlás” állomás,
   `timed(…, { fix: true })`): a hiányzó tételek adata + „add vissza ezeknek az ábrafoltját `sourceVisualId`-val”; a folt az
   `applyVisualPatch`-en megy át; a kapu újra fut; ha ismét nem `ok`: a futás megáll a meglévő állomás-megállási úton (olvasd el,
   hogyan áll meg ma egy állomás a javítókörök kimerülése után, és ugyanazt az utat használd), a job kimenetébe
   `gateStop: { gate: "sourceCoverage", missingIds }` kerül, közzététel nincs. Harmadik próbálkozás nincs — ezt teszt rögzíti.
5. `scripts/gates/run-gates.mts`: `--lesson <lecke.json> --map <térkép.json>` → a bejegyzett kapuk futtatása fájlokon, JSON
   kimenet, nem nulla kilépési kód bukásnál (helyi ellenőrzésre és az SK5 alapvonal-mérőjének).
6. `tests/source-coverage-gate.test.ts` — **a küszöbök behangolása és a mutációs ellenpróbák:**
   - szintetikus forrásleltár a HM-minta összetételével (9 táblázat, 1 döntési fa, 8 kártyás képes tétel, 5 szabálydoboz, 4 képes
     feladat, 2 páros doboz, 6 adminisztratív / kulcs-tétel) és három ál-lecke: (a) minden tétel megjelenik → `ok`; (b) a mai
     éles lecke alakja (0 táblázat táblaként, lineáris „fa”, 0 kártya) → bukik, a `missingIds` teljes; (c) a 6 adminisztratív
     tétel érvényes okkal kihagyva, a többi megjelenik → `ok`;
   - mutációk (mind bukjon a megnevezett okkal): egy táblázat hivatkozás nélkül; táblázat `process` blokként; táblázat a sorok
     50%-ával; döntési fa egy levéllel kevesebb; tanított fogalmú tábla `admin_meta` okkal kihagyva; `duplicate` nem létező
     párral; a kihagyások 40%-a; `decorative` ok táblázatra;
   - ha a (b) eset átmenne vagy az (a) / (c) elbukna, a küszöböt / a hűségmérést hangolod, és a végső értékeket indoklással a
     PR-leírásba írod (a tesztet nem igazítod a kódhoz — a három eset elvárása rögzített).
7. `tests/single-run-engine.test.ts`: `report` módban a bukó kapu nem állít meg, az eredmény mentve; `enforce` módban (a tesztben
   átállítva) bukás → pontosan egy pótló forduló → siker esetén közzététel; ismételt bukás → megállás, `gateStop` kitöltve, a
   modellhívások száma pontosan eggyel nőtt.
8. Futtasd: `cd source` majd `node --import tsx --test tests/source-coverage-gate.test.ts tests/single-run-engine.test.ts
   tests/coverage-gate.test.ts` → `pass`; `npm run check --prefix source`.
9. 0.3 szerinti kapuk. Elvárt: E5, E37–E39 (a megállítás `enforce` módban; az élesítés az S3b utolsó lépése), E47.

## S2a — Megjelenítők: táblázat, szabálydoboz, összehasonlító kártya

> **Ellenőrzési pont az S1a független review-jából (J7), az S2b-re is:** a leltár szövegei a modelltől jönnek, és HTML-kódolás
> nélkül tárolódnak — a megjelenítő kizárólag szövegként rajzolja ki őket (React szövegcsomópont; `dangerouslySetInnerHTML` tilos);
> a böngészős próba egy `<script>` / `<img onerror>` szövegű cellával igazolja, hogy jelölőként nem értelmeződik.

Ág: `feat/lecke-megjelenitok-s2a`. Fájlok: `shared/lesson-schema.ts`, `shared/lesson-visual-params.ts`,
`shared/lesson-block-label.ts`, `client/src/lesson-runtime/blocks/source-visuals.tsx` (új),
`client/src/lesson-runtime/blocks/animate-blocks.tsx`, `client/src/lesson-runtime/lesson-design.css`,
`client/src/lesson-runtime/explain-paragraphs.ts`, `server/studio/lektor-view.ts`, `tests/lesson-source-visual-kinds.test.ts` (új),
`tests/source-visuals.spec.ts` (új), `playwright.source-visuals.config.ts` (új, port 5197).

1. `lesson-schema.ts:29-49`: `ANIM_KINDS` bővül: `"table"`, `"ruleBox"`, `"compareCards"`.
2. `lesson-visual-params.ts`: sémák — `table` `{ caption? (≤ 120), headers: string[1..6] (≤ 60), rows: string[][] (1..14 sor,
   cella ≤ 120), headerTones?: Array<"a"|"b"|"c"|"neutral"> }` (minden sor hossza = a fejléc hossza) · `ruleBox` `{ tone:
   "rule"|"warning"|"tip", heading? (≤ 80), items: string[1..6] (≤ 200) }` · `compareCards` `{ cards: Array<{ title (≤ 60), tone:
   "a"|"b"|"c"|"neutral", lines: string[1..6] (≤ 160), example? (≤ 160) }> (2..3) }`. Felvétel a `VISUAL_PARAM_SCHEMAS`-ba
   (`:114-123`) és a `renderedVisualTexts`-be (`:188`: minden megjelenő szöveg). A `VISUAL_PARAMS_CONTRACT` (`:170-180`) EBBEN a
   szeletben nem bővül (a gyártó az S3a-ban kapja meg).
3. `shared/lesson-block-label.ts`: a három fajta blokkfejléc-felirata korosztályonként a kódszótárba (pl. „Táblázat”, „Szabály”,
   „Figyelj!”, „Tipp”, „Hasonlítsd össze!”); a `ruleBox` felirata a `tone`-tól függ.
4. `blocks/source-visuals.tsx`: `TableAnim` — valódi `<table>`, `<caption>`, `<th scope="col">`, az első oszlop `<th scope="row">`;
   a tónus osztálynév (`tone-a` …), színe a sáv tokenjeiből (`--accent`, `--accent2`, `--accent3`); a táblát `overflow-x: auto`
   tároló fogja, `tabindex="0"`, `role="region"`, `aria-label` = a felirat; az első oszlop `position: sticky`. `RuleBoxAnim` —
   keretes doboz, a tónus ikonja a meglévő blokkjelző-készletből (új kép nem készül), pontlista. `CompareCardsAnim` — rács: 640 px
   felett egymás mellett, alatta egymás alatt. Regisztráció az `ANIMATE_REGISTRY`-ben (`animate-blocks.tsx:188`).
   Stílus a `lesson-design.css`-ben, kizárólag meglévő tokenekkel; rögzített hexakód nem kerül be.
5. `lektor-view.ts:30-31` (`animateLine`): az új fajtáknál a cellák / pontok / kártyasorok szövege is a nézetbe kerül.
6. Felsorolás-hiba: állapítsd meg az okot az `explain-paragraphs.ts`-ben (a „•” / „-” kezdetű, sortöréssel tagolt sorok egy
   bekezdésbe folynak-e). Ha igen: az ilyen sorokból `<ul>` lista készül; egységteszt a bontásra. Ha az ok máshol van, jelentsd, és
   ez a lépés külön jegyre kerül.
7. `tests/lesson-source-visual-kinds.test.ts`: a három séma érvényes / érvénytelen esetei (eltérő sorhossz, 15 sor, 7 oszlop, 4
   kártya); `renderedVisualTexts` teljes; `dropUnknownAnimateBlocks` (`lesson-schema.ts:68`) egy kitalált `"jovoFajta"` blokkot
   kihagy, a `table`-t megtartja.
8. Böngészős próba (0.4): ál-lecke mindhárom fajtával — 2 oszlopos / 12 soros tábla, 4 oszlopos tábla 80 karakteres cellával, 6
   pontos doboz mindhárom tónussal, 2 és 3 kártya. Állítások nézetenként: a 0.4 lista; a tábla belső görgetője létezik, ha a tábla
   szélesebb a tárolónál, és az oldal nem görget; a kártyák 360 px-en egymás alatt, 1280 px-en egymás mellett. Parancs: `cd source`
   majd `npx.cmd playwright test -c playwright.source-visuals.config.ts --workers=1` → `passed`. Regresszió:
   `playwright.lesson-interactions.config.ts`, `playwright.lesson-typography.config.ts`, `playwright.band-colors.config.ts` →
   `passed` (egyenként).
9. 0.3 szerinti kapuk; a PR-leírásba nézetenként egy képernyőkép. Elvárt: E6 (három fajtára), E8 teljesül.

## S2b — Megjelenítők: elágazó döntési fa, képes kártyák

Ág: `feat/lecke-megjelenitok-s2b`. Fájlok: mint az S2a (a `source-visuals.tsx`, a séma, a címkék, a lektor-nézet, a spec bővül).

1. `ANIM_KINDS` bővül: `"decisionTree"`, `"pictureCards"`. Sémák: `decisionTree` `{ root: Node }`, `Node = { text (≤ 120),
   branches?: Array<{ label (≤ 40), node: Node }> (2..4) }`, legfeljebb 3 szint, összesen ≤ 13 csomópont · `pictureCards` `{ cards:
   Array<{ label (≤ 40), svg (≤ 6000, a meglévő illusztráció-tisztítón át), caption? (≤ 80), example? (≤ 120) }> (2..8) }`.
   `renderedVisualTexts`: a csomópontok, ágfeliratok, kártyafeliratok és az SVG `<text>` elemei.
2. `DecisionTreeAnim`: 640 px felett vízszintesen elágazó elrendezés (flex / grid + CSS-összekötők), az ág felirata az összekötőn;
   640 px alatt behúzott, egymásba ágyazott lista függőleges vezetővonallal. A levél (`branches` nélküli csomópont) eredménydoboz,
   tónusa az ág sorszámából (`tone-a` / `tone-b` / `tone-c`). Szemantika: egymásba ágyazott `<ul>`; az ág felirata a listaelem
   szövegének része (képernyőolvasó: „Igen: …”).
3. `PictureCardsAnim`: rács (360 px: 2 oszlop; 1280 px: 4 oszlop); a rajz a meglévő illusztráció-megjelenítő tisztított SVG-útján
   kerül be, `role="img"`, `aria-label` = a felirat.
4. Címkék (`lesson-block-label.ts`), lektor-nézet (`lektor-view.ts`): mindkét fajta szövege megjelenik.
5. Egységtesztek a `tests/lesson-source-visual-kinds.test.ts`-ben: 4 szintű fa elutasítva; 1 ágú csomópont elutasítva; 14 csomópont
   elutasítva; `<script>`-et tartalmazó SVG a tisztító után ártalmatlan; 9 kártya elutasítva.
6. Böngészős próba (0.4): kétszintű, háromágú fa (a PT-minta döntési ábrájának alakja) és egy Igen / Nem fa (a HM-minta alakja); 8
   képes kártya. Külön állítás: a két levél NEM egymás után, nyíllal összekötve áll, hanem ugyanannak a szülőnek két gyereke (a DOM
   szerkezetéből). Parancs és regresszió mint az S2a 8. lépésében.
7. 0.3 szerinti kapuk; képernyőképek a PR-leírásba. Elvárt: E6 (mind az öt fajtára), E7 teljesül.

## S3a — Az ábrák állomás a forrásra kötve; az eldobás oka a kimenetben

Ág: `feat/abrakeszito-forrasra-kotve-s3a`. Fájlok: `server/studio/step-io.ts`, `server/studio/role-skills.ts`,
`shared/lesson-visual-params.ts`, `server/studio/visual-patch.ts`, `server/studio/section-visuals.ts`,
`server/studio/single-run/engine.ts`, `shared/run-telemetry.ts`, `tests/visual-patch.test.ts`, `tests/section-visuals.test.ts`,
`tests/lesson-visual-params.test.ts`, `tests/single-run-engine.test.ts`, `tests/studio-role-skills.test.ts`.

1. `VISUAL_PARAMS_CONTRACT` (`lesson-visual-params.ts:170-180`): öt új sor az öt új fajta paraméter-alakjával.
2. `buildAnimatorPrompt` (`step-io.ts:667-706`): a leltár blokkja után szabály: „ELŐSZÖR a forrás vizuális tételei: minden, a
   fejezethez rendelt tételt jeleníts meg a megfelelő fajtával — `table` → table; `process` → process; `decisionTree` →
   decisionTree; `ruleBox` → ruleBox; `pictureCard` → pictureCards; `diagram` → a legjobban illő meglévő fajta vagy illustration;
   `exercise` képekkel → pictureCards — és töltsd ki a `sourceVisualId` mezőt. A `colorCode` tónusait vidd át a `headerTones` /
   `tone` mezőkbe. CSAK ezután javasolj új ábrát.” A `:684` sor kiegészül: a forráshoz kötött ábra szövege a leltár tételéből is
   jöhet. A `role-skills.ts:138` „legfeljebb 2” korlátja: a forráshoz kötött ábra nem számít bele; fejezetenként összesen
   legfeljebb 4 ábra. Az animator skill hosszkorlát-tesztje (`tests/studio-role-skills.test.ts:19`, `< 5200`) érvényes marad — ha
   a szöveg nem fér bele, a skillt tömöríted, a korlátot nem emeled.
3. `visual-patch.ts`: (a) a foltban elfogadott mező a `sourceVisualId`; nem létező azonosító → a mező törlődik; (b) `:64-65`: a
   megalapozási korpusz forráshoz kötött ábránál a lecke szövege + a tétel `sourceVisualTexts` szövege; (c) `:83-88`: a „felirat
   nevezze meg a fogalmat” szabály forráshoz kötött ábránál nem fut (a tétel oldalszámmal igazolt); (d) az `applyVisualPatch`
   visszatérése bővül: `dropped: Array<{ section: number; animKind?: string; sourceVisualId?: string; reason: string }>`.
4. `engine.ts:679-686`: (a) az eldobott ábrák a `telemetry.visuals = { proposed, kept, dropped }` mezőbe kerülnek
   (`shared/run-telemetry.ts`: új opcionális mező; ok ≤ 200 karakter, ≤ 40 tétel); (b) ha van eldobott, forráshoz kötött ábra:
   EGY célzott javító forduló a fő beszélgetésben („ezek az ábrák nem illeszthetők: <okok>; add vissza csak ezeknek a javított
   foltját”), `timed(telemetry, "ábrák", …, { fix: true })` méréssel; a második eldobás végleges, az ok a kimenetben marad;
   (c) a „nem illeszthető” ágon a napló mellé az ok is a `telemetry.visuals`-ba kerül.
5. `section-visuals.ts:21-43` (`ensureSectionVisuals`): ha a fejezetben van `sourceVisualId`-val jelölt ábra, pótló `process` nem
   készül. A `stripUngroundedAnimateLabels` forráshoz kötött ábránál a 3/b szerinti korpuszt használja.
6. Tesztek: `visual-patch.test.ts` — a forráscellákból álló tábla megmarad akkor is, ha a cellák szavai nincsenek a lecke
   szövegében; ugyanez `sourceVisualId` nélkül kiesik, és a `dropped` megnevezi az okot. `section-visuals.test.ts` — forráshoz
   kötött ábra mellett nincs pótlás. `single-run-engine.test.ts` — eldobott forrásábra → pontosan egy javító forduló → a
   `telemetry.visuals.dropped` üres vagy az okot tartalmazza.
7. Futtasd a négy tesztfájlt (`cd source`, `node --import tsx --test tests/visual-patch.test.ts tests/section-visuals.test.ts
   tests/lesson-visual-params.test.ts tests/single-run-engine.test.ts tests/studio-role-skills.test.ts`) → `pass`.
8. 0.3 szerinti kapuk. Elvárt: E9, E10 teljesül.

## S3b — Szókeret, szerző, lektor, bank a forrástételekkel

Ág: `feat/abrakeszito-forrasra-kotve-s3b`. Fájlok: `server/studio/lesson-metrics.ts`, `server/studio/single-run/engine.ts`,
`server/studio/step-io.ts`, `server/studio/experience-builder.ts`, tesztek.

1. Szókeret: keresd meg az `engine.ts:658-666` által hívott szószámlálót (`countWords`) és a `lesson-metrics.ts:158` látható-szó
   számítását. A `sourceVisualId`-val jelölt `table`, `ruleBox`, `compareCards`, `pictureCards`, `decisionTree` blokk szövege a
   KERETHEZ mért számból kimarad (a tényleges látható szószám külön mezőben megmarad: `visibleWords` és `budgetWords`). Teszt:
   2000 szavas lecke + 300 szavas forrástábla → a kerethez mért érték 2000, rövidítő forduló nem indul (`maxWords` = 2160 mellett).
2. Szerző (`buildAuthorPrompt`, `step-io.ts:465-561`; katalógus `:392-408`): a katalógus megnevezi az öt új fajtát; szabály: a
   fejezethez rendelt forrástételt a szerző is elhelyezheti `animate` blokként `sourceVisualId`-val; a táblában lévő tartalmat
   prózában nem ismétli meg (legfeljebb egy bevezető mondat). A szókeret mondata (`step-io.ts:502`; a „jelzést rögzít” részét a későbbi S4b javítja) kiegészül: „a forráshoz kötött
   táblázat és kártya nem számít bele”.
3. Lektor (`buildLektorPrompt`, `step-io.ts:596-657`): a jelentés ellenőrzőlistája új ponttal bővül — a megjelenített forrásábra
   egyezik-e a leltár tételével (hiányzó sor, felcserélt oszlop, elveszett ág → `contradicts_source` blokkoló, a blokk útvonalával);
   a hiányzó tételek listája (S1b `visualCoverage.missingIds`) „nem jelent meg” megjegyzésként szerepel, nem blokkolóként.
4. Bank (`experience-builder.ts`): a csomag kérése megkapja a fejezethez rendelt `exercise` és `table` tételeket adatként („A FORRÁS
   SAJÁT FELADATAI ÉS TÁBLÁI — ezekből is kérdezz; a képre hivatkozó feladatot csak úgy vedd át, hogy a kép tartalma a kérdés
   szövegében szerepel”). Az ábrára hivatkozó tétel tiltása (`:613-617`) marad. A csomag tartalom-kulcsa (`:521`) a tételek
   lenyomatával bővül — leltár nélküli fejezetnél a kulcs bájtra változatlan (teszt rögzíti; különben a mentett csomagok
   érvénytelenednének).
5. Tesztek: a bank kérése tartalmazza a fejezet feladat-tételét, másik fejezetét nem; a kulcs változatlan leltár nélkül; a lektor
   promptja tartalmazza a hiányzó azonosítókat.
6. Futtasd: `cd source` majd `node --import tsx --test tests/single-run-engine.test.ts tests/lesson-opener-bank-reuse.test.ts
   tests/bank-repair.test.ts` → `pass`; `npm run check --prefix source`.
7. **Az SK1 kapu élesítése:** `server/studio/gates/config.ts` — `GATE_MODES.sourceCoverage`: `"report"` → `"enforce"`. Előtte
   futtasd a `scripts/gates/run-gates.mts`-t az S2 / S3 tesztjeinek ál-leckéin: a teljes lecke átmegy, a hiányos bukik. Teszt
   rögzíti az üzemmódot (`tests/source-coverage-gate.test.ts`: az alapérték `enforce`).
8. 0.3 szerinti kapuk. Elvárt: E11 teljesül; az E37–E39 élesben is érvényes.

## S4a — A számolási ellenőrző hamis riasztásai

Ág: `fix/gyartas-szamolasi-hamis-riasztas`. Fájlok: `server/studio/tools/arithmetic-claims.ts`, `shared/answer-value.ts`,
`shared/arithmetic-expression.ts` (csak ha az elemzés ott történik), `tests/arithmetic-false-alarms.test.ts` (új).

1. Írd meg ELŐBB a bukó tesztet `tests/arithmetic-false-alarms.test.ts`-ben. A `falseArithmeticClaims(text)`
   (`arithmetic-claims.ts:29`) üres tömböt adjon ezekre:
   `49 = 7²` · `168 = 2³ · 3 · 7` · `12 = 2² · 3` · `45 = 5 · 3²` · `2^3 = 8` · `CO2 = 44` · `CH4 = 16` · `O2 = 32` ·
   `ΔH1 = −120 kJ/mol` · `Q1 = −200 kJ` · `E2 = −70`.
   A `referenceValueProblems(task)` (`shared/answer-value.ts:242`) üres tömböt adjon ezekre a kérdés + referencia párokra:
   „A térkép méretaránya 1 : 50 000. Hány méter a valóságban 4 cm?” + `2000` · „Írd át törtalakba: 4 2/7” + `30/7` ·
   „A fa évente 10–11 cm-t nő. Mennyit nő 20 év alatt legalább?” + `200` · „Bontsd fel a zárójelet a −3(x − 4) kifejezésben” +
   `−3x + 12`.
2. Ugyanebben a fájlban ellenpróbák (továbbra is hibát kell adniuk): `7 · 8 = 54`, `49 = 6²`, `2³ = 9`, `3/4 + 1/4 = 2`; valamint
   „Mennyi 12 · 12?” + `124` referencia.
3. Futtasd: `cd source` majd `node --import tsx --test tests/arithmetic-false-alarms.test.ts` → az 1. pont esetei buknak, a 2. pont
   esetei átmennek (ez igazolja a hibát).
4. Javítás az `arithmetic-claims.ts`-ben (a lánc-minta és a kivétel-lista körül): (a) a felső indexes és `^` kitevő hatványként
   értékelődik; (b) betűhöz közvetlenül tapadó számjegy (vegyjel, indexelt jel: `CO2`, `ΔH1`, `Q1`) nem önálló szám — a lánc ilyen
   tagot tartalmazó állítást kihagyja; (c) mértékegységgel folytatódó jobb oldal változatlanul vizsgálható.
5. Javítás az `answer-value.ts`-ben a kérdés kifejezésének kiolvasásánál: (a) `a : b` arány / méretarány nem osztás; (b) egész +
   tört egymás után (`4 2/7`) vegyes szám; (c) szám–nagykötőjel–szám (`10–11`) tartomány, nem kivonás; (d) kifejezés előtt álló
   magyar névelő („a”, „az”) nem változó. Regex-visszatekintést (lookbehind) megosztott modulban ne használj
   (`tests/no-lookbehind-client.test.ts`).
6. Futtasd újra a 3. lépés parancsát → minden eset `pass`. Regresszió: `node --import tsx --test
   tests/source-arithmetic-corrections.test.ts tests/single-choice-arithmetic-t5.test.ts` → `pass`.
7. 0.3 szerinti kapuk. Elvárt: E22 teljesül.

## S4b — Idézet-áthelyezés, zárt világ-lista, szókeret-mondat, okok a job kimenetében

Ág: `fix/gyartas-javitokor-megelozes`. Fájlok: `server/studio/single-run/engine.ts`, `server/studio/step-io.ts`,
`server/studio/tools/outline-autofix.ts`, `shared/run-telemetry.ts`, `server/studio/single-run/telemetry.ts`,
`tests/single-run-engine.test.ts`, a terv-séma és az autofix meglévő tesztjei.

1. **Idézet-áthelyezés.** `engine.ts:341-342`: ha `checkVerbatim` nem `ok` és `perFile[sourceFile]` létezik, hívd a
   `relocateQuote(c.quote, perFile[sourceFile])`-t (`server/studio/verbatim.ts:118`). Ha nem `null`, a fogalom `quote` mezője erre
   cserélődik, hibajelzés nincs, és a `telemetry.gates.quotesRelocated` számláló nő; ha `null`, a mai hibaüzenet marad.
   Teszt a `tests/single-run-engine.test.ts`-ben: (a) írásjel- / szóközeltérésű idézet javító forduló nélkül átmegy, a mentett
   idézet szó szerint szerepel az átiratban; (b) a forrásban nem szereplő idézet továbbra is javító fordulót kap.
2. **`visual.world`.** `step-io.ts:307`: a kért alakban a `"world": string` helyére a zárt lista kerül
   (`"world": "<az egyik: ${VISUAL_WORLD_IDS.join(" | ")}>"`). `tools/outline-autofix.ts`: ha a nyers terv `visual.world` értéke
   nincs a `VISUAL_WORLD_IDS`-ben, cseréld a tantárgyhoz javasolt világ azonosítójára (ugyanarra, amelyet a `step-io.ts:294` sor a
   promptba ír), és adj vissza jelzést a javításról. Teszt: `'számegyenes-kaland'` → a javasolt világ, javító forduló nélkül;
   érvényes érték változatlan.
3. **Szókeret-mondat.** `step-io.ts:460`: „a szókeret túllépését minőségi jelzésként rögzíti” → „a szókeret túllépésénél
   rövidítő fordulót kér”. `step-io.ts:502`: „túllépésnél jelzést rögzít” → „túllépésnél a program rövidítő fordulót kér”.
   Előtte `grep -rn "jelzést rögzít\|minőségi jelzésként" source/tests` — ha teszt a régi szövegre állít, az állítást az új
   szövegre írod át (a szöveg a spec szerint változik; ezt a PR-leírásban megnevezed).
4. **Okok a job kimenetében.** `shared/run-telemetry.ts`: új opcionális mező `fixReasons?: Array<{ station: string; section?:
   number; attempt?: number; reason: string }>`; `RunGates`-be `quotesRelocated: number`. `single-run/telemetry.ts`: `addFixReason`
   metódus (a `reason` 300 karakterre vágva; legfeljebb 60 tétel, utána eldobás és `fixReasonsDropped` számláló), a `snapshot`
   kiadja. `engine.ts:221` (állomás-javítókör): minden javító forduló előtt `addFixReason({ station: name, reason:
   problems[0] })`. `engine.ts:763-766` (bankkísérlet): `addFixReason({ station: "gyakorlóbank", section, attempt, reason })`.
   Teszt: bukó állomás-ellenőrzés után a pillanatkép tartalmazza az okot; 61 ok esetén 60 marad és a számláló 1.
5. Futtasd: `cd source` majd `node --import tsx --test tests/single-run-engine.test.ts` → `pass`; utána `npm run check --prefix
   source` → hibátlan.
6. 0.3 szerinti kapuk. Elvárt: E23–E26 teljesül.

## SK3 — Költség- és körszám-plafon

Ág: `feat/futaskeret-sk3`. Fájlok: `shared/run-budget.ts` (új), `server/studio/single-run/telemetry.ts`,
`server/studio/single-run/engine.ts`, `server/studio/experience-builder.ts` (csak az állandók forrása),
`scripts/measure/run-budget-baseline.mts` (új), `scripts/measure/single-run-measure.mts` (a keret átadása),
`tests/run-budget.test.ts` (új), `tests/single-run-engine.test.ts`.

1. Alapvonal ELŐBB (csak olvasva, fizetős hívás nélkül): `run-budget-baseline.mts` a meglévő futások telemetriájából (írásvédett
   tranzakció; azonosító a kimenetbe nem kerül) kiszámolja futásonként a számolt költséget, az összes javító fordulót, a futásidőt,
   és ezek átlagát, 95. percentilisét, legnagyobb értékét. A jelentés mért értékei: átlag 6,64 USD és 18,3 perc, legnagyobb
   11,34 USD és 31 perc. A kimenet a PR-leírásba kerül.
2. `shared/run-budget.ts` (tiszta): `PRICE_PER_MTOK = { input: 4, cached: 0.2, output: 20 }`; `runCostUsd(telemetry)`;
   `RUN_BUDGET_DEFAULT = { stationFixRounds: 3, reviewRounds: 2, packetAttempts: 3, packetRescue: 1, totalFixTurns: 12, warnUsd: 9,
   stopUsd: 12, stopMinutes: 45 }` — a végső számokat az 1. lépés alapvonalából állítod be ezzel a szabállyal: a megállási érték
   a 95. percentilis 1,25-szöröse, de legalább a mért legnagyobb érték; az eltérést a PR-leírás indokolja.
   `budgetVerdict(telemetry, startedAt, now, budget): { state: "ok" | "warn" | "stop"; reason?: string }`.
   A keret felülírható: környezeti változó (`RUN_BUDGET_USD`) és a futás indítási paramétere — csak lefelé szabadon; felfelé
   kizárólag kifejezett paraméterrel (a mérőharness és a folytatás adja át).
3. A mai körkorlát-állandók (`engine.ts:50`, `:71`; a bankkísérletek állandói az `experience-builder.ts`-ben) a
   `RUN_BUDGET_DEFAULT`-ból olvasnak — egy helyen állíthatók; az értékük nem változik.
4. `engine.ts`: a `timed(…)` burkoló (minden modellhívás előtt) meghívja a `budgetVerdict`-et: `warn` → napló és
   `telemetry.gateResults` bejegyzés (egyszer); `stop` → a hívás NEM indul el, az állapot mentődik (a meglévő mentési úton), a job
   kimenetébe `gateStop: { gate: "runBudget", reason }` kerül, a futás megáll. A javító fordulók indítása előtt a `totalFixTurns`
   is ellenőrződik: elérve nincs újabb javító forduló — az állomás a „javítókörök kimerültek” úton zárul.
5. `single-run-measure.mts`: a próbafutás kerete paraméter (`MEASURE_BUDGET_USD`, alapérték 7,5), amelyet a motor megkap.
6. `tests/run-budget.test.ts`: költségszámítás rögzített telemetriára; `ok` / `warn` / `stop` határok; időplafon hamis órával;
   mutációk: 12,01 USD → `stop`; 13. javító forduló → megtagadva; felfelé állító környezeti változó kifejezett paraméter nélkül →
   figyelmen kívül marad. `tests/single-run-engine.test.ts`: a keret elérése után a hamis modell hívásszáma nem nő, a `gateStop`
   kitöltve, az állapot folytatható.
7. 0.3 szerinti kapuk. Elvárt: E41, E42.

## S10 — Mérés (D2: 30 USD keret, eldobható adatbázison)

### S10/0 — A hiánytábla eszközei a repóba (kód-PR, fizetős hívás nélkül; az első mérés előtt)

Ág: `chore/meres-hianytabla`. Fájlok: `scripts/measure/source-gap-table.mts`,
`scripts/measure/fixtures/source-inventory-hm.json`, `…-pt.json`, `scripts/measure/trial-ledger.mts` (mind új).
(A változatosság-mérő szkriptek az SK2-ben kerülnek a repóba.)

1. `fixtures/source-inventory-hm.json` (38 tétel) és `…-pt.json` (39 tétel): a 02-es jelentés leltára gépi alakban — `{ id, page,
   kind (a SOURCE_VISUAL_KINDS egyike vagy "text"), description (saját szavas, ≤ 120 karakter), role, baseline: "igen" | "részben" |
   "nem" }`. A PT-nél minden `baseline` „nem” (nincs „előtte” lecke). Szó szerinti forrásszöveg, a PDF és annak képei NEM
   kerülnek a repóba.
2. `source-gap-table.mts`: bemenet `--lesson <lecke.json> --map <térkép.json> --inventory <fixture> --marks <jelölések.json>`;
   kimenet Markdown hiánytábla (alapvonal | most | forma) + összesítő (igen / részben / nem; vizuális típusonként). A gépileg
   eldönthető részt maga számolja (hány `table` / `decisionTree` / `pictureCards` blokk van; a leltár hány tétele kapott
   `sourceVisualId`-t; a `sourceCoverageGate` eredménye); a tartalmi ítélet (`igen` / `részben` / `nem`) a `--marks` fájlból jön,
   amelyet az értékelő tölt ki tételenként, indoklással.
3. `trial-ledger.mts` — a keret főkönyve: `add --run <címke> --telemetry <fájl>` hozzáírja a futás számolt költségét (az SK3
   `runCostUsd` függvényével) egy JSON-főkönyvhöz a session scratchpadjében; `check --next 7.5` nem nulla kilépési kóddal áll meg,
   ha a halmozott költség + a következő futás plafonja > 30 USD. A főkönyv összegzése a mérési jelentésbe kerül.
4. Füstpróba fizetős hívás nélkül: a `source-gap-table.mts` a fixture-rel és egy üres leckével 38 „nem” sort ad; a főkönyv 4 ×
   7,5 USD után a `check`-nél megáll (egységteszt: `tests/trial-ledger.test.ts`, új).
5. 0.3 szerinti kapuk.

### S10/1 — Első mérés (az SK3 merge után; fizetős)

Futásterv: **2 fizetős futás** (HM „utána”, PT „utána”) + legfeljebb **2 tartalék**. „Előtte” futás NINCS: a HM alapvonala a
meglévő éles lecke (6 / 38), a PT alapvonala a forrásleltár (0 / 39), a változatosságé a kiadott állomány.

1. Olvasd el a `scripts/measure/single-run-measure.mts`-t elejétől a végéig: hogyan indul fájlból (az 1. állomással együtt), és
   melyik `MEASURE_*` kapcsoló mit tesz (`MEASURE_DRY`, `MEASURE_SAME_MAP`, `MEASURE_SAVE_LESSON`, `MEASURE_BUDGET_USD`). Ha
   fájlból nem indítható: állj meg, ez külön kód-szelet (a szkript bővítése), nem megkerülhető a `MEASURE_SAME_MAP` móddal (az
   kihagyja az 1. állomást).
2. Eldobható Postgres-konténer (saját, új konténer; a meglévő fejlesztői adatbázis-konténerhez nem nyúlsz); az éles adatbázis nem
   kell ehhez a méréshez.
3. Száraz futás előbb: `MEASURE_DRY=1` mindkét PDF-fel → a promptok felépülnek, modellhívás nincs. Ellenőrizd a kimenetben, hogy
   az 1. állomás kérése tartalmazza a leltár szerződését, és a futáskeret 7,5 USD.
4. Minden fizetős futás ELŐTT: `trial-ledger.mts check --next 7.5` → nulla kilépési kód. Nem nulla esetén NEM indítasz futást:
   megállsz, és az orkesztrátoron át a tulajdonost kérdezed (a keret emelése tulajdonosi döntés).
5. Éles próbafutás: HM-PDF, majd PT-PDF, egymás után (nem párhuzamosan), `MEASURE_SAVE_LESSON=1`, `MEASURE_BUDGET_USD=7.5`. A
   PDF-ek a tulajdonostól / a munkamenet jegyzeteiből jönnek, a repóba nem kerülnek. Futás közben aktív követés (napló,
   telemetria). Minden futás után `trial-ledger.mts add`. Ha egy futást a futáskeret (SK3) vagy egy kapu megállít: az eredmény
   így is mérési adat — tartalék futást csak akkor használsz, ha a megállás oka a mérőkörnyezet hibája (nem a gyártásé), vagy az
   orkesztrátor kéri.
6. Kiértékelés: `source-gap-table.mts` mindkét leckére (a jelöléseket tételenként, a lecke JSON-ja és a megjelenített oldal
   képernyőképei alapján töltöd ki); a futás telemetriájából: állomásonkénti token / idő / `fixTurns`, `gates.visualsFound /
   visualsDropped`, `telemetry.visuals`, `fixReasons`, `gateResults` (SK1, SK3), `coverage.visuals`; a futás számolt ára.
7. Eredmény: `docs/handoffs/2026-11-18-tananyag-minoseg-meres-1.md` (hiánytábla, költség a főkönyvből, eltérés a terv becsléseitől,
   a kapuk ítélete, a következő szeleteket érintő leletek).

### S10/2 — Záró mérés (az S9 után)

1. Modellhívás nélküli rész (mindig lefut): `scripts/gates/run-gates.mts` és `source-gap-table.mts` az S10/1 mentett leckéin a
   végleges kóddal (a megjelenítést és a kapukat méri újra, a gyártást nem); a kiosztás szimulációja (S6a 6. lépés — E19); a
   `variety-measure.mjs --baseline` a teljes kiadott állományon, csak olvasva (kontroll: a régi leckék nem változnak) és az új
   leckéken; `gate-baseline.mts` (SK5).
2. Fizetős rész — csak ha `trial-ledger.mts check --next 7.5` engedi: a tartalék futásokból a HM-PDF és (ha még belefér) a PT-PDF
   újragyártása a végleges `main`-en, az S10/1 4–6. lépése szerint. Ha a keret nem engedi: nem indítasz futást; a jelentés
   kimondja, hogy a gyártás záró mérése a keret miatt elmaradt (NOT RUN + ok + kockázat), és az orkesztrátor a tulajdonost kérdezi.
3. Eredmény: `docs/handoffs/2026-11-18-tananyag-minoseg-meres-2.md` — a terv 6. szakasz S10 célértékei tételenként: teljesült /
   nem teljesült / nem mért, számmal. Nem teljesült célnál a munka folytatódik (új szelet a tervben), nem a jelentés zárja le.

## S5a — Bátorító nyitások kódszótárból

Ág: `feat/valtozatossag-visszajelzes-s5a`. Fájlok: `shared/seeded.ts` (új), `shared/lesson-feedback-openers.ts` (új),
`shared/lesson-ui-text.ts`, `shared/lesson-opener.ts`, `client/src/lesson-runtime/VerdictFeedback.tsx`,
`client/src/lesson-runtime/LessonExperienceView.tsx`, `tests/seeded.test.ts`, `tests/lesson-feedback-openers.test.ts` (újak),
`tests/lesson-opener.test.ts`.

1. `shared/seeded.ts`: `seedFrom(text: string): number` (FNV-1a, 32 bit), `seededPick<T>(items: readonly T[], seed: number): T`,
   `seededShuffle<T>(items: readonly T[], seed: number): T[]` (mulberry32 + Fisher–Yates). Tiszta, `Math.random` és óra nélkül.
   Teszt: azonos magra azonos kimenet; rögzített elvárt sorrend három magra; a keverés permutáció.
2. `shared/lesson-feedback-openers.ts`: korosztályonként (a `shared/lesson-band.ts` sávjai szerint) legalább 24 hibás-nyitás és 12
   helyes-nyitás, magyarul, rövid (≤ 40 karakter), ismétlődő kezdőszó nélkül (egy kezdőszó a készlet legfeljebb 15%-a).
   `feedbackOpener(kind: "right" | "wrong", band, key: string): string` — `seededPick` a `seedFrom(key)` magból; a `key` a lecke
   azonosítója + a kérdés azonosítója. `LEGACY_OPENER_PREFIXES`: a régi, modell írta nyitások mintái („Jó próba”, „Szép
   próbálkozás”, „Ügyes gondolat”, „Pontosan”, „Így van”, „Helyes” és ragozott / vesszős folytatásaik „, de” kötéssel).
   `stripLegacyOpener(text: string): string` — a minta levágása; ha a maradék 12 karakternél rövidebb, az eredeti szöveg marad; a
   maradék nagybetűvel kezdődik.
3. `VerdictFeedback.tsx` (és a `LessonExperienceView.tsx` visszajelzés-helyei): megjelenítés = ítélet (`VERDICT_TEXT`,
   `lesson-ui-text.ts:7`) + `feedbackOpener(…)` + `stripLegacyOpener(stripVerdictPrefix(szöveg))`. Egy kérdésnél a nyitás a
   munkameneten belül nem változik (a kulcs determinisztikus).
4. `shared/lesson-opener.ts:115` és `:136`: kikerül a „Jó próba, de itt a … a kérdés, ezért …” mintamondat és a „rossz válasznál az
   első mondat bátorító” előírás; helyette: „Bátorító vagy megerősítő nyitást NE írj — azt a program adja. Rossz válasznál: mi
   tévesztett meg, mit kérdezett a kérdés, mi a helyes gondolatmenet. Helyes válasznál: röviden, miért jó.”
   `LESSON_OPENER_VERSION` (`:6`): `"nyitomese-1"` → `"nyitomese-2"`. A lektor ellenőrzőlistájából a bátorító első mondat
   számonkérése kikerül (ugyanebben a fájlban).
5. Tesztek: a készlet mérete és a 15%-os kezdőszó-korlát; determinizmus; 200 különböző kulcson a leggyakoribb nyitás aránya < 10%;
   a 03-as jelentés öt leggyakoribb régi nyitása levágódik; rövid maradéknál az eredeti marad; a `lesson-opener.test.ts`-ben a
   prompt nem tartalmazza a „Jó próba” szót, és a verzió `nyitomese-2`. A `tests/lesson-opener-bank-reuse.test.ts` elvárásait
   olvasd el: a verzióemelés hatása a mentett csomagokra a teszt szerint kezelendő.
6. Böngészős regresszió (0.4): `playwright.lesson-practice.config.ts`, `playwright.lesson-interactions.config.ts` → `passed`.
7. 0.3 szerinti kapuk. Elvárt: E13, E14 teljesül.

## S5b — Módszersorrend, nyitásformák, névkészlet

Ág: `feat/valtozatossag-nyitas-s5b`. Fájlok: `shared/lesson-bank-plan.ts`, `shared/lesson-opener.ts`,
`shared/lesson-block-label.ts`, a hívók (`server/studio/experience-builder.ts`, `server/studio/step-io.ts` — csak a mag
átadása), `tests/lesson-opener.test.ts`, a bankterv meglévő tesztje.

1. `lesson-bank-plan.ts:43-46`: a `[...METHOD_KINDS, "gate"]` sor a körbeosztás előtt `seededShuffle`-lel keveredik; a mag a
   térkép azonosítójából jön (új, opcionális `seed?: number` paraméter; mag nélkül a mai sorrend marad — a régi hívók és a mentett
   csomagok változatlanok). A „mind a tíz fajta + két kapukérdés” és a „csomagonként legalább két fajta” feltétel marad.
   Teszt: 50 különböző magra a feltételek teljesülnek; az első módszer fajtája legalább 6-féle; mag nélkül a kimenet bájtra a régi.
2. `lesson-opener.ts`: `OPENING_FORMS` — évfolyamlépcsőnként 3–4 forma (mese; rejtély / megfigyelés; „mit gondolsz?” jóslás;
   hétköznapi helyzet), mindegyik 2–3 mondatos leírással; `STORY_ARC` (`:72`) „PONTOSAN 5 mondat” → „3–6 mondat”;
   `HERO_NAMES` — legalább 40 magyar keresztnév (vegyes nemű; a 03-as jelentés három leggyakoribb neve nélkül);
   `lessonOpenerContract(…, seed)` a formát és a nevet a magból adja („A hős neve: <név>. Nyitásforma: <forma>.”). A Célkártya
   négy eleme változatlan. A `:133` sor „Peti szerint…” példamondata kikerül (helyette leírás: „egy megnevezett szereplő téves
   állítása”). `LESSON_OPENER_VERSION`: `"nyitomese-3"`.
3. `lesson-block-label.ts`: a nyitóblokk fejléce az új formákat is felismeri (kódszótár).
4. A mag átadása: a `step-io.ts` szerző-promptja és a bankterv hívója a `seedFrom(mapId)` értéket kapja (az `engine.ts`-ből).
5. Tesztek: forma- és névkiosztás determinisztikus; 100 magra legalább 3 forma és legalább 25 név fordul elő; a prompt nem
   tartalmazza a „PONTOSAN 5” és a „Peti” szöveget; verzió `nyitomese-3`.
6. 0.3 szerinti kapuk. Elvárt: E15, E16 teljesül.

## S6a — Fejezetív-készlet

Ág: `feat/valtozatossag-fejezetiv-s6a`. Fájlok: `shared/lesson-section-shapes.ts` (új), `server/studio/step-io.ts`,
`server/studio/role-skills.ts`, `shared/lesson-arc.ts` (csak ha a 3. lépés szerint kell), `tests/lesson-section-shapes.test.ts`
(új), `tests/lesson-arc.test.ts`, `tests/studio-role-skills.test.ts`.

1. `lesson-section-shapes.ts`: `SECTION_SHAPES` — hat minta, mindegyik `{ id, blocks: BlockKind[], fits: Array<"procedure" |
   "description" | "comparison" | "any">, note }`: `alap` (explain, example, animate, check, recap) · `megmutatas` (explain,
   animate, example, try, check) · `kerdesfelveto` (explain[why], example, check, explain[deeper], recap) · `gyakorlo` (explain,
   example, try, check, recap) · `osszehasonlito` (explain, animate, example, example, check) · `donteshelyzet` (explain, example,
   animate[decisionStory], check). `assignSectionShapes(sectionKinds: Array<"procedure"|"description"|"comparison"|"any">, seed:
   number): string[]` — szabályok: a fejezethez illő minták közül a magból választ; szomszédos fejezet nem kapja ugyanazt; egy
   minta a fejezetek legfeljebb 40%-a (felfelé kerekítve); 1–2 fejezetnél az első két illő minta; a lecke első fejezete elé a
   nyitóblokkok (Célkártya, nyitás) változatlanul kerülnek; az utolsó fejezet mindig `recap`-pal zárul (ha a minta nem azzal
   végződik, a kiosztás hozzáfűzi).
2. `tests/lesson-section-shapes.test.ts`: determinizmus; a szomszéd- és a 40%-os szabály 3…12 fejezetre, 200 magra; 1 és 2 fejezet.
3. **A kapu próbája:** a `tests/lesson-arc.test.ts`-ben mind a hat mintából épített ál-lecke (nyitóblokkokkal, záró `recap`-pal)
   átmegy a `shared/lesson-arc.ts` kapuján (`:86`, `:107`, `:186`, `:198`). Ha valamelyik elbukik: a MINTÁT igazítod, nem a kaput —
   kivéve, ha a bukás oka nem a „tanítás a kérdés előtt” vagy a „lecke összefoglalóval zárul” szabály; ilyenkor a kapu módosítását
   külön commitban, indoklással, új teszttel végzed, és a `LESSON_ARC_CONTRACT` (`:221-232`) szövegét is hozzáigazítod.
4. `step-io.ts`: a `buildPedagoguePrompt` a fejezettípust kéri a tervtől (`sectionKind` a fenti négy értékkel; a séma opcionális
   mezője), a `:325` és `:341` egyetlen ívet megnevező mondata helyére ez kerül: „a blokksorrendet a program osztja ki a
   fejezettípusból; a plannedBlocks mezőt a kiosztott minta szerint töltsd ki”. A kiosztás a terv ELLENŐRZÉSE után fut: a program a
   `plannedBlocks`-ot a kiosztott mintára írja át (determinisztikus, az `outline-autofix` mellett), a szerző ezt kapja.
   `role-skills.ts`: a tervező skill 2–3. lépése (`:95-96`) és a szerző 1. lépése (`:116`) változatlanul a „plannedBlocks
   sorrendjét követed” elvet mondja — a tervező skill ív-mondata a kiosztásra hivatkozik. A skillek hosszkorlátja marad.
5. Mag: `seedFrom(mapId)`; az `engine.ts:602` hívása adja át.
6. **Szimuláció (modellhívás nélkül):** `scripts/measure/shape-simulation.mts` (új) — bemenet a fejezetszámok eloszlása (a 03-as
   mérés adataiból, szkriptparaméterként vagy a `variety-fetch` kimenetéből), minden fejezettípus `any`; kimenet: a leggyakoribb
   minta aránya és az azonos-minta valószínűség. Elvárt: < 35% és < 20% (E19). Az eredmény a PR-leírásba kerül.
7. Futtasd: `cd source` majd `node --import tsx --test tests/lesson-section-shapes.test.ts tests/lesson-arc.test.ts
   tests/studio-role-skills.test.ts tests/single-run-engine.test.ts` → `pass`.
8. 0.3 szerinti kapuk. Elvárt: E17–E19 teljesül.

## S6b — `try` minimum és rotáció, szerzői hangok

Ág: `feat/valtozatossag-try-hang-s6b`. Fájlok: `shared/lesson-section-shapes.ts`, `shared/lesson-band.ts`,
`server/studio/step-io.ts`, `shared/run-telemetry.ts`, `server/studio/single-run/engine.ts`, tesztek.

1. Előfeltétel-ellenőrzés: a `try` blokk eredménye szerepel-e tanulói statisztikában vagy a fejezet Próbájában (`grep -rn
   "\"try\"\|kind === \"try\"" source/shared source/client/src/lesson-runtime source/server`). Ha a pontozásba beleszámít: állj
   meg és jelentsd (a terv szerint a pontozás nem változhat).
2. `try`-kiosztás: `assignTryKinds(sectionKinds, seed)` a `lesson-section-shapes.ts`-ben — a fejezetek legalább harmadára (felfelé
   kerekítve) `try` jut; fajta a fejezettípusból: `procedure` → `dragSort`, `comparison` → `match`, `description` → `fillBlank`,
   `any` → a magból forgatva; két egymást követő `try` nem azonos fajtájú, ha van választás. A kiosztott minta kiegészül a `try`
   blokkal a `check` elé, ha a mintában nincs.
3. Jelzés, nem kapu: `telemetry.gates.tryShare` (0–1, két tizedes) és `qualityNotes` bejegyzés, ha a kész leckében a `try` aránya
   1/3 alatt marad.
4. `lesson-band.ts:59-68`: sávonként 2–3 leírt szerzői hang (`BAND_VOICES`), hangonként 2–3 mondat (mondatritmus, a kérdések
   aránya, a példák keretezése); `bandVoiceForPrompt(band, seed)`; a `bandRegisterForPrompt` a kiválasztott hang leírását is adja.
   A tények és a fogalmak szóhasználatára a hang nem hat (ezt a szöveg kimondja).
5. Tesztek: a `try`-arány ≥ 1/3 minden 3…12 fejezetes kiosztásnál; fajta a típus szerint; hang determinisztikus, sávonként
   legalább 2 fordul elő 50 magon.
6. 0.3 szerinti kapuk. Elvárt: E20 teljesül.

## S6c — Ábrafajta-terv

Ág: `feat/valtozatossag-abrafajta-s6c`. Fájlok: `shared/visual-kind-plan.ts` (új), `shared/lesson-visual-params.ts`,
`server/studio/role-skills.ts`, `server/studio/step-io.ts`, `tests/visual-kind-plan.test.ts` (új),
`tests/lesson-visual-params.test.ts`, `tests/explanatory-visuals.spec.ts` (bővül).

1. **Böngészős próba ELŐBB** (0.4): a négy soha nem használt, leíratlan fajta (`fraction`, `map`, `wordBuilder`, `sentenceParts`)
   megjelenítője ál-leckével, három nézetben. Amelyik megfelel (nincs átfedés / levágás, a sáv színeit használja): bekerül a
   szerződésbe. Amelyik nem: NEM kerül be, jegy készül róla, és a `visual-kind-plan` nem ajánlja.
2. `VISUAL_PARAMS_CONTRACT`: a megfelelt fajták paraméter-alakja (a `VISUAL_PARAM_SCHEMAS` meglévő sémáiból, egy-egy sorban).
3. `visual-kind-plan.ts`: `SUBJECT_KIND_HINTS` (tantárgy → ajánlott fajták: nyelvtan → `sentenceParts`, `wordBuilder`; idegen nyelv
   → `wordBuilder`, `pictureCards`, `table`; törtek → `fraction`; földrajz / történelem → `map`, `timeline`; biológia →
   `labeledShape`; kémia / fizika → `process`, `barChart`); `kindShareProblems(lesson): string[]` — jelzés, ha egy fajta a lecke
   NEM forráshoz kötött ábráinak több mint 40%-a (legalább 5 ábránál).
4. `role-skills.ts:145-146`: a fajtaválasztó a tantárgyi ajánlást kapja (a promptépítő illeszti be); a név szerint megadott
   színlista helyére: „színek kizárólag a sáv tokenjeiből (accent, accent2, accent3, semleges)”. `step-io.ts:691` „prefer
   labeledShape” lebeszélő mondata marad, ha a `geometry` megjelenítő az 1. lépésben nem lett vizsgálva.
5. A 40%-os szabály az ábrák állomás ellenőrzésében jelzés (`qualityNotes`), nem blokkoló; a `telemetry.visuals` kiegészül a
   fajtaeloszlással.
6. Tesztek: az ajánlótábla minden ismert tantárgyra ad legalább két fajtát; a 40%-os jelzés 10 ábrából 5 azonosnál megszólal,
   4-nél nem; a forráshoz kötött ábrák nem számítanak.
7. 0.3 szerinti kapuk. Elvárt: E21 teljesül.

## SK2 — Változatosság gépi mérőszáma és küszöbe (az S6c után)

Ág: `feat/valtozatossag-kapu-sk2`. Fájlok: `shared/variety-metrics.ts` (új), `server/studio/gates/variety-gate.ts` (új),
`scripts/measure/variety-fetch.mjs`, `scripts/measure/variety-measure.mjs`, `scripts/measure/fixtures/variety-baseline.json`
(újak), `server/studio/single-run/engine.ts`, `tests/variety-metrics.test.ts` (új).

1. A két `variety-*.mjs` szkript a munkamenet jegyzeteiből kerül át. Átvétel előtt olvasd végig mindkettőt: kapcsolati szöveg,
   e-mail-cím, sorazonosító, abszolút útvonal nem maradhat benne; a `--env` fájl útvonala paraméter; a lekérdezés írásvédett
   tranzakcióban fut; a kimenet alapértelmezett helye a session scratchpadje.
2. `shared/variety-metrics.ts` (tiszta; a mérőszkript is ezt használja): `sectionPattern(section)`, `patternShares(lessons)`,
   `samePatternProbability(lessons)`, `feedbackOpenerShares(lessons)` (az első két szó), `animKindShares(lesson)`,
   `tryShare(lesson)`. `VARIETY_THRESHOLDS = { topPatternShare: 0.35, samePatternProbability: 0.2, topFeedbackOpenerShare: 0.1,
   maxKindShare: 0.4, minTryShare: 1 / 3 }`.
3. `fixtures/variety-baseline.json`: a 03-as jelentés összesített alapvonala (239 lecke): leggyakoribb minta 0,616; azonos minta
   0,404; „Jó próba” 0,468; három helyes-nyitás 0,858; nem használt ábrafajta 6; `try` a blokkok 0,007 része. Csak összesített
   szám; leckecím, azonosító nincs benne.
4. `variety-measure.mjs`: új `--baseline <fájl> --since <dátum>` mód — a megadott dátum utáni leckéket a küszöbökhöz méri,
   táblázatot ír (alapvonal | most | küszöb | megfelel), és nem nulla kilépési kóddal zár, ha valamelyik állományszintű küszöb
   nem teljesül (legalább 10 új leckénél; kevesebbnél „kis minta” jelzés, nulla kilépési kód).
5. `gates/variety-gate.ts` — leckeszintű kapu, bejegyezve a `GATE_REGISTRY`-be: (a) **kapu**: minden fejezet blokksora egyezik a
   kiosztott mintával (S6a; a forráshoz kötött ábrák és a kiosztott `try` hozzáadása megengedett eltérés); a visszajelzésekben
   nincs a régi bátorító előtag — ha van, a program a mentés előtt levágja (`stripLegacyOpener`), modellkör nélkül, és megszámolja;
   (b) **jelzés** (nem állít meg): `tryShare < minTryShare`, egy fajta aránya `> maxKindShare`. A kapu (a) részének bukása:
   egyetlen célzott javító forduló a szerzőnél az eltérő fejezetekre (az SK3 keretén belül), utána megállás és jelzés.
   Üzemmód a `GATE_MODES`-ban: kezdőérték `report`; `enforce`-ra az S10 záró mérése után, orkesztrátori döntéssel vált (a váltás
   egysoros, teszttel).
6. `tests/variety-metrics.test.ts`: kézzel számolt elvárás 4 szintetikus leckére; mutációk: minden fejezet azonos mintájú →
   a kapu bukik; egy fejezet eltér a kiosztottól → bukik a fejezet megnevezésével; „Jó próba, de…” kezdetű visszajelzés →
   levágva és megszámolva; 10 ábrából 5 azonos → jelzés. A mérő füstpróbája 2 leckés szintetikus mintán.
7. 0.3 szerinti kapuk. Elvárt: E40.

## S7a — Nyílt válasz szabályai v2 (kanban #131)

Előfeltétel: a terv D6 döntése végrehajtva — a fél pontos pontozó a `main`-en van. Ellenőrzés: `shared/lesson-experience-score.ts`
`minWords` alatti ága 0,5-öt ad a minden kötelező feltételt teljesítő válaszra (olvasd el a kódot és a tesztjét). Ha nincs a
`main`-en: ÁLLJ MEG, a szelet nem indítható.

Ág: `chore/nyilt-valasz-szabalyok-v2`. Fájlok: `shared/lesson-experience-score.ts`, `shared/lesson-experience.ts`,
`server/studio/role-skills.ts`, `server/studio/answer-key-writer.ts`, `server/studio/experience-builder.ts`,
`shared/run-telemetry.ts`, `tests/scoring-v2.test.ts`, `tests/open-answer-rules-version.test.ts` (új),
`tests/studio-role-skills.test.ts`, `tests/bank-repair.test.ts`, `tests/single-run-engine.test.ts`,
`tests/score-english-negation.test.ts`, `docs/lesson-improvement.md`.

1. Kanban: a #131 jegyet vedd munkába (a `docs/kanban.md` szerinti paranccsal; ha a CLI a dokumentumtól eltér, a tényleges
   parancsot jegyezd fel az S9-hez).
2. `lesson-experience-score.ts:307` (1. szabály) új szövege: „Szó = szám vagy betűsor; a kötőjeles szó 2 szó, az írásjel 0 szó;
   csak az első 500 szó számít. minWords alatt: ha MINDEN kötelező feltétel teljesül (számolósnál minden részeredmény helyes) →
   0,5 (tömör válasz), különben 0; 1 pont csak minWords-től. A minWords a legrövidebb, egész mondatban KIFEJTETT helyes válasz
   szószáma, nem a mintáé.” `:309` (3. szabály): „Pontérték minWords-től: a kötelező feltételek (required, requiredPhrases,
   requiredOrder) kevesebb mint fele → 0 (számolósnál ez nem nulláz); nem mind → 0,5; mind → 1, ha a needsSentence és a tagadás is
   rendben.” A „0,5” értéket a kód állandójából fűzd a szövegbe, ha a pontozó állandóként tartja.
3. Ugyanott: `export const OPEN_ANSWER_RULES_VERSION = "open-answer-2" as const;`.
4. `tests/scoring-v2.test.ts:123`: a korlát `< 3500` → `< 3800`, a sor fölé megjegyzés: „Spec 2026-11-18-tananyag-gyartas-minoseg,
   5. szakasz 9. pont: a 2026-11-17-i tulajdonosi döntés (tömör válasz = fél pont) szövege 3 491 → ~3 657 karakter”. Ha a tényleges
   hossz 3 800 fölé esne, a szöveget tömöríted (az 5. szabály példáit), a korlátot tovább nem emeled. Új állítások ugyanitt: a
   szöveg tartalmazza a „0,5 (tömör válasz)” és a „Pontérték minWords-től” kifejezést.
5. `tests/open-answer-rules-version.test.ts`: (a) a verzió `open-answer-2`; (b) **lenyomat-őr**: az `OPEN_ANSWER_RULES_HU`
   `sha256` lenyomatának első 12 jegye egyezik a tesztben rögzített értékkel (az értéket a kész szövegből számolod ki és írod be;
   a hibaüzenet: „a szabályszöveg változott — emeld az OPEN_ANSWER_RULES_VERSION-t és frissítsd a lenyomatot”); (c) a verzió és a
   lenyomat együtt változik: a tesztben a `{ verzió → lenyomat }` pár áll.
6. Fogyasztók egy commitban: `role-skills.ts:168` (bank skill 2. lépés): „minWords = a legrövidebb, egész mondatban kifejtett
   helyes válasz szószáma; a tömör, kulcsszavas válasz fél pontot kap” — a skill hosszkorlátja (`< 5200`) marad, szükség esetén
   tömörítesz · `shared/lesson-experience.ts:354`: „üres válasz nulla, részválasz fél pont” mellé „, tömör, de teljes válasz fél
   pont” · `answer-key-writer.ts:17-18`: a helyes próbák „legalább egy teljes mondat” (a „rövidebben és hosszabban” megmarad) ·
   `experience-builder.ts:521`: a csomag kulcsába `rules: OPEN_ANSWER_RULES_VERSION` · `shared/run-telemetry.ts` + a pillanatkép:
   `rulesVersion`.
7. A szöveget szó szerint állító tesztek (`tests/score-english-negation.test.ts:77-78`, `tests/bank-repair.test.ts:111`,
   `tests/single-run-engine.test.ts:320-322`): futtasd; amelyik a megváltozott mondatra állít, azt az új szövegre írod át (a
   viselkedési állításokhoz nem nyúlsz), és a PR-leírásban tételesen felsorolod.
8. `docs/lesson-improvement.md`: a pontozási mércét leíró mondatok (a jelentés szerint a 15., 154., 160. sor — olvasd el és
   igazítsd) az új szabályra.
9. Futtasd: `cd source` majd `node --import tsx --test tests/scoring-v2.test.ts tests/open-answer-rules-version.test.ts
   tests/studio-role-skills.test.ts tests/bank-repair.test.ts tests/single-run-engine.test.ts
   tests/score-english-negation.test.ts tests/lesson-opener-bank-reuse.test.ts` → `pass`.
10. 0.3 szerinti kapuk. A mérés (ugyanarról a térképről előtte–utána, `MEASURE_SAME_MAP=1`) az S10/2 része, a D2 keretéből.
    Elvárt: E27 teljesül.

## S7b — A döntőbíró fél pontos plafonja (D5 döntés: igen)

Ág: `fix/dontobiro-fel-pontos-plafon`. Fájlok: `server/arbiter/arbiter.ts`, `shared/lesson-experience-score.ts` (csak ha a
pontozó eredménye nem jelöli az ágat), az arbiter meglévő tesztjei, `playwright.lesson-arbiter.config.ts` (regresszió).

1. A pontozó eredménye jelölje a „tömör, de teljes” ágat (pl. `concise: true` az `AnswerScore`-ban) — ha a `main`-en lévő
   pontozó már ad ilyen jelölést vagy egyedi `reason` kódot, azt használd, új mezőt ne vezess be.
2. `arbiter.ts:90-93` (`combineVerdicts`): ha `det.concise`, a végső pont legfeljebb
   0,5 — a döntőbíró indoklása megjelenhet, a pont nem emelkedik. `ARBITER_VERSION` (`:11`): `"arbiter-2"` → `"arbiter-3"` (a
   gyorsítótár-kulcs része — a régi ítéletek nem érvényesülnek az új szabály alatt).
3. Tesztek: tömör + döntőbíró „ok” → 0,5; nem tömör, hiányos + döntőbíró „ok” → 1 (a mai viselkedés marad); döntőbíró nélkül
   változatlan. Böngészős regresszió: `playwright.lesson-arbiter.config.ts` → `passed`.
4. 0.3 szerinti kapuk. Elvárt: E28 teljesül.

## S8a — Brit hang: azonnali, ingyenes javítás

Ág: `fix/brit-hang-rangsor-s8a`. Fájlok: `shared/voice-rank.ts` (új), `client/src/lesson-runtime/ExperienceSpeech.tsx`,
`server/ai/lesson-html-spec.ts`, `shared/speech-fallback.ts` (csak a 4. lépés eredménye szerint), `tests/voice-rank.test.ts` (új),
`tests/speech-fallback.test.ts`.

1. `shared/voice-rank.ts` (tiszta, DOM-típus nélkül): `rankVoices(voices: Array<{ name: string; lang: string; localService?:
   boolean; default?: boolean }>, language: string): number[]` — a hangok indexe a legjobbtól. Pontozás: pontos régióegyezés
   (`en-GB`) > azonos nyelv más régió; ezen belül a név szerinti minőségjelző („Natural”, „Online”, „Neural”, „Premium”,
   „Enhanced”) előre; ismert brit hangnevek listája (állandó tömb, a böngészők dokumentált hangneveiből) előre; hálózati hang
   (`localService === false`) a jelzés nélküli helyi hang előtt; azonos pontnál az eredeti sorrend. Más nyelvre (pl. `de-DE`)
   ugyanaz a szabály a névlista nélkül.
2. `ExperienceSpeech.tsx:78-84` (`pickVoice`): a `rankVoices` első eleme; üres lista → `undefined` (a `lang` dönt), és a
   `voiceschanged` esemény után a következő felolvasás már rangsorolt hangot kap.
3. `lesson-html-spec.ts:478-482`: a `u.pitch = 1.1;` sor törlődik; a hangválasztó ciklus előbb pontos `lang`-egyezést, annak
   híján azonos nyelvű (`lang` előtag) hangot keres, a névben „Natural” / „Online” jelzésűt előnyben részesítve (a beágyazott kód
   önálló marad — a megosztott modult a generált HTML nem tudja importálni). A változás csak az ezután gyártott / okosított
   HTML-leckékre hat; a meglévő anyagok nem íródnak át. Ha a specifikáció szövegére lenyomat- vagy verzióteszt van, a verziót
   emeled.
4. Szerveres tartalék — mérés előbb, ingyenesen: egy helyi szkripttel (a session scratchpadjéből) próbáld ki, hogy a
   `google-tts-api` elfogad-e brit kódot (`en-GB`, `en-gb`, `en-uk`) egyetlen rövid szóra. (a) Ha igen: `speech-fallback.ts`
   `ttsLang` a brit kódot megtartja, a `TTS_LANGS` bővül, a `tests/speech-fallback.test.ts:17` elvárása az új, mért viselkedésre
   változik (dokumentált spec-változás: E31). (b) Ha nem: a `ttsLang` marad; a kliens `en-GB` lecke esetén a szerveres tartalékot
   csak akkor hívja, ha a böngészőben egyetlen angol hang sincs — erre új egységteszt készül, a meglévő teszt változatlan.
   A mérés eredményét a PR-leírás rögzíti.
5. `client/src/lib/tts.ts`: ebben a szeletben NEM módosul (a `tests/tts-guard.test.ts` rögzíti a viselkedését, és a játékok is
   hívják); a játékok hangválasztása jegyre kerül.
6. `tests/voice-rank.test.ts`: Windows-szerű lista (régi helyi brit hang + „Natural” brit hang + amerikai hang) → a „Natural”
   brit az első; csak amerikai hang → az amerikai; üres lista → üres; `en_GB` aláhúzásos kód is egyezik; német lecke nem kap angol
   hangot.
7. Böngészős regresszió (0.4): `playwright.lesson-practice.config.ts` → `passed`.
8. 0.3 szerinti kapuk. Elvárt: E31, E32 teljesül.

## S8b — Hangfájlok az adatbázisban: tábla, tároló réteg, végpont, lejátszás (D3, D4)

Ág: `feat/brit-hang-tarolo-s8b`. Fájlok: `migrations/00NN_lesson_tts_audio.sql` (új — NN a következő szabad sorszám a szelet
indításakor; a legutóbbi ma `0041`), `shared/schema.ts`, `shared/tts-audio-key.ts` (új), `server/tts/audio-store.ts` (új),
`server/tts/audio-routes.ts` (új), `server/routes.ts` (csak a bekötés), `client/src/lesson-runtime/ExperienceSpeech.tsx`,
`tests/tts-audio-key.test.ts`, `tests/tts-audio-store.test.ts`, `tests/lesson-speech-audio.spec.ts` +
`playwright.lesson-speech-audio.config.ts` (újak, port 5198). Ha a diff 400 sor fölé menne: S8b-1 (migráció, séma, tároló,
végpont) és S8b-2 (kliens, böngészős próba) külön PR.

1. **A migráció rendje a repóban (olvasd el, mielőtt írsz):** `migrations/00NN_*.sql` fájlok + `server/migrate.ts`; élesben a
   telepítés építési lépése futtatja (`render.yaml:7`: `npm run db:migrate`). A `db:push` (`drizzle-kit push`) TILOS. Éles
   adatbázison migrációt kézzel nem futtatsz; a migráció a merge utáni telepítéssel érvényesül. Nézd meg a `0039` migrációt (a
   `lesson_clip_media` tábla) mintának, és azt, hogyan kezeli a `server/migrate.ts` az újrafuttatást.
2. Migráció: `CREATE TABLE IF NOT EXISTS lesson_tts_audio (id char(32) PRIMARY KEY, voice_version varchar(16) NOT NULL, language
   varchar(8) NOT NULL, mime varchar(40) NOT NULL, bytes bytea NOT NULL, size integer NOT NULL, created_at timestamptz NOT NULL
   DEFAULT now());` + index a `(voice_version, language)` párra. Csak hozzáadás; meglévő táblát nem érint; visszavonás: `DROP
   TABLE lesson_tts_audio` (a kliens ilyenkor a böngészőhangra esik).
3. Drizzle-séma (`shared/schema.ts`, a `lessonClipMedia` mellé, azonos stílusban): `lessonTtsAudio` — a mezők a migrációval
   pontosan egyeznek (a review „migráció ↔ Drizzle-séma” pontja). A felolvasott szöveg NEM tárolódik (a kulcs a lenyomata).
4. `shared/tts-audio-key.ts`: `TTS_VOICE_VERSION` (állandó, pl. `"gb-1"` — a hang cseréje új értéket, így új kulcsokat ad),
   `normalizeSpeechText(text)` (NFC, szóközök összevonása, szélek levágása; a kis- / nagybetű megmarad), `ttsAudioHash(text,
   language): Promise<string>` — `sha256(TTS_VOICE_VERSION + "\n" + language + "\n" + normalizeSpeechText(text))` első 32 hexa
   jegye (WebCrypto a böngészőben és Node-ban is), `ttsAudioPath(id)` → `/api/tts/lesson-audio/<id>`, `TTS_AUDIO_LANGUAGES =
   ["en-GB"]`.
5. **Cserélhető tároló réteg** — `server/tts/audio-store.ts`: felület `TtsAudioStore { get(id): Promise<{ mime; bytes; size } |
   null>; has(ids: string[]): Promise<Set<string>>; put(row): Promise<"stored" | "exists">; totalBytes(): Promise<number> }`;
   megvalósítás `DbTtsAudioStore` (Drizzle); a kiválasztás egy helyen (`ttsAudioStore()` gyár). A végpont, a gyártó és az SK4 kapu
   CSAK a felületet használja — későbbi átköltöztetésnél új megvalósítás kerül a gyár mögé, a lecke JSON-ja, a kulcs és a kliens
   útvonala nem változik.
   **Méretőr a `put`-ban:** `TTS_AUDIO_LIMITS = { maxTotalBytes: 40 * 1024 * 1024, maxFileBytes: 300 * 1024 }` (az összplafon
   környezeti változóval csak lefelé állítható; felfelé kódváltozás, tehát review kell); ha `totalBytes() + size >
   maxTotalBytes` vagy a fájl túl nagy → `TtsStorageLimitError`, írás nincs. A `put` ellenőrzi, hogy `mime === "audio/mpeg"`, a
   `size` egyezik a bájtok hosszával, és az `id` 32 hexa jegy.
   **Spec-pontosítás 2026-11-18 (orkesztrátori döntés a független review alapján; a tulajdonosnak jelezve, megerősítésre vár):** a megvalósított méretőr `TTS_AUDIO_LIMITS = { maxTotalBytes: 40 MB (hangverziónként),
   maxAbsoluteBytes: 80 MB (a teljes tábla), maxFileBytes: 300 KB }` — mindkét összplafon kemény (`total-exceeded` /
   `absolute-exceeded`), az abszolút plafon környezeti változóval nem állítható; a `put` csak az aktuális `TTS_VOICE_VERSION`-re ír;
   a felületen `usage()` és őrzött `purgeOtherVersions()` is van (megtagad, ha a megtartandó verzió nem az aktuális vagy nincs sora).
6. Végpont — `server/tts/audio-routes.ts`, bekötve a `server/routes.ts`-ben: `GET /api/tts/lesson-audio/:id` — érvénytelen `id`
   → 400; nincs sor → 404 `Cache-Control: no-store`; találat → 200 `Content-Type: audio/mpeg`, `Cache-Control: public,
   max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Accept-Ranges: bytes`, tartománykérésre 206 (a
   `server/lesson-clip-media.ts` kiszolgálójának mintájára — olvasd el és kövesd). Mellékhatás nincs (GET), hitelesítés nem kell
   (nyilvános tananyagszöveg hangja), a válasz nem tartalmaz személyes adatot. Ellenőrizd, hogy a lecke oldaláról az `/api/`
   útvonal azonos eredetűként érhető el (a `vercel.json` meglévő átírásai) — ha a hosszú gyorsítótárazáshoz a `vercel.json`
   fejléc-szabálya kell, azt add hozzá; a lecke CSP-je nem változik.
7. `ExperienceSpeech.tsx:119` (`speakText`): ha a nyelv a `TTS_AUDIO_LANGUAGES`-ben van — `new Audio(ttsAudioPath(id))`,
   `preservesPitch = true`, `playbackRate = rate`, lejátszás a kattintás gesztusában; `error` esemény, elutasított `play()` vagy
   1,5 mp-en belül (`PREPARED_AUDIO_START_TIMEOUT_MS`) el nem induló lejátszás → a mai lánc (rangsorolt böngészőhang → tartalék). A
   munkamenetben csak a HIBAESEMÉNY jegyződik meg (az időtúllépés és a lejátszási tiltás nem; S8d óta lejárattal). A gesztus-szabály és a hibajelző (`onError`) változatlan. (Spec-pontosítás 2026-11-18, vak review K1: a korábbi „3 mp” és „megjegyzett sikertelen útvonal” a kódhoz igazítva; a böngészős esetek a `tests/lesson-fusion.spec.ts`-ben vannak.)
   **Spec-pontosítás 2026-11-18 (független review J1–J2):** a kliens a hiányt nem a hangfájl 404-éből tudja meg, hanem elérhetőségi jegyzékből: `GET
   /api/tts/lesson-audio/available?keys=<vesszővel elválasztott kulcsok>` (`server/tts/audio-routes.ts`; bemenet: csak a kulcsformátum,
   legfeljebb 200 kulcs, hibás bemenet 400 `no-store`; válasz `{ available: string[] }`, `Cache-Control: public, max-age=60`; a
   tároló felületén `existing(keys)`, egyetlen lekérdezés). A lecke a betöltésekor egy kéréssel kéri le; elérhető kulcsra az előre
   gyártott hang szól, különben azonnal a böngészőhang (hangfájl-kérés nélkül). A hangtár útvonala saját korlátot kap
   (`LESSON_AUDIO_RATE_LIMIT`: 30 tanuló × 40 szöveg + 30 jegyzék-kérés = 1 230, tartalékkal 2 000 kérés / 15 perc / IP).
8. Tesztek: `tts-audio-key` — rögzített bemenetre rögzített hash; szóköz-normalizálás; más verzió → más hash. `tts-audio-store`
   (eldobható helyi adatbázison vagy a repó meglévő adatbázis-teszt mintáján; ha a teszt adatbázist kér, a `test:learning-db`
   futtatóba kerül) — `put` → `get` → azonos bájtok; ismételt `put` → `"exists"`; mutációk: plafon feletti írás →
   `TtsStorageLimitError` és a sorok száma nem nő; túl nagy fájl; hibás `mime`; hibás `id`; a végpont 404-e `no-store`, a 200-a
   `immutable`, a tartománykérés 206.
9. Böngészős próba (0.4): ál-API a `/api/tts/lesson-audio/…` útvonalra — (a) létező fájl: az `<audio>` elindul, böngészőhang nem
   szól (`speechSynthesis.speak` kémlelve); (b) 404: a böngészőhang szól; (c) a csúszka 0,5×-re állítva `playbackRate === 0.5`.
10. 0.3 szerinti kapuk (a `gate:pr` adatbázis-érintettségnél a `test:learning-db` utat is futtatja). Elvárt: E33, E48, E49.

## S8c — Hanggyártás ellenőrzéssel: közös modul, helyi szkript, tulajdonos által indított szerverfeladat

Ág: `feat/brit-hang-gyartas-s8c`. Fájlok: `server/tts/audio-gate.ts`, `server/tts/generate-lesson-audio.ts`,
`server/tts/admin-routes.ts`, `scripts/tts/generate-lesson-audio.mts` (mind új), `server/routes.ts` (csak a bekötés),
`tests/tts-audio-gate.test.ts`, `tests/tts-generate.test.ts` (újak).

1. `server/tts/audio-gate.ts` (tiszta, tesztelhető): a hangfájl hossza a szöveg hosszához mért sávban van (szó: 0,3–3 mp; mondat:
   karakterenként 0,03–0,15 mp); nincs 0,4 mp-nél hosszabb belső csend; az eleje és a vége nem levágott (az első és az utolsó 30 ms
   energiája a csúcs 20%-a alatt); a fájl érvényes MP3; a méret ≤ `maxFileBytes`. Kimenet: `GateResult`.
2. `server/tts/generate-lesson-audio.ts` — a közös gyártómodul: `collectTexts(db)` (az `en-GB` leckék szószedetének egyedi szavai
   és példamondatai; csak olvasás; a kimenetbe azonosító nem kerül) → kulcsok (`ttsAudioHash`) → `store.has` (a kész kulcs
   kimarad) → ElevenLabs-hívás a meglévő hívókód mintájára (`server/lesson-clips-providers.ts` — sorbaállítás, egyidejűség; a
   kulcs kizárólag a szerver környezetéből), brit hang, `mp3` → `audio-gate` → legfeljebb 2 újragenerálás, utána a szó a „kézi
   átnézés” listára kerül → `store.put`. Paraméterek: `{ dryRun (alapérték true), limit?, maxChars (kötelező, ha nem száraz),
   voiceId }`. Megállási szabályok (determinisztikus): `maxChars` elérése; `TtsStorageLimitError`; egymás után 5 elutasított
   fájl; szolgáltatói hiba háromszor egymás után — mindegyiknél megállás és jelzés, nem újrapróbálkozás. Összesítő: gyártott /
   kihagyott / elutasított darab, karakter, számolt költség (80 USD / 1 M karakter), a tár összmérete.
   **Párhuzamosság (S8b review A4):** a gyártó legfeljebb 2–3 párhuzamos `store.put` írást indít — az írásokat tranzakciós
   tanácsadó zár állítja sorba, a zárra váró írás adatbázis-kapcsolatot foglal (a kapcsolattár 10-es), a kiszolgálás nem várhat rá.
3. `scripts/tts/generate-lesson-audio.mts` — helyi hívó, **csak eldobható / helyi adatbázisra**: a szkript megtagadja a futást,
   ha a kapcsolat nem helyi gép (a repó meglévő „éles adatbázis védelme” mintáját kövesd, ha van; különben a gépnév ellenőrzése
   `localhost` / `127.0.0.1`). Alapértelmezetten `--dry-run`: modell- és tárírás nélkül kiírja a darabszámot, a karakterszámot,
   a költségbecslést és a várható tárméretet. `--execute` csak `--max-chars` mellett.
4. **Éles tömeges gyártás — admin-végpont, tulajdonosi indítás:** `server/tts/admin-routes.ts`:
   `POST /api/admin/tts/lesson-audio/generate` (a repó meglévő admin-hitelesítésével és CSRF / origin-védelmével — nézd meg egy
   meglévő admin `POST` végpont mintáját, és pontosan azt kövesd; törzs: `{ dryRun, limit, maxChars }`) → szerveren futó
   háttérfeladat, 202 + feladatazonosító; egyszerre egy feladat futhat (a második kérés 409); `GET
   /api/admin/tts/lesson-audio/status` → állapot és az összesítő. A száraz futás az alapértelmezés. **Ügynök ezt a végpontot
   élesben nem hívja, és éles adatbázisba nem ír** — az indítás a tulajdonosé; a PR-leírás tartalmazza a tulajdonosnak szóló
   lépéseket (száraz futás → az összesítő átnézése → hangminták `limit: 30` → teljes futás `maxChars: 60000`).
5. Tesztek: `tts-audio-gate` szintetikus PCM-mintákon — túl rövid, túl hosszú, belső csend, levágott vég, rendben lévő (mutációk
   az SK5 táblájába is). `tts-generate` hamis szolgáltatóval és memóriatárral: a kész kulcs kimarad; száraz módban 0
   szolgáltatóhívás; `maxChars` elérésekor megáll; tárplafonnál megáll és jelez; 2 újragenerálás után „kézi átnézés”; az admin
   végpont hitelesítés nélkül 401 / 403, párhuzamos indításra 409.
6. **Új leckék hangja (kapcsolóval, alapból KI):** a leckegyártás végén, a szószedet véglegesítése után ugyanez a modul futhat a
   lecke saját szövegeire (`TTS_AUTO_GENERATE` környezeti kapcsoló; lecke-szintű `maxChars` 5 000; az SK3 futáskerete és a
   méretőr érvényes; hibája a közzétételt nem akasztja meg, amíg az SK4 `ttsPresence` kapuja `report` módban van). A kapcsolót a
   tulajdonos állítja be a szerver környezetében; a kód alapértéke kikapcsolt. A beillesztési pontot a szelet elején térképezd fel
   (hol véglegesül a szószedet az egyfutásos motorban), és a tervbe visszaírod fájl:sorral.
7. Sorrend a fizetős résznél: helyi száraz futás kimenete az orkesztrátornak → a PR merge-e és telepítése → a tulajdonos indítja
   az admin-végpontot (száraz → minták → hangválasztás → teljes). A hang kiválasztása után a `TTS_VOICE_VERSION` és a hang
   azonosítója külön, egysoros PR-ban rögzül. Ellenőrzés a teljes futás után (csak olvasva): 20 véletlen kulcs HTTP 200,
   `audio/mpeg`, `immutable`; a tár összmérete a plafon alatt.
   **Runbook — hangcsere (S8b):** a `TTS_VOICE_VERSION` átírása után a kliens azonnal az új verzió kulcsait kéri, ezért a régi
   hangok AZONNAL elérhetetlenek (a lecke a böngészőhangra esik), amíg az új verzió le nem gyártódik. Sorrend: a verzió átírása és
   telepítése → teljes gyártás az új verzióra (a tár átmenetileg legfeljebb 80 MB) → ellenőrzés → `purgeOtherVersions` a régi sorokra
   (tulajdonosi indítás; csak akkor fut, ha az új verziónak már van sora). A gyártás idejére a böngészőhang a tartalék.
8. 0.3 szerinti kapuk. Elvárt: E34, E48.

## S8d — Hang-előtöltés a lecke megnyitásakor (tulajdonosi kérés 2026-11-18)

Ág: `feat/tgm-s8d-hang-eloetoltes` (halmozva az S8b-2 ágára). Fájlok: `shared/speech-preload.ts` (új, tiszta),
`shared/speech-chain.ts`, `shared/tts-audio-key.ts`, `client/src/lesson-runtime/speech-player.ts` (új — a lejátszó logikája
befecskendezett környezettel, React nélkül), `client/src/lesson-runtime/ExperienceSpeech.tsx` (csak bekötés),
`client/src/lesson-runtime/LessonExperienceView.tsx` (életciklus), `server/tts/audio-routes.ts`, `server/tts/audio-store.ts`,
`server/tts/rate-limits.ts` (új), `server/index.ts` (csak a bekötés), tesztek. NEM változik: `client/src/lib/tts.ts`, a játékok, a
kiejtésgyakorló és a diktálás útja, a CSP (`vercel.json` fejlécei).

A tulajdonos kérése szó szerint: „Én azt gondolom, hogy a hat meg három másodperces laggolás is eléggé gáz, úgyhogy automatikusan
szerintem amikor megnyitja az adott tananyagot, pufferelje a hangokat a diáknak a tananyagban.”

1. **Technika — mérés előbb:** fejetlen Chrome, helyi szerver, 800 ms-mal késleltetett hangfájl, 5 futás mediánja a koppintástól a
   hang tényleges indulásáig: hideg `new Audio(url)` 884 ms; `fetch`-csel előmelegített HTTP-gyorsítótár + új hangelem 61 ms;
   előre létrehozott `preload="auto"` hangelem 13 ms; Web Audio (`decodeAudioData` → `AudioBufferSourceNode`) 14 ms. **Döntés:
   előtöltött hangelemek** — a Web Audióval azonosan azonnali, de megtartja a hangmagasságot a csúszka sebességénél
   (`preservesPitch`; a Web Audio `playbackRate`-je a hangmagasságot is eltolja), tömörített bájtokat tart a memóriában, és a CSP-t
   nem érinti (azonos eredetű cím, `blob:` / `data:` nélkül).
2. `shared/speech-preload.ts` (tiszta): `SPEECH_PRELOAD = { concurrency: 3, maxBytes: 3,5 MB, maxElements: 60, firstSectionTexts: 12,
   retryDelaysMs: [4 000, 15 000], failureTtlMs: 60 000, manifestRefreshMs: 60 000 }`; `preloadPlan({ ids (szószedet-sorrend),
   sizes, saveData, effectiveType })` → az előtöltendő kulcsok sorrendben (plafonok, adatkímélő / 2g: csak az első szakasz);
   `nextPreloads(állapot)` → a következő indítható letöltések (párhuzamosság, előre vett kulcs); `retryDelayMs(próbálkozás)`;
   a hangmotor munkamenet-állapota: `engineAfter(állapot, esemény)` (`unknown` → `working(hang)` / `silent`), és
   `probeTimeoutMs(hang)` (helyi 3 mp, hálózati 6 mp — a próba a háttérben fut).
3. `shared/speech-chain.ts`: a `speechPlan` bemenete bővül — `prepared: "ready" | "loadable" | "none"` és `engine`: kész hang → az
   előre gyártott lépés elöl; tölthető, de nem kész → ha van böngészőhang-lépés, az előre gyártott lépés KIMARAD (azonnal a
   böngészőhang, a letöltés előre ugrik), ha nincs, kérésre töltődik; `engine.silent` → nincs böngészőhang-lépés;
   `engine.working(hang)` → az igazolt hang az első, a munkamenetben elbukott hangok kimaradnak. Az indulási őrök védőhálóként
   maradnak (1,5 mp; 3 / 6 mp összesített csendkeret; a szerveres tartalékra új, 8 mp-es betöltési őr — lógó válasznál hibaüzenet).
4. Jegyzék: a válasz a méreteket is adja — `{ available: string[], sizes: Record<kulcs, bájt> }`; a tároló `existing(keys)` művelete
   `{ id, size }` párokat ad. A kliens az utoljára ismert jegyzéket helyben megőrzi (`localStorage`, csak lenyomatok és méretek),
   hálózat nélkül ebből dolgozik. A lap újra láthatóvá válásakor, legfeljebb percenként frissít.
5. `client/src/lesson-runtime/speech-player.ts`: `createSpeechPlayer(env)` — a környezet (óra, időzítő, hangelem-gyár, beszédmotor,
   jegyzék-lekérés, kapcsolat, tár) befecskendezett, így a lánc bekötése ál-órával tesztelhető. Műveletek: `prepareLesson`,
   `release` (megszakítás, felszabadítás), `noteUserGesture` (motorpróba; még el nem indult letöltések feloldása iOS-en),
   `speak`, `stop`, `refresh`. A szinkron `done("failed")` utáni megszakító-felülírás (vak review A5) megszűnik.
6. `server/tts/rate-limits.ts`: a három felolvasás-korlát (általános `/api/tts`, szerveres tartalék, hangtár) egy helyen, a bekötéssel
   együtt (`mountTtsRateLimits(app)`), hogy valódi HTTP-teszt mérje (vak review K4). A hangtár kerete: 30 tanuló × 40 hang × 2 kérés
   (tartománykérés) + 30 jegyzék = 2 430 → tartalékkal 3 000 kérés / 15 perc / IP.
7. Tesztek (0.6): `speech-preload` (rend, plafonok, adatkímélő, újrapróba, motorállapot — mutációs ellenpróbával); `speech-player`
   ál-órával és ál-környezettel: előtöltött hang azonnal; koppintás előtöltés közben (böngészőhang most, a letöltés előre ugrik, nincs
   kettős megszólalás); félbeszakadt / hibás letöltés és újrapróba; leckeváltás futó előtöltés közben; 100 tételes lecke; a lap
   háttérbe kerülése és a jegyzék frissítése; két gyors koppintás két szóra; más nyelvű lecke; üres tár; néma motor előre ismert;
   `tts-rate-limits` valódi HTTP-n. Böngészős (0.4, `lesson-fusion`, `--workers=1`): koppintás → `playing` ≤ 300 ms előtöltött
   hangnál késleltetett hangtár mellett; böngészőhang ≤ 1 s; kikapcsolt előtöltéssel a mérés bukik (mutációs ellenpróba).
8. 0.3 szerinti kapuk. Elvárt: E50–E55.

**Mért eredmény (2026-11-18, fejetlen Chrome, `tests/lesson-fusion.spec.ts` „prepared audio” esetei; a koppintás `click` eseményétől a hang
tényleges indulási eseményéig).** A tulajdonosnak szánt táblázat — mennyit vár a gyerek:

| Eset | Koppintástól a hangig | A mérés módja |
|---|---|---|
| Előtöltött hang (tipikus, ha a tárban van hang) | 13 ms (határ: ≤ 300 ms) | böngészőteszt, `playing` esemény; a hangtár 800 ms-mal lassítva — a késleltetést a megnyitás fizeti ki |
| Böngészőhang működő, igazolt motorral (tipikus, amíg a tár üres) | 164 ms, ebből 150 ms a motor utánzott indulási ideje (határ: ≤ 1 s) | böngészőteszt, a beszéd `start` eseménye; a valódi motor indulási ideje eszközfüggő |
| Koppintás az előtöltés közben / a plafon fölötti szóra | 162 ms (böngészőhang azonnal); a következő koppintás már pufferelt | böngészőteszt, 3 mp-es hangtár |
| Néma motor, a próba már lefutott | 81 ms + a szerveres tartalék valós válaszideje (nem mért) | böngészőteszt helyi ál-végponttal |
| Néma motor, a koppintás megelőzi a próbát (munkamenetenként egyszer) | 3 mp (helyi első hang), 6 mp (hálózati első hang) | böngészőteszt és ál-órás egységteszt; utána a felület tudja |
| Adatkímélő mód / 2g | az első 12 szöveg: mint az előtöltött; a többi: első koppintásra böngészőhang, utána pufferelt | ál-órás egységteszt |
| Hálózat nélkül, ismételt megnyitás | a helyben megőrzött jegyzék + a böngésző tartós gyorsítótára: mint az előtöltött | ál-órás egységteszt; böngészőben NEM mért (a teszt hálózati elfogása kikapcsolja a HTTP-gyorsítótárat) |
| Hálózat nélkül, első megnyitás | böngészőhang, a telepített helyi hang előre | ál-órás egységteszt |

Mutációs ellenpróba: kikapcsolt előtöltéssel a böngészős időmérő eset bukik; a lejátszó és az előtöltés-logika 38 mutációjából 37
megölve (1 egyenértékű védőkód). **Kockázat:** a fejetlen asztali Chrome időmérése nem azonos a valós eszközével; iOS Safari a
`preload`-ot felhasználói mozdulat nélkül figyelmen kívül hagyhatja (a kód a mozdulatnál „megérinti” a futó letöltéseket — valódi
eszközön NEM igazolt); valódi iPad- és Android-próba kell az éles hanggyártás előtt. **Döntést kér (tulajdonos):** a hangmotor
próbája egy hallhatatlan (nulla hangerejű) kimondás az első felhasználói mozdulat után — a „felolvasás csak kérésre indul” elv
betűje szerint ez kérés nélküli kimondás, hang nélkül.

## SK4 — Kiadás előtti kapu

Ág: `feat/kiadas-elotti-kapu-sk4`. Fájlok: `server/studio/gates/release-gate.ts` (új), `server/studio/gates/config.ts`,
`server/studio/single-run/engine.ts`, `tests/release-gate.test.ts` (új), `tests/single-run-engine.test.ts`.

1. `releaseGate(input: { lesson; rulesVersion?: string; rulesFingerprint?: string; ttsHas?: (ids: string[]) => Promise<Set<string>>
   }): Promise<GateResult>` — bejegyezve a `GATE_REGISTRY`-be. Részellenőrzések, mind modell nélkül:
   - **séma:** `lessonSchema.safeParse` hibátlan;
   - **tiltott minták** a gyereknek megjelenő szövegekben (blokkszöveg, ábrafeliratok, bank kérdései és visszajelzései): nyers
     `**`; helykitöltő (`TODO`, `lorem`, `<…>`, három vagy több egymást követő aláhúzás a feladat kitöltendő helyén kívül); a
     forrásfájlra utaló szó („PDF”, „a feltöltött”, „a forrás szerint”, „oldalszám”); nyers URL; üres táblacella; a régi bátorító
     előtag az új verziójú leckében. A mintalista állandó tömb a fájlban, mindegyikhez indoklás;
   - **a pontozási szabály lenyomat-őre:** a futás telemetriájában rögzített `rulesVersion` és lenyomat egyezik a kód
     `OPEN_ANSWER_RULES_VERSION`-jával és az `OPEN_ANSWER_RULES_HU` lenyomatával (az S7a adja); eltérésnél bukás („a bank más
     szabállyal készült, mint amivel a program pontoz”);
   - **TTS:** ha a lecke nyelve `en-GB`: a szószedet minden szavának és példamondatának kulcsa (`ttsAudioHash`) megvan a tárban
     (`ttsHas`, az S8b tárolófelületén át). `GATE_MODES.ttsPresence`: kezdőérték `report` (a hiány darabszáma jelzés); `enforce`
     akkor, amikor a tulajdonos az új leckék automatikus, szerveren futó hanggyártását engedélyezte (S8c 6. lépés) — a váltás
     egysoros, teszttel.
2. `engine.ts`: a kapu a közzététel (`store.publishLesson`) ELŐTT fut; bukásnál nincs közzététel, a lecke mentve marad, a job
   kimenetébe `gateStop: { gate: "release", problems }` kerül; javító forduló NINCS (ezek a hibák vagy determinisztikusan
   javíthatók korábban, vagy emberi döntést kérnek).
3. `tests/release-gate.test.ts`: átmenő minta; mutációk részellenőrzésenként legalább három: sémahibás blokk; `**` a szövegben;
   „PDF” szó a magyarázatban; üres cella; eltérő `rulesVersion`; eltérő lenyomat; hiányzó `rulesVersion`; `en-GB` lecke egy
   hiányzó hanggal `enforce` módban → bukás, `report` módban → jelzés; magyar leckénél a TTS-ellenőrzés nem fut.
4. `tests/single-run-engine.test.ts`: bukó kiadási kapu → a `publishLesson` nem hívódik, a modellhívások száma nem nő.
5. 0.3 szerinti kapuk. Elvárt: E43, E44.

## SK5 — Mutációs ellenpróbák őre és a kapuk alapvonala

Ág: `test/kapuk-mutacio-alapvonal-sk5`. Fájlok: `tests/gate-mutations.test.ts` (új), `scripts/measure/gate-baseline.mts` (új),
`docs/handoffs/2026-11-18-tananyag-minoseg-kapuk-alapvonal.md` (új).

1. `tests/gate-mutations.test.ts`: (a) közös táblás futtató — kapunként `{ pass: bemenet, mutations: Array<{ name, mutate,
   expectProblem: RegExp }> }`; (b) **őr**: a `GATE_REGISTRY` minden kapujához (`sourceCoverage`, `runBudget`, `variety`,
   `release`) legalább három mutáció tartozik — új kapu mutációk nélkül a tesztet buktatja; (c) minden mutációt a kapu a várt okkal
   fog meg, az átmenő minta átmegy. A kapuk saját tesztfájljainak mutációi innen is futnak (közös táblából importálva — a táblák a
   kapuk mellett, `server/studio/gates/*.mutations.ts` fájlokban élnek).
2. `gate-baseline.mts` (csak olvasva, fizetős hívás nélkül): a kiadott leckéken futtatja a `release` és a `variety` kaput, a
   leltárral rendelkező térképek leckéin a `sourceCoverage` kaput, a meglévő futások telemetriáján a `runBudget` ítéletét.
   Kimenet: kapunként hány lecke / futás menne át ma, a leggyakoribb öt bukási ok darabszámmal. Azonosító, cím nem kerül a
   kimenetbe.
3. A futtatás eredménye a `docs/handoffs/…-kapuk-alapvonal.md` fájlba kerül (csak összesített számok). Ha egy kapu a kiadott
   állomány több mint 20%-át buktatná olyan okkal, amely nem valódi hiba (hamis riasztás): a kaput javítod, új mutációval — a
   küszöböt nem lazítod indoklás nélkül.
4. 0.3 szerinti kapuk. Elvárt: E45, E46.

## S9 — Dokumentáció és tudás

Ág: `docs/gyartas-dokumentacio-s9`. Fájlok: `docs/lesson-improvement.md`, `.agents/skills/websuli-gyartas-analitika/SKILL.md`
(új forrás), `.claude/skills/websuli-gyartas-analitika/SKILL.md` (tükör), `docs/agent-csapdak.md`.

1. `docs/lesson-improvement.md`: új, első szakasz „Egyfutásos gyártás — a tényleges működés” a terv 3.1 táblája szerint
   (állomások, bemenetek, friss beszélgetések, körkorlátok, a vizuális leltár útja, a forráshoz kötött ábrák, a fedettség két
   része, a magból kiosztott formák, a verzióállandók, a determinisztikus kapuk — SK1–SK5 — üzemmódjai,
   küszöbei és megállási szabályai, a hangfájlok tárolása és a tulajdonos által indított hanggyártás). A runtime-3 szakasz címe (`:7`) „történeti” jelzőt kap; a `:92` mondata az
   S4b utáni valóságot írja le; a felülírt promptról és a vak megoldóról szóló, a kódban nem élő állítások (a 04-es jelentés 2.9
   táblája) törlődnek vagy „nem él az egyfutásos úton” megjegyzést kapnak. Minden állítást a kódból ellenőrizz, fájl:sorral.
2. Analitika skill: a forrás létrehozása az `.agents/skills/websuli-gyartas-analitika/SKILL.md` alatt a tükör mai tartalmával,
   majd a javítások MINDKÉT fájlban, bájtazonosan: „92 kvízkérdés” → 75 (+ 23 tartalék = 98); a Render-napló elérése (a
   környezeti változó mellett az olvasó csatlakozó); a javítókörök okai ezentúl a job kimenetéből (`telemetry.fixReasons`,
   `telemetry.visuals`) olvashatók — kész lekérdezéssel; új szakasz „Vizuális fedettség és hiánytábla” (a `source-gap-table`
   használata) és „Változatosság mérése” (a `variety-*` szkriptek); a mért alapvonalak (6,64 USD / futás; állomásarányok; HM 6 / 38).
   Ellenőrzés: `node scripts/qa/gates/skills-sync-check.mjs` → zöld (a szkriptet csak futtatod, nem módosítod).
3. `docs/agent-csapdak.md`: új bejegyzések a következő szabad C-számtól (előtte olvasd el a fájl végét — más munkamenet is írhat
   bele): (1) a fedettség 100% volt, miközben a forrás táblái hiányoztak — a mérő csak azt méri, amit számol; (2) a prompt
   „jelzést” ígért, a program fizetős kört indított — prompt és kód együtt olvasandó; (3) a javítókörök okai csak a ~14 napig
   őrzött naplóban éltek; (4) a `MEASURE_SAME_MAP` mód kihagyja az 1. állomást — a forrásbeolvasás mérésére nem jó; (5) a csak
   olvasó adatbázis-segéd tanúsítványlánc-hibája és a biztonságos megoldása (ellenőrzés bekapcsolva marad); (6) szövegkinyerésnél
   UTF-8 kapcsoló nélkül a magyar ő / ű kiesik; (7) minden további, a szeletek közben rögzített tanulság.
4. Kanban: a munka közben nyitott jegyek (a játékok hangválasztása, a leckegyártás végi hanggyártás, a nem megfelelt ábrafajták, a
   04-es jelentés P2 / P3 / P9–P12 tétele, a sávon belüli megjelenési változatok) létrehozva, a jegyszámok a PR-leírásban.
5. 0.3 szerinti kapuk (a független ellenőr a dokumentum állításait szúrópróbával a kódhoz méri). Elvárt: E29 teljesül.

## Záró teljességellenőrzés (az utolsó szelet után, az orkesztrátor végzi)

1. A terv 10. szakaszának E1–E49 pontja egyenként: kód, teszt, böngészős próba és a mérési jelentések alapján — nem emlékezetből.
   Minden pont mellé a bizonyíték (PR-szám, tesztfájl, mérési sor).
2. Nyitott pontnál a munka folytatódik; objektív blokkolónál: NOT DONE + ok + kockázat + ki mit tegyen.
3. Szeletes funkció zárása: az utolsó szelet összevonása ELŐTT az egész funkció átfogó reviewja (az `AGENTS.md` „Review
   guidelines” szerint), az eredmény PR-kommentként.
4. Retro mért tényekből és futás utáni higiénia (memória, skill, kanban, munkafák, ágak) a repó szabályai szerint.
