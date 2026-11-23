# Végrehajtási utasítás — tananyaggyártás minősége (S1–S10)

Terv: [`docs/specs/2026-11-18-tananyag-gyartas-minoseg.md`](2026-11-18-tananyag-gyartas-minoseg.md). Ez a fájl ügynöknek szól: szeletenként
önállóan végrehajtható. A kódútvonalak a `source/` alatt értendők, ha nem `docs/`, `.agents/`, `.claude/` kezdetűek; a parancsok
a munkafa gyökeréből futnak, ha a lépés mást nem mond.

Sorrend (tulajdonosi döntések 2026-11-18 után): **S1a → S1b → SK1 → S2a → S2b → S3a → S3b → S4a → S4b → SK3 → S10/0 → S10/1 (első
mérés) → S5a → S5b → S6a → S6b → S6c → SK2 → S7a → S7b → S8a → S8b → S8c → SK4 → SK5 → S9 → S10/2 (záró mérés).** Egy alszelet =
egy ág = egy PR. Döntések: D1 újrarajzolás · D2 30 USD próbakeret · D3 ElevenLabs előre gyártva · D4 hangfájlok az adatbázisban,
csak a leckék · D5 fél pontos plafon igen · D6 egyeztetés alatt (az S7a nem indul, amíg nincs döntés) · D7 éles gyártásban a
költségkeret túllépése csak jelez (e-mail), nem állít meg; gyártás-stop kapcsoló nem épül; a 30 USD próbakeret kemény plafon marad.

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
| SK3 | `tests/run-budget.test.ts`, `tests/run-budget-alert.test.ts` | a körszám-plafon változatlansága, költségküszöb-jelzés (futásonkénti, napi), a próbakeret kemény plafonja |
| S5a / S5b | `tests/lesson-feedback-openers.test.ts`, `tests/lesson-opener.test.ts`, `tests/seeded.test.ts` | szótár, levágás, determinizmus, verzió |
| S6a–c | `tests/lesson-section-shapes.test.ts`, `tests/lesson-arc.test.ts`, `tests/visual-kind-plan.test.ts`, `scripts/measure/shape-simulation.mts` | kiosztás, ívkapu, arányok, szimuláció |
| SK2 | `tests/variety-metrics.test.ts`, `scripts/measure/variety-measure.mjs` | változatosság-mutatók és küszöbök |
| S7a / S7b | `tests/open-answer-rules-version.test.ts`, `tests/scoring-v2.test.ts`, az arbiter tesztjei | lenyomat-őr, hosszkorlát, plafon |
| S8a–c | `tests/voice-rank.test.ts`, `tests/tts-audio-key.test.ts`, `tests/tts-audio-store.test.ts`, `tests/tts-audio-gate.test.ts` | rangsor, kulcs, méretőr, hangkapu |
| S8d | `tests/speech-preload.test.ts`, `tests/speech-player.test.ts`, `tests/tts-rate-limits.test.ts`, `playwright.lesson-fusion.config.ts` (felolvasás-szűrő) | előtöltési rend és plafonok, hangmotor-állapot, a lejátszó bekötése ál-órával, a korlát bekötése valódi HTTP-n, koppintás → hang idő |
| SK4 / SK5 | `tests/release-gate.test.ts`, `tests/gate-mutations.test.ts`, `scripts/measure/gate-baseline.mts` | kiadás előtti kapu, mutációk, alapvonal |
| S9 | `node scripts/qa/gates/skills-sync-check.mjs` (csak futtatva) | skill forrás ↔ tükör |
| S10 | `scripts/measure/source-gap-table.mts`, a futáskeret főkönyve | hiánytábla gépi része, keret |
| minden szelet (S1–S3) | `tests/source-visuals-flag.test.ts` | KI állapotban a gyártás minden kérése a főágéval azonos (0.7) |

### 0.7 Funkciókapcsoló — önálló beolvaszthatóság (*Spec-pontosítás 2026-11-18 — vak ellenőr: önálló beolvaszthatóság*)

A terv 5. szakaszának 14. pontja szerint a forrás vizuális leltára a `STUDIO_SOURCE_VISUALS` kapcsoló mögött áll (`on` = BE;
minden más és a hiány = KI). Minden szeletre érvényes szabályok:

1. A környezetet egyetlen függvény olvassa: `sourceVisualsEnabled()` (`server/studio/source-visuals-flag.ts`). Más helyen
   `process.env.STUDIO_SOURCE_VISUALS` olvasása tilos. A motor a futás elején egyszer dönt:
   `deps.sourceVisuals ?? sourceVisualsEnabled()`; teszt és mérőharness a `SingleRunDeps.sourceVisuals` mezővel fecskendez be.
2. KI állapotban a futás a leltárt sehonnan nem kapja meg: az 1. állomás nem kéri és nem dolgozza fel (a kéretlen `visuals` mező
   is eldobva, számláló és naplósor nélkül), a térképről betöltött (korábban mentett) leltár üres listára cserélődik, mielőtt
   bármelyik prompt-építő, kapu vagy számláló látná. Új, leltártól függő kódút csak ebből a szűrt listából dolgozhat.
3. Ami a modell kimenetének határán új ábrafajtát fogad el (S2 / S3), KI állapotban ugyanúgy utasítja el, mint a kapcsoló előtt.
4. A `tests/source-visuals-flag.test.ts` rögzített főág-lenyomatai a lánc MINDEN ágán zöldek: KI állapotban a mintafutás összes
   modellnek küldött kérése bájtra azonos a főágéval. A lenyomat előállítása (csak akkor frissítendő, ha a főág promptjai
   szándékosan változtak): a `source/` mappából `mkdir .main-ref`, `git archive origin/main:source server shared | tar -x -C .main-ref`,
   `node --import tsx tests/helpers/production-prompt-fingerprint.ts .main-ref`, majd a `.main-ref` törlése.
5. Az S1a–S3 meglévő tesztjei BE állapotban futnak (`sourceVisuals: true` a függőségekben); az alapértéket (KI) külön teszt rögzíti.
6. Az éles bekapcsolás NEM része egyik szeletnek sem: tulajdonosi döntés az S10/1 mérés után (Render: `STUDIO_SOURCE_VISUALS=on`;
   kikapcsolás: a változó törlése). Ügynök az éles környezet változóit nem állítja.

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

> **Megvalósítva (2026-11-18, ág `feat/tgm-s1b-sk1-forras-fedettseg`) — eltérések, amelyeket a következő szeletnek tudnia kell:**
> (1) a terv forrás-vizuális hivatkozásait külön függvény tisztítja (`autofixOutlineVisuals`, `server/studio/tools/outline-autofix.ts`)
> az `autofixOutline` UTÁN — az utóbbi hívási alakját őr-teszt rögzíti; (2) a terv és a blokk új mezői engedékeny sémájúak (a
> többlet vágva, a hibás `sourceVisualId` elmarad) — formai hiba nem indít fizetős javítókört; (3) a lektor a mért hiányzó
> azonosítókat a leltár blokkjában, TÁJÉKOZTATÁSKÉNT kapja (nem a `previousBlockers` listában), mert `report` módban a hiány nem
> állíthat meg gyártást; (4) a szerző és az ábrakészítő szabálymondata a `sourceVisualId` kitöltését is kéri; (5) az S1a review
> U1–U4 feltétele és a J4 ugyanebben az ágban teljesült (a leltár-sémaverzió: `SOURCE_VISUALS_SCHEMA_VERSION`).

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

> **Megvalósítva (2026-11-18, ugyanazon az ágon, `report` módban) — eltérések:** (1) a kapu a leckét szerkezetileg olvassa (a
> hűséget a hivatkozó blokk összes megjelenő szövegén méri, a tétel címe nélkül), így az S2 új ábrafajtáit a sémabővítés előtt is
> helyesen ítéli meg; (2) a `problems` a bukást okozó tételeket sorolja, a megengedett („legalább 80%”) hiány csak a `missingIds`
> listában és a mérőszámokban látszik; (3) a `sourceVisualId` mezőt az ábrafolt sémája már most átengedi
> (`server/studio/visual-patch.ts`) — enélkül a pótló forduló foltja nem hivatkozhatna; a nem létező azonosító törlése és a
> megalapozási kivétel az S3a-ban marad; (4) az üzemmód futásonként felülírható (`SingleRunDeps.gateModes`) — a teszt és a
> mérőharness ezzel kapcsol `enforce`-ra; (5) az alapvonal-fixtúra (`tests/fixtures/source-coverage-hm.ts`) a HM-minta számait
> hordozza (38 tétel; ma 6 teljes, 23 részben, 9 sehogy) — a 7 felsorolt csoport 35 tétele mellé 3 lépéssor került a 38-as összeghez.
>
> **SK1b (2026-11-18, ág `fix/tgm-sk1b-fedettsegi-kapu-kemenyites`, kanban #157) — a független review leletei az `enforce` ELŐTT:**
> szerkezeti hűségmérés és normalizálás (F1–F3), kihagyási keret és ok fajtánként (F4), megosztott paraméter-szerződés (F5–F6),
> a megállt job folytatása modellhívás nélkül áll meg (F7), címke-tisztítás a pótló folton (F8), a kapu hibája nem állít meg
> (F12), a parancssori futtató hibás térképre 2-es kóddal áll meg (F10). Az alapvonal-teszt a mai leckealakra **0/38** (a kapu
> szerkezeti mércéje); a „6/38” a tényfeltárás EMBERI tartalmi megítélése — a fixtúra megjegyzése elkülöníti (F9). A fenti (1)–(2)
> pontot ez a kör felülírja: a hűség már nem „a blokk összes szövegén” mér. A kapu `report` módban marad.

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
   - **Spec-pontosítás 2026-11-18 (független review F1–F6; megvalósítva az SK1b-ben, kanban #157):** a hűség SZERKEZET szerint
     mér, a megjelenítők megosztott paraméter-szerződéséből (`shared/source-visual-render.ts`: `TableVisualParams`,
     `RuleBoxVisualParams`, `CompareCardsVisualParams`, `DecisionTreeVisualParams`, `PictureCardsVisualParams` + engedékeny olvasók
     + `normalizeVisualText`) — nem a blokk bármely szövegén. Táblázat: cella a cellában, oszlop szerint (a `compareCards` kártyája
     egy oszlop); folyamat: lépés a lépésben, sorrendben; döntési fa: csomópont és ágfelirat útvonal szerint; szabálydoboz: cím a
     címben (vagy a feliratban), pont a pontban; képes kártya: felirat + nem üres `svg`; képes feladat: a képek száma is egység;
     rész nélküli ábra: az üres `animate` blokk nem megjelenés. Normalizálás: idézőjel, gondolatjel, hárompont, mondatvégi
     írásjel, szóköz, kis- / nagybetű, NFC — az ékezet NEM. Több hivatkozó blokk összeadódik. Az alábbi két bekezdés ezzel együtt
     érvényes.
   - Megfeleltetés: `table` → `table` vagy `compareCards`; `process` → `process`; `decisionTree` → `decisionTree`; `ruleBox` → `ruleBox`;
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
     **Spec-pontosítás 2026-11-18 (független review F4):** a keret `max(1, floor(maxSkipShare × n))` (`minSkips: 1`); az ok
     fajtánként megengedett (`SOURCE_SKIP_REASONS_BY_KIND`): `table` / `process` / `decisionTree` / `ruleBox` → `admin_meta`,
     `duplicate`; `exercise` → + `answer_key`; `pictureCard` / `diagram` → + `decorative`. A `duplicate` csak megnevezett, megjelent
     párral érvényes. Érvénytelen ok = hiány.
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

> **Paraméter-szerződés (SK1b, független review F5–F6) — az S2b-re is:** a megjelenítők paramétereinek alakja a
> `shared/source-visual-render.ts` típusaiban RÖGZÍTETT, és a forrás-fedettségi kapu ezekből olvas. Az S2 paraméter-sémái
> (`lesson-visual-params.ts`) és megjelenítői ehhez igazodjanak: `table` `{ caption?, headers, rows, headerTones? }`; `ruleBox`
> `{ tone, heading?, items }`; `compareCards` `{ cards: [{ title, tone?, lines, example? }] }` (a kártya egy oszlop); `decisionTree`
> `{ root: { text, branches?: [{ label, node }] } }` — NEM `children`; `pictureCards` `{ cards: [{ label, svg, caption?, example? }] }`
> (a kép a nem üres `svg`). Ha az alakon változtatni kell, a típusfájlban és a kapu tesztjeivel együtt változzon; a
> `renderedVisualTexts` ugyanezeket a mezőket adja vissza. Teszt rögzítse, hogy a séma által elfogadott paramétert a szerződés
> olvasója (`readTableParams`, `readDecisionTreeParams`, …) veszteség nélkül olvassa.

> **Megvalósítási pontosítás (S2a, 2026-11-18; az S1a review J1 lelete nyomán):** a megjelenítők korlátja nem lehet szűkebb a
> forrásleltárénál (`shared/source-visuals.ts`), ezért a 2. lépés számai helyett: `table` — 1..8 oszlop, fejléc ≤ 80, cella ≤ 120
> (lehet üres), felirat ≤ 160, blokkonként 1..20 sor (`SOURCE_TABLE_BLOCK_ROWS`; a hosszabb forrástáblát a gyártó több, ugyanarra a
> tételre hivatkozó blokkra bontja — a kapu összeadja), `headerTones` hossza = az oszlopoké; `ruleBox` — 1..8 pont, pont ≤ 240;
> `compareCards` — 2..3 kártya, cím ≤ 80, 1..8 sor, sor ≤ 200, a `tone` elhagyható (a szerződés szerint). Minden séma `.strict()`:
> ismeretlen / rejtő kulcs elutasítva. A sorfejléc (`th scope="row"`, rögzített első oszlop) csak 3+ oszlopnál; a kétoszlopos tábla két
> egyenrangú oszlop. Az ág neve `feat/tgm-s2a-megjelenitok` (az SK1b ágára épül). A lektor-nézet (5. lépés) már vesztésmentesen adja a
> strukturált `params`-ot — kódváltozás nem kellett, teszt rögzíti. A szabálydoboz ikonja a lejátszóban bevett lucide-készletből
> való (nem a blokkjelző-képekből); a doboznak nincs külön blokkfejléce — a tónus kódszótári felirata a doboz saját fejléce, a blokk
> felirata a kereten belül áll. A görgő tábla kerete csak görgetéskor fókuszmegálló. Az új fajták az S3a-ig NINCSENEK a gyártó
> promptjaiban (`PROMPT_ANIM_KINDS`), a hibás paraméterű blokk a szerző kimenetéből és a lejátszóból is kimarad (review B1). Mérőlecke: `/__lesson-runtime-probe?source-visuals=1|max`.

Ág: `feat/lecke-megjelenitok-s2a`. Fájlok: `shared/source-visual-render.ts` (a szerződés — meglévő), `shared/lesson-schema.ts`, `shared/lesson-visual-params.ts`,
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

> **Teendők a VAK ellenőr S2a-leleteiből (2026-11-18; a vak ellenőr saját sorszámaival — „vak J…”, nem azonos a fenti független
> review J-számaival) — ennek a szeletnek a kötelező részei.** Az S2a-ban lezárva: vak B1 (funkciókapcsoló + a kiesés oka a javító
> üzenetben), vak J1 (a „•” elem eleji műveleti jel megmarad), vak J3 (a kétoszlopos tábla fejléce nem törik szó közepén).
> - **vak J2 — görgetésjelző és táblacím:** a „görgethető” jelző a tábla FÖLÖTT is (vagy ragadósan / szélső árnyékkal) látsszon — a
>   8 oszlopos táblánál 360 px-en ma ~11 képernyővel lejjebb van; a táblázat címe kerüljön a görgő kereten KÍVÜLRE (ma vízszintesen
>   levágódik). Böngészős állítás: a jelző a tábla első képernyőjén látszik, a cím teljes szövege görgetés nélkül olvasható.
> - **vak J5 — kontraszt:** a „Példa” címke (`lesson-design.css`, kártya) az `adventure` sávban 3,88:1, a `future` sávban 3,13:1; a
>   `future` „a” tónusjele 2,69:1; csendes nézetben a `future` `--ws-accent-2/3` 1,76–2,09:1. Cél: szöveg ≥ 4,5:1, jel ≥ 3:1 minden
>   sávban és a csendes nézetben; számolt őr-teszt a tokenekből (a vak ellenőr `contrast.mjs` mérésének megfelelője a repóban).
> - **vak J6 — fejezet-kisfilm:** a `clips/clip2-overlays.tsx` ráúszó ábrája szűrő nélkül és levágva (`lesson-clips2.css`,
>   `max-height` + `overflow: hidden`) rajzolná a HTML-táblát / kártyát / dobozt; a `server/lesson-clips.ts` a hibás paraméterű
>   blokk indexét is felkínálja. Teendő: az új fajták a kisfilm ráúszó ábrájából kimaradnak (vagy saját, görgetés nélküli
>   kicsinyített nézetet kapnak), a hibás paraméterű blokk indexe nem kínálható fel. UNVERIFIED böngészőben — előbb reprodukáld.
> - **vak J7 — fölösleges görgetés 3 oszlopnál:** `min-width: calc(var(--sv-cols) * 6.5em)` miatt egy „1 | 2 | 3” tartalmú tábla is
>   görög 360 px-en. Teendő: a legkisebb szélesség a tartalomból (nem oszlopszám × állandó); állítás a böngészős próbában.
> - **vak J8 — a „-” kezdetű felsorolás felismerése (külön, későbbi szelet):** a teljes tartalmú vak ellenőr J3 lelete után
>   (2026-11-18) listává CSAK az egyértelmű „•” kezdetű sorok alakulnak; a „-” / „–” / „*” kezdetű sorok a főágéval azonosan,
>   bekezdésként jelennek meg (`explain-paragraphs.ts`; őr: `tests/explain-paragraphs.test.ts`, a főág kimenetéhez rögzítve) — a már
>   kiadott leckékben a kötőjel előjel („- a = -3”), egyenletsor („- x + 5 = 2”, U+2212 is) vagy párbeszédjel is lehet. Teendő, ha
>   a „-” listák mégis kellenek: ELŐBB mérés a kiadott állományon (csak olvasva: hány magyarázat tartalmaz „-” kezdetű sorfutást, és
>   ezek közül mennyi lista / egyenlet / párbeszéd — kézi minta), esetlista egységtesztként (szószedet, felszólító lista,
>   kérdőszavak, számmal kezdődő pont, kijelentő párbeszéd, előjel, `=` / műveleti jel a sorban), és csak olyan szabály vezethető
>   be, amely a mért állományban egyetlen jelet sem tüntet el. Addig a gyártó promptja a felsorolást „•” jellel kérje (S3a).
> - **vak J10 — a böngészős próba a CI-ban:** tisztázva (2026-11-18): a CI alap Playwright-lépése (`npx playwright test`, a
>   `playwright.config.ts` `testMatch: '**/*.spec.ts'` mintájával, a `VITE_ENABLE_RUNTIME_PROBE=1` builddel) a
>   `tests/source-visuals.spec.ts`-t is futtatja — a saját `playwright.source-visuals.config.ts` a gyors helyi körre való (vite,
>   `--workers=1`), a workflow-ban nem kell megnevezni. Teendő: az első PR CI-futásán ellenőrizd, hogy a spec az alap
>   konfigurációval (30 mp-es alapidő, éles build) is zöld; ha ott ingadozik, a spec saját időkorlátot kapjon (a workflow-hoz
>   ügynök nem nyúl).
> - **vak J11 — nyomtatás:** nincs `@media print`; a görgő tábla nyomtatásban levágódik. UNVERIFIED — előbb reprodukáld; ha áll:
>   nyomtatásban a tábla tördelhető, görgetés nélküli.
> - **vak J12 — kódhigiénia:** a `SOURCE_VISUAL_TEXT.branchYes / branchNo` (ebben a szeletben a döntési fa használja — ha nem,
>   törlendő); a három fajta felirata egy helyen éljen (`ANIM_LABELS` ↔ `SOURCE_VISUAL_HEAD_LABELS`).
>
> **A teljes tartalmú vak ellenőr (2026-11-18, a lánc teteje) leletei — a kapcsoló BEKAPCSOLÁSA előtt kötelező („tt J…”):**
> - **tt J6 — döntési fa és képes kártya:** a leltár gyűjti, a prompt fejezethez rendelteti, a fedettségi kapu „must” / „should”
>   hiánynak méri (`gates/source-coverage-gate.ts`), de megjelenítő és sémafajta ebben a szeletben készül. Amíg nincs kész: BE
>   állapotban minden ilyen forrás „HIÁNYOS”, és a modell `animKind: "decisionTree"` blokkja fizetős javítókört indít — a kapu
>   `enforce` módra csak e szelet UTÁN kapcsolható; a szelet tesztje rögzítse, hogy a két fajta a kapun „megjelent”.
> - **tt J9 — `useHeaderFit`:** a mérés nem fut újra, ha a tábla paraméterei csere nélkül változnak (szerkesztő / előnézet);
>   közzétett leckénél nem jelentkezik. UNVERIFIED — reprodukáld az előnézetben; ha áll, a hatás függjön a fejlécek szövegétől.

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

> **Teendők az S2a független review-jából (2026-11-18) — ennek a szeletnek a kötelező részei:**
> - **B1 — a hirdetés bekapcsolása:** a gyártó promptjai (szerzői blokk-katalógus, ábrakészítő, fejezetenkénti ábratervező) a
>   `shared/lesson-schema.ts` `PROMPT_ANIM_KINDS` listájából sorolják fel az ábrafajtákat; az S2a óta ebben a `table` / `ruleBox` /
>   `compareCards` NINCS benne. EBBEN a szeletben kerül a hirdetett listába a három (az S2b után az öt) új fajta, a
>   `VISUAL_PARAMS_CONTRACT` bővítésével EGYÜTT, egy commitban; a `tests/studio-author-catalog.test.ts` két rögzített listája
>   (`ADVERTISED`, `NOT_YET_ADVERTISED`) ugyanakkor változik. Alak nélkül hirdetni tilos. A szerző kimenetén a hibás paraméterű új
>   fajtájú blokk ma kiesik (`withoutUndrawableVisuals`, telemetria: `undrawableVisualsDropped`) — a szám a próbafutások jelentésébe kerül.
> - **J8:** a prompt tiltsa a `**kiemelés**` jelölést a táblázat celláiban, a szabálydoboz pontjaiban és a kártyák soraiban (a
>   megjelenítő ezeket nyers szövegként rajzolja — a csillagok betűre megjelennének).
> - **J11:** a prompt terelje a gyártót a nagy tábla bontására: sok oszlop + hosszú cella helyett több kisebb tábla vagy kártya (a
>   megengedett legnagyobb tábla — 8 oszlop × 20 sor × 100+ karakter — ép, de telefonon ~15 000 px magas).
> - A hosszabb forrástáblát több, azonos `sourceVisualId`-jú blokkra kell bontani (`SOURCE_TABLE_BLOCK_ROWS`), a rövidebb sort a
>   fejléc hosszára kitölteni.
>
> **Teendők a VAK ellenőr S2a-leleteiből (2026-11-18; „vak J…” = a vak ellenőr sorszáma) — ennek a szeletnek a kötelező részei:**
> - **vak B1 — a kapcsoló és a hirdetés együtt:** a modell kimenetének határa (szerzői lecke: `validateLesson`; ábrafolt:
>   `applyVisualPatch`) az új fajtákat csak a `STUDIO_SOURCE_VISUALS` kapcsoló BE állapotában fogadja el (0.7); a hirdetés
>   (`PROMPT_ANIM_KINDS`, `VISUAL_PARAMS_CONTRACT`) bővítése is CSAK BE állapotban juthat a promptokba — KI állapotban a
>   `tests/source-visuals-flag.test.ts` főág-lenyomatai változatlanul zöldek kell legyenek (a hirdetett lista és a szerződés
>   kapcsolófüggő építése, teszttel).
> - **vak J4 — a szigorú séma apróságért a TELJES blokkot kiveszi:** mért kiesések: üres `caption` / `heading` / `example`, üres
>   `headerTones`, számcella (`rows: [[2, 3, 6]]`), egy cellával rövidebb sor, 21–40 soros tábla, 121 karakteres cella, 9 pontos
>   doboz, 4 kártya, extra kulcs. Teendő: determinisztikus normalizálás a séma ELŐTT (üres opcionális → hiányzó, szám → szöveg,
>   rövid sor kitöltése, hosszú tábla bontása `SOURCE_TABLE_BLOCK_ROWS` szerint, ismeretlen kulcs elhagyása), és csak a
>   normalizálhatatlan essen ki; a normalizálás számlálva (`telemetry.gates`), esetenként egységteszt + mutációs ellenpróba. A
>   kiesés oka a javító üzenetben már megjelenik (`undrawableDropNotes`, `undrawableVisualsExplained`) — a normalizálás után a
>   megmaradó kiesésekre is.
> - **vak J9 — a tesztek ereje (47 mutációból 13 túlélte):** az S2a-ban lezárva F5 / F6 (a kiesés bekötése a szerzői állomáson és a
>   végkapun — motorteszt) és F7 (a lejátszó szűrője — szerkezeti őr; a kirajzolt eredményt a böngészős próba méri). NYITOTT, ebben
>   a szeletben pótlandó teszt: F8 a telemetria-nézet sora (`run-telemetry.ts`, `undrawableVisualsDropped`); P4 / P5 az új fajta
>   említése a séma-javító üzenetben és a lektor-szabályban; S13 / S14 / S18 / S19 a `compareCards` külső `.strict()`-je, a
>   táblacím (160), a kártyacím / példa (80 / 160), a dobozcím (80) korlátja; E4 / E5 / E7 az `explain-paragraphs.ts` „bounded”,
>   „opened” feltétele és a „– soha nem lista” szabálya (mindegyikre olyan eset, amelyet más védelem nem fog meg).
>
> **A teljes tartalmú vak ellenőr (2026-11-18, a lánc teteje) leletei — a kapcsoló BEKAPCSOLÁSA előtt kötelező („tt J…”):**
> - **A modellkimenet határa (lezárva, szabályként él tovább):** a modell kimenetét (szerzői lecke, ábrafolt, fogalomjavítás,
>   leckejavítás) a `modelLessonSchema(kapcsoló)` / `modelBlockSchema(kapcsoló)` méri — KI állapotban a bővítés előtti séma. Új
>   modellkimenet-határ csak ezzel köthető be; a `lessonSchema` a TÁROLT lecke olvasására való. Új séma-mező vagy ábrafajta
>   felvételekor a `legacy…` változatból ki kell hagyni, és a `tests/source-visuals-flag.test.ts` séma-próbája (`modelSchemaProbe`)
>   bővítendő.
> - **tt J5 — leltár ↔ megjelenítő szerződés:** (a) az üres sarokfejlécű tábla (`headers: ["", "jelen", "múlt"]`) a leltárból
>   kiesik (`shared/source-visuals.ts`, `filled`); (b) szám típusú cella miatt az egész tábla kiesik; (c) a leltár 40 sort enged, a
>   blokk 20-at — a bontást a prompt mondja ki, az egy blokkba másolt tábla ne essen ki némán; (d) a leltár elfogad csonka sort (2
>   cella 3 oszlophoz), a megjelenítő soha — ilyen tétel a kapu szerint örökre hiányzik. Teendő: a leltár-érvényesítő és a
>   blokk-séma ugyanazt a normalizálást futtassa (a „vak J4” ponttal együtt), esetenként egységteszt a teljes láncon (leltár →
>   blokk → kapu „megjelent”).
> - **tt J7 — a köztes BE állapot alulbecsül:** BE állapotban a szerző / ábrakészítő promptja a leltár `table` / `ruleBox`
>   tételeit mutatja, de a hirdetett ábrafajta-lista ezeket ebben a szeletben kapja meg — az S10/1 mérés CSAK e szelet után
>   értelmezhető (előtte a fedettség mért értéke a hirdetés hiányát méri, nem a gyártó képességét).
> - **tt J8 — visszakapcsolás (BE → KI):** a BE alatt jóváhagyott / mentett terv `sourceVisualIds` / `skippedVisuals` mezője a
>   jóváhagyott terv útján megmarad (`approvedOutlineOf`, nincs `autofixOutlineVisuals`), és leltár nélkül a szerző promptjába
>   kerül; a BE alatt mentett, folytatott job leckéje (`resumePointOf`) a teljes sémával olvasódik. Teendő: KI állapotban a
>   jóváhagyott / folytatott terv és lecke forrástétel-mezői kerüljenek le (teszt: BE alatt mentett terv + KI futás kérései a
>   főágéval azonosak). A leckejavítás `coverage.visuals` írása már kapcsolófüggő (`structured-improvement.ts`).

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

> **Teendő az S2a független review-jából (J9, „SK1c”) — a fedettségi kapu `enforce` élesítése ELŐTT kötelező:** a forrás-fedettségi
> kapu (`server/studio/gates/source-coverage-gate.ts`, `substantive` / `whyNotShown`) a `table` / `ruleBox` / `compareCards` (és az
> S2b két fajtája) hivatkozó blokkjainál a SÉMA érvényességét is mérje (`visualParamProblems(...)` üres) — ma az engedékeny olvasóval
> dönt, így egy 21 soros vagy extra kulcsos tábla „megjelent”, miközben a kliens nem rajzolja ki. Mutációs ellenpróbával.

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

## SK3 — Körszám-plafon, költségjelzés, próbakeret

> **Tulajdonosi döntés (D7, kérdőív, 2026-11-18) — ez a fejezet ehhez igazodik:** éles gyártásban a token- / költségkeret
> túllépése „Csak jelezzen” (a futás megy tovább, e-mail megy; NEM állít meg); vészleállító / egységes gyártás-stop kapcsoló „Nem
> kell” (ne épüljön); a meglévő körszám-plafon marad, ahogy van; a 30 USD-os próbakeret kemény plafon marad.

Ág: `feat/futaskeret-sk3`. Fájlok: `shared/run-budget.ts` (új), `server/studio/single-run/telemetry.ts`,
`server/studio/single-run/engine.ts`, `server/studio/single-run/budget-alert.ts` (új), `server/studio/experience-builder.ts` (csak
az állandók forrása), `scripts/measure/run-budget-baseline.mts` (új), `scripts/measure/single-run-measure.mts` (a próbakeret
átadása), `tests/run-budget.test.ts`, `tests/run-budget-alert.test.ts` (újak), `tests/single-run-engine.test.ts`.

**Nem cél ebben a szeletben:** vészleállító / gyártás-stop kapcsoló; éles futás megállítása költség vagy futásidő miatt; új,
futásonkénti összesített javítókör-plafon; a borító-újrapróba, az e-mail-visszapattanás webhookja, az éles adatbázis-írás hookja, az
éjszakai invariáns-söprés és a telepítés utáni füstpróba (ezekhez a szelet nem nyúl); új adatbázis-tábla vagy migráció.

1. Alapvonal ELŐBB (csak olvasva, fizetős hívás nélkül): `run-budget-baseline.mts` a meglévő futások telemetriájából (írásvédett
   tranzakció; azonosító a kimenetbe nem kerül) kiszámolja futásonként a számolt költséget és a futásidőt, valamint naptári
   naponként (Europe/Budapest) a futások összegét; ezek átlagát, 95. percentilisét, legnagyobb értékét. A jelentés mért értékei:
   futásonként átlag 6,64 USD és 18,3 perc, legnagyobb 11,34 USD és 31 perc. A kimenet a PR-leírásba kerül.
2. `shared/run-budget.ts` (tiszta): `PRICE_PER_MTOK = { input: 4, cached: 0.2, output: 20 }`; `runCostUsd(telemetry)`;
   `RUN_ROUND_LIMITS = { stationFixRounds: 3, reviewRounds: 2, packetAttempts: 3, packetRescue: 1 }` (a mai értékek, változatlanul);
   `RUN_BUDGET_ALERT = { runUsd: 9, dayUsd: <az alapvonalból> }` — a végső számokat az 1. lépés alapvonalából állítod be ezzel a
   szabállyal: a futásonkénti küszöb a futásköltségek 95. percentilise (két tizedesre kerekítve), a napi küszöb a napi összegek
   95. percentilise; az eltérést a PR-leírás indokolja. Környezeti felülírás: `RUN_BUDGET_ALERT_USD`, `RUN_BUDGET_ALERT_DAY_USD`
   (érvénytelen érték → az alapérték).
   `budgetAlerts(input: { runUsd: number; dayUsdBefore: number; alreadySent: { run: boolean; day: boolean } }, thresholds):
   Array<"run" | "day">` — mely küszöbök lépődtek át MOST (küszöbönként egyszer; a napi akkor, ha `dayUsdBefore + runUsd` átlépi
   a napi küszöböt, és aznap még nem ment levél).
   `trialBudgetVerdict(telemetry, hardStopUsd): { state: "ok" | "stop"; reason?: string }` — KIZÁRÓLAG a próbafutáshoz.
3. A mai körkorlát-állandók (`engine.ts` — `SINGLE_RUN_FIX_ROUNDS`, `SINGLE_RUN_REVIEW_ROUNDS`; a bankkísérletek állandói az
   `experience-builder.ts`-ben) a `RUN_ROUND_LIMITS`-ból olvasnak — egy helyen állíthatók; az értékük és a megállás mai módja NEM
   változik (ezt teszt rögzíti: az állandók értéke 3 / 2 / 3 / 1, és a meglévő „3 javító forduló után megáll” teszt változatlanul
   zöld).
4. Éles jelzés (`budget-alert.ts` + `engine.ts`): a `timed(…)` burkoló minden modellhívás UTÁN (a `TelemetryRecorder` rögzítése
   után — az őr erre a rögzítésre épül) kiszámolja a futás költségét, és meghívja a `budgetAlerts`-et. Átlépett küszöbnél:
   (a) `telemetry.gateResults` bejegyzés (`gate: "runBudget"`, `mode: "report"`, a küszöb és a költség a `metrics`-ben) és napló;
   (b) e-mail a tulajdonosnak a meglévő szerveroldali adminlevél-úton (`resolveAdminRecipients` — `server/lib/material-result.ts`
   — és a meglévő levélküldő, a `sendResultEmail` mögötti út mintájára; `mailto:` tilos): tárgy „WEBSULI gyártás — költségküszöb
   átlépve”, tartalom: melyik küszöb (futásonkénti / napi), a számolt költség, a küszöb, a futás állomása és eddigi ideje;
   azonosítóként csak a job azonosítója (cím, tanulói adat, forrásszöveg nem megy levélbe). A futás NEM áll meg, a hívás
   eredménye változatlanul megy tovább. A levél hibája (nincs címzett, a küldő hibázik) naplózva, a gyártás megy tovább.
   Egyszeriség: a futásonkénti jelzés a job kimenetében (`budgetAlert.run`), folytatott futásnál sem megy újra; a napi jelzés
   egyszerisége és az aznapi összeg a meglévő jobok telemetriájából olvasva (az aznap indult / zárult egyfutásos jobok
   `output.telemetry`-je és `output.budgetAlert.day` jelzője — új tábla nélkül). A napi összeg lekérdezésének hibája → csak a
   futásonkénti jelzés megy (fail-open, naplózva). E2E-módban (a repó meglévő e2e-kapcsolója) levél nem megy.
5. Próbakeret (kemény plafon, csak a mérőharness): `single-run-measure.mts` a próbafutás keretét paraméterként adja át a motornak
   (`MEASURE_BUDGET_USD`, alapérték 7,5 → `SingleRunInput.trialBudgetUsd`). Csak ha ez a paraméter meg van adva: a `timed(…)`
   minden modellhívás ELŐTT meghívja a `trialBudgetVerdict`-et; `stop` → a hívás NEM indul el, az állapot mentődik (a meglévő
   megállási úton: `SingleRunError` → a job `error` állapota, a kimenet megmarad), a job kimenetébe `gateStop: { gate:
   "trialBudget", reason }` kerül. Éles indítási út (`runSingleUpload`, `runSingleFromMap`, `runSingleResume`) ezt a paramétert
   nem adja át — ezt teszt rögzíti.
6. `tests/run-budget.test.ts`: költségszámítás rögzített telemetriára; a körkorlát-állandók rögzített értékei; a
   `trialBudgetVerdict` határa (7,49 → `ok`, 7,50 → `stop`); a `budgetAlerts` küszöbei. Mutációk (mind a megnevezett eredménnyel):
   9,01 USD → `["run"]`, de `alreadySent.run` mellett `[]`; a napi küszöb átlépése másodszor → `[]`; érvénytelen környezeti
   felülírás → az alapérték; 8,99 USD → `[]`.
   `tests/run-budget-alert.test.ts` (hamis levélküldővel és hamis napi összeggel): küszöb felett pontosan egy levél megy, a
   címzettek az `ADMIN_EMAILS` listája, a levélben nincs `mailto:`; a levélküldő hibája nem dob; címzett nélkül nincs küldés és
   nincs hiba.
   `tests/single-run-engine.test.ts`: éles (paraméter nélküli) futásban a küszöb feletti költség mellett a hamis modell hívásszáma
   UGYANANNYI, mint küszöb nélkül, a lecke közzétéve, a `gateResults` tartalmazza a `runBudget` jelzést, a levélküldő egyszer
   hívódott; próbakerettel indítva a keret elérése után a hívásszám nem nő, a `gateStop` kitöltve, az állapot folytatható.
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

> **Előfeltételek a teljes tartalmú vak ellenőr (2026-11-18) leleteiből — a mérés és az éles bekapcsolás előtt:** az S3a „tt J5”
> (leltár ↔ megjelenítő szerződés), „tt J7” (a hirdetett ábrafajta-lista bővítése — nélküle a mérés alulbecsül) és „tt J8”
> (visszakapcsolás BE → KI) pontja, valamint az S2b „tt J6” pontja (döntési fa, képes kártya megjelenítője) LEZÁRVA. A mérés
> jelentése mondja ki tételesen, melyik lezárt, és a kapu `enforce` módra kapcsolása csak a „tt J6” után javasolható.

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
   *Spec-pontosítás 2026-11-18 (vak ellenőr: önálló beolvaszthatóság):* a harness a leltárt bekapcsolva futtatja (0.7) — a
   kimenet `flags.sourceVisuals` mezője legyen `true`; `false` esetén a futás a mai éles viselkedést méri (csak A/B alapvonalnak,
   `STUDIO_SOURCE_VISUALS=off` a futtató környezetében), a fizetős „utána” futás így NEM indítható. A mérés jelentése a végén
   külön döntési kérdést tesz fel a tulajdonosnak az éles bekapcsolásról (opciók + javaslat).
4. Minden fizetős futás ELŐTT: `trial-ledger.mts check --next 7.5` → nulla kilépési kód. Nem nulla esetén NEM indítasz futást:
   megállsz, és az orkesztrátoron át a tulajdonost kérdezed (a keret emelése tulajdonosi döntés).
5. Éles próbafutás: HM-PDF, majd PT-PDF, egymás után (nem párhuzamosan), `MEASURE_SAVE_LESSON=1`, `MEASURE_BUDGET_USD=7.5`. A
   PDF-ek a tulajdonostól / a munkamenet jegyzeteiből jönnek, a repóba nem kerülnek. Futás közben aktív követés (napló,
   telemetria). Minden futás után `trial-ledger.mts add`. Ha egy futást a próbakeret (SK3) vagy egy kapu megállít: az eredmény
   így is mérési adat — tartalék futást csak akkor használsz, ha a megállás oka a mérőkörnyezet hibája (nem a gyártásé), vagy az
   orkesztrátor kéri.
6. Kiértékelés: `source-gap-table.mts` mindkét leckére (a jelöléseket tételenként, a lecke JSON-ja és a megjelenített oldal
   képernyőképei alapján töltöd ki); a futás telemetriájából: állomásonkénti token / idő / `fixTurns`, `gates.visualsFound /
   visualsDropped`, `telemetry.visuals`, `fixReasons`, `gateResults` (SK1, SK3), `coverage.visuals`; a futás számolt ára.
   **Mérési pontok a független review-ból (SK1b):** (F11) a lektor a hiányzó tételek listáját tájékoztatásként kapja — mérd a
   lektorkörök számát és a lektor `coverage_gap` blokkolóit az alapvonalhoz képest (ad-e blokkolót a hiánylistára, nő-e miatta a
   körszám vagy a megállás); ha igen, a hiánylista az S3-ig kerüljön ki a lektor kéréséből. (F13) A leltár háromszor kerül a fő
   beszélgetésbe (terv, tananyag, ábrák) és körönként a lektorhoz — mérd állomásonként a bemeneti és a gyorsítótárból jövő
   tokent a leltár méretéhez viszonyítva (a legnagyobb leltárnál promptonként ≈ +39 ezer karakter), és számold ki a költséghatást.
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
   egyetlen célzott javító forduló a szerzőnél az eltérő fejezetekre (a meglévő körszám-plafonon belül), utána megállás és jelzés.
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
   lecke saját szövegeire (`TTS_AUTO_GENERATE` környezeti kapcsoló; lecke-szintű `maxChars` 5 000; az SK3 költségjelzése és a
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

**Az éles hanggyártás ELŐTTI teendők (a hanglánc vak ellenőrzéseiből, 2026-11-19 — üres tárnál nem hatnak, ezért nem az S8d-ben készültek):**
- Kliens E1: a helyben megőrzött jegyzék felejtsen — a friss jegyzékben nem szereplő KÉRT kulcs törlődjön a tárból és a memóriából
  (ma a törölt / újragyártott hang kulcsa megmarad, és megnyitásonként fölösleges kéréseket okoz).
- Kliens E2 (valódi eszközön igazolandó): az iOS-feloldás hatóköre — ma koppintásonként csak az éppen töltődő (legfeljebb 3) elemet érinti.
- Kliens E3 (valódi eszközön igazolandó): 60 egyszerre élő `preload="auto"` hangelem ↔ a mobil böngészők médialejátszó-korlátja.
- Kliens E4: adatkímélő mód ott, ahol nincs `navigator.connection` (Safari, Firefox) — ma ott teljes előtöltés fut.
- Kliens E5–E7: a `playPrepared` hibakezelő-csomagolása időtúllépés / megszakítás után; a szerveres tartalék elhagyott hangeleme
  szakítsa meg a letöltését; kimondás előre gyártott hang lejátszása közben.
- Szerver K4: egy hibás hang javíthatósága a tartós (`immutable`) gyorsítótár mellett — kulcsonkénti csere / változatszám.
- Szerver K5: a hideg kulcs közös betöltése (az egyszerre érkező első kérések ma mind a tárolóhoz fordulnak).
- Szerver K6: `lock_timeout` a tanácsadó zárra váró írásnál (a gyártó párhuzamossága mellett a kapcsolattár védelme).
- Szerver K9: takarítás után a törölt sor a szerver memóriájából újraindításig kiszolgálható — a takarítás ürítse a memóriatárat.
- Szerver K12: a HTML-leckék előírásának `speak()` mintája megváltozott (hangrangsor, a `pitch` kikerült) — a `LESSON_SPEC_VERSION`
  emelése vagy dokumentálása.
- Új: az éles környezetben a proxy-titok (`WEBSULI_PROXY_SECRET`) beállításának ellenőrzése a hanggyártás előtt, csak olvasva (a
  meglévő `verify-render-settings` jellegű ellenőrzéssel) — hiányzó titoknál a sebességkeret az egész oldalra közös lenne.
- Valódi iPad- és Android-próba hangfájllal (előtöltés gesztus nélkül, feloldás, tiltott hangszolgáltatású hálózat).
- **Kliens J5 (vak visszaellenőrzés, KIEMELT): hibázó hangtárnál (429 / 5xx) nincs megszakító** — minden kulcs háromszor próbálkozik
  (azonnal, +4 mp, +15 mp): egy osztály megnyitásakor ez 5 400 kérés a 4 500-as kerettel szemben. Megszakító kell (pl. néhány egymást
  követő hiba után az előtöltés leáll, és csak a jegyzék következő frissítése indítja újra).
- Kliens J1: a megszakított, el sem indult kimondás újrapróbája idegen kimondás mellett; J3: egyetlen lassú indulás után a hang 2
  koppintásra kimarad (mérlegelendő a türelem); J6: a 60 hangelemes plafon csak az előtöltésre érvényes (a plafon fölötti koppintott
  szavak is hangelemet kapnak); J7: az adatforgalmi plafon a jegyzék méreteiben bízik (hiányzó méretnél 40 kB-os becslés); J8: a
  `Retry-After` csak 120 mp-ig érvényesül, és a láthatósági frissítés nem nézi; J12: egyetlen modulszintű lejátszó (admin-előnézetben
  két lecke egyszerre); J13 (valódi eszközön igazolandó): a `click`-feloldás hatása.
- Szerver J2 (vak visszaellenőrzés): a korlát bekötésének őre a belépési ponton ma forrásszöveg-egyezés (a szerver egésze tesztben nem
  építhető fel) — viselkedési őr kell (pl. a belépési pont rétegsorának kiemelése tesztelhető függvénybe).
- Szerver J3: a hangtár kerete (4 500 kérés / 15 perc / IP) osztályonként 1,24 teljes leckenyitást bír 15 percenként — ha az osztály
  újratölt vagy két leckét nyit egymás után, 429 jön (a kliens ilyenkor a böngészőhangra esik). A gyártás előtt a keretet a valós
  használathoz kell méretezni (a CDN a sikeres hangfájlt tartósan tárolja, a mérés ezt is vegye figyelembe).
- Szerver J5–J8: a munkamenet-réteg terhelése a hangkéréseken (a hangtár útjai ne nyissanak munkamenetet); hibás hang cseréje a tartós
  gyorsítótár mellett (lásd K4); a tanácsadó zár időkorlátja (lásd K6); a visszaellenőrzés teszthézagai.

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
   a hangmotor munkamenet-ismerete KIZÁRÓLAG valódi koppintásokból (spec-módosítás 2026-11-19, vak review B1–B3 — a nulla hangerejű
   próba-kimondás megszűnt): `engineAfter(ismeret, hang, kimenet)` — a `start` esemény igazolja a hangot és törli a negatív
   ítéleteit; a kemény hiba / esemény nélküli lejárat `NEGATIVE_VERDICT_TAPS` (2) koppintásra szóló, lejáró ítélet;
   `engineAfterRound` — néma motor (minden próbált hang esemény nélkül járt le), szintén 2 koppintásra; `engineAged` — a koppintás
   „elhasználja” az ítélet egy egységét. A megszakítás (`interrupted` / `canceled`) és a `not-allowed` nem kerül az ismeretbe.
3. `shared/speech-chain.ts`: a `speechPlan` bemenete bővül — `prepared: "ready" | "loadable" | "none"` és `engine`: kész hang → az
   előre gyártott lépés elöl; tölthető, de nem kész → ha van böngészőhang-lépés, az előre gyártott lépés KIMARAD (azonnal a
   böngészőhang, a letöltés előre ugrik), ha nincs, kérésre töltődik; lejáró néma ítélet → nincs böngészőhang-lépés; igazolt hang →
   az az első, a lejáró ítéletű hangok kimaradnak; megszakított / nem engedett kimondás után a lánc a böngészőhang-szakaszt átugorja
   (`nextSpeechStep(…, { skipVoices })` — gyengébb hang nem szól a legjobb helyett). Az indulási őrök védőhálóként
   maradnak (1,5 mp; 3 / 6 mp összesített csendkeret; a szerveres tartalékra új, 8 mp-es betöltési őr — lógó válasznál hibaüzenet).
4. Jegyzék: a válasz a méreteket is adja — `{ available: string[], sizes: Record<kulcs, bájt> }`; a tároló `existing(keys)` művelete
   `{ id, size }` párokat ad. A kliens az utoljára ismert jegyzéket helyben megőrzi (`localStorage`, csak lenyomatok és méretek),
   hálózat nélkül ebből dolgozik. A lap újra láthatóvá válásakor, legfeljebb percenként frissít.
5. `client/src/lesson-runtime/speech-player.ts`: `createSpeechPlayer(env)` — a környezet (óra, időzítő, hangelem-gyár, beszédmotor,
   jegyzék-lekérés, kapcsolat, tár) befecskendezett, így a lánc bekötése ál-órával tesztelhető. Műveletek: `prepareLesson`,
   `release` (megszakítás, felszabadítás), `noteUserActivation` (valódi `click`: a futó hangletöltések feloldása iOS-en — a beszédmotorhoz nem nyúl),
   `speak`, `stop`, `setVisible` (a lap láthatósága: háttérben nem indul letöltés; visszatéréskor a jegyzék ritkított frissítése),
   `voicesChanged`. Azonos tartalmú leckére az ismételt `prepareLesson` nem teendő (a szülő újrarenderelése nem szakíthat meg hangot,
   nem dobhat el puffert — vak visszaellenőrzés B1); a nézet effektje a lecke tartalmi kulcsától függ. A szinkron `done("failed")` utáni megszakító-felülírás (vak review A5) megszűnik.
6. `server/tts/rate-limits.ts`: a három felolvasás-korlát (általános `/api/tts`, szerveres tartalék, hangtár) egy helyen, a bekötéssel
   együtt (`mountTtsRateLimits(app)`), hogy valódi HTTP-teszt mérje (vak review K4). A hangtár kerete: 30 tanuló × 40 hang × 2 kérés
   (tartománykérés) + 30 jegyzék = 2 430 → tartalékkal 3 000 kérés / 15 perc / IP. **Módosítás 2026-11-19 (szerveroldali vak review
   K1–K3):** a keret az előtöltés plafonjából, közös állandóból számol (`LESSON_AUDIO_PRELOAD_MAX` = 60, `lessonAudioRateLimitMax`):
   30 × 60 × 2 + 30 = 3 630 → 20% tartalékkal 4 500 kérés / 15 perc / IP; a belépési pont hívását bekötés-őr rögzíti; a hangtár útjain
   a 429, az 500 és az ismeretlen alút válasza kifejezetten `no-store`; az elutasított jegyzék-kérést a kliens a `Retry-After`
   szerint, legfeljebb 2 perc múlva és legfeljebb kétszer próbálja újra.
7. Tesztek (0.6): `speech-preload` (rend, plafonok, adatkímélő, újrapróba, motorállapot — mutációs ellenpróbával); `speech-player`
   ál-órával és ál-környezettel: előtöltött hang azonnal; koppintás előtöltés közben (böngészőhang most, a letöltés előre ugrik, nincs
   kettős megszólalás); félbeszakadt / hibás letöltés és újrapróba; leckeváltás futó előtöltés közben; 100 tételes lecke; a lap
   háttérbe kerülése és a jegyzék frissítése; két gyors koppintás két szóra; más nyelvű lecke; üres tár; néma motor előre ismert;
   `tts-rate-limits` valódi HTTP-n. Böngészős (0.4, `lesson-fusion`, `--workers=1`): koppintás → `playing` ≤ 300 ms előtöltött
   hangnál késleltetett hangtár mellett; böngészőhang ≤ 1 s; kikapcsolt előtöltéssel a mérés bukik (mutációs ellenpróba).
8. 0.3 szerinti kapuk. Elvárt: E50–E55.

**Mért eredmény (2026-11-19, a végleges kódon, nyugodt gépen; fejetlen Chrome, `tests/lesson-fusion.spec.ts` „prepared audio” esetei; a koppintás `click` eseményétől a hang
tényleges indulási eseményéig).** A tulajdonosnak szánt táblázat — mennyit vár a gyerek:

| Eset | Koppintástól a hangig | A mérés módja |
|---|---|---|
| Előtöltött hang (tipikus, ha a tárban van hang) | 12 ms (határ: ≤ 300 ms) | böngészőteszt, `playing` esemény; a hangtár 800 ms-mal lassítva — a késleltetést a megnyitás fizeti ki |
| Böngészőhang, a munkamenet első koppintása (működő motor) | 153 ms, ebből 150 ms a motor utánzott indulási ideje (határ: ≤ 1 s) | böngészőteszt, a beszéd `start` eseménye; a valódi motor indulási ideje eszközfüggő |
| Böngészőhang igazolt hanggal (minden további koppintás, amíg a tár üres) | 155 ms, ebből 150 ms a motor utánzott indulási ideje (határ: ≤ 1 s) | böngészőteszt |
| Koppintás az előtöltés közben / a plafon fölötti szóra | 157 ms (böngészőhang azonnal); a következő koppintás már pufferelt | böngészőteszt, 3 mp-es hangtár |
| Néma motor, az első koppintás | 3 mp (helyi első hang; mérve 3 005 ms), 6 mp (hálózati első hang). TARTÓSAN néma motornál nem „munkamenetenként egyszer”: az ítélet lejárta után (minden 3. koppintásnál) a lánc újra megpróbálja a böngészőhangot, és újra 3 / 6 mp a várakozás | böngészőteszt és ál-órás egységteszt |
| Igazolt hang, amely később elnémul | egyszer 3 mp (ha mögötte van helyi hang) – 6 mp (hálózati hang, mögötte nincs helyi) csend, utána a hang 2 koppintásra kimarad | ál-órás egységteszt |
| A szülő újrarenderelése lejátszás közben (toast, belépés / beállítás megérkezése) | a hang nem szakad meg; nincs új jegyzék- és hangfájl-kérés | böngészőteszt (mérőoldal, új lecke-objektummal) és ál-órás egységteszt |
| Néma motor, a következő 2 koppintás | 46 ms + a szerveres tartalék valós válaszideje (nem mért); a 3. koppintás újra megpróbálja a böngészőhangot | böngészőteszt helyi ál-végponttal |
| Megszakított kimondás (gyors két koppintás, Android) | ugyanaz a brit hang újrapróbával; ha az is megszakad, a szerveres tartalék | böngészőteszt és ál-órás egységteszt |
| Adatkímélő mód / 2g | az első 12 szöveg: mint az előtöltött; a többi: első koppintásra böngészőhang, utána pufferelt | ál-órás egységteszt |
| Hálózat nélkül, ismételt megnyitás | a helyben megőrzött jegyzék + a böngésző tartós gyorsítótára: mint az előtöltött | ál-órás egységteszt; böngészőben NEM mért (a teszt hálózati elfogása kikapcsolja a HTTP-gyorsítótárat) |
| Hálózat nélkül, első megnyitás | böngészőhang, a telepített helyi hang előre | ál-órás egységteszt |

Mutációs ellenpróba: kikapcsolt előtöltéssel a böngészős időmérő eset bukik; az objektum-azonosságra visszaállított előtöltés-effekt
mellett a böngészős újrarenderelés-eset bukik. A fejlesztői mutációs kör (lejátszó, előtöltés-logika, lánc, hangrangsor) 53 mutációjából
53 megölve; a független vak visszaellenőrzés saját 56 mutációjából 5 nem egyenértékű túlélt — mind az ötre teszt készült (késői
hibaesemény a leállított lépésen, nyugvó motoron nincs `cancel()`, hálózat nélküli terv, a lánc végi néma ítélet, a hanglépés őrének törlése). **Kockázat:** a fejetlen asztali Chrome időmérése nem azonos a valós eszközével; iOS Safari a
`preload`-ot felhasználói aktiváció nélkül figyelmen kívül hagyhatja (a kód a valódi koppintásnál „megérinti” a futó letöltéseket —
valódi eszközön NEM igazolt); valódi iPad- és Android-próba kell az éles hanggyártás előtt. **A hangmotor-próba megszűnt** (vak
review B1–B3, orkesztrátori döntés 2026-11-19): a lejátszó a gyerek kifejezett koppintása nélkül semmit nem mond ki és semmit nem
szakít meg; a motorról a valódi koppintások kimenetele ad — nyelvenkénti, lejáró — ismeretet.
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

## 2026-11-22 — TGM-leltár a főághoz

Mérve `git log` / `git diff --shortstat` paranccsal, a főág `442a9653` állapotán. A változatossági ágak mind a `d9d1e6c6` főág-állapotról
indultak (a főág azóta 4 committal előrébb jár), egymásra rakva, a szülő-ág beolvasztásával (merge, nem rebase). „Saját diff” = az ág
és a közvetlen szülő-ága közti különbség (`git diff <szülő> <ág>`), zárójelben a dokumentáció és a tesztek része.

| Szelet | Hol van | Saját commitok | Saját diff (+/−) | Szülő | Állapot |
|---|---|---|---|---|---|
| S1a, S1b, SK1, S2a | főág, #515 (squash; az üzenete szerint #501 + #505 + #507 + S2a), `STUDIO_SOURCE_VISUALS` mögött, alapból KI | — | — | — | kész, beolvasztva |
| S8a–S8d | főág, #516 (squash) | — | — | — | kész, beolvasztva |
| S5a | `feat/tgm-s5a-visszajelzes-nyitasok` → **`feat/tgm-s5a-v2`** (friss főágról, cherry-pick) | f2df634a, 9998d4fe, e1eb06ad, f7c93164 | +885 / −34 (docs 281, teszt 337) | `d9d1e6c6` | kész; v2 PR-ra kész, push nélkül |
| S5b | `feat/tgm-s5b-nyitasformak` | 2ef57e77, 4194703a, bffcf646, a0d26414 | +414 / −30 (docs 79, teszt 192) | S5a | kész helyben, PR nincs |
| S6a | `feat/tgm-s6a-fejezetiv` | e45e7548, d82519f7, 2db93921 (+ merge) | +335 / −8 (docs 57, teszt 119) | S5b | kész helyben, PR nincs |
| S6b | `feat/tgm-s6b-try-hang` | e08862b0, 2b477759, c0924a29 (+ merge) | +262 / −27 (docs 50, teszt 105) | S6a | kész helyben, PR nincs |
| S6c | `feat/tgm-s6c-abrafajta` | 85850874, 8ec3df80, a2e20570, 4c8b34bc (+ merge) | +572 / −101 (docs 58, teszt 142) | S6b | kész helyben, PR nincs |
| SK2 | `feat/tgm-sk2-valtozatossag-kapu` | 8b7313e4, c208c040, ce6db8a3 (+ merge) | +448 / −3 (docs 66, teszt 105) | S6c | kész helyben, kapu `report` módban |
| S2b-1 | `feat/tgm-s2b-dontesi-fa-kepes-kartya` | 88f5eb2e, b9e8eb71, 75f95a7d, c0e9f733 (+ merge) | +384 / −12 (docs 50, teszt 121) | SK2 | kész helyben; kódja a láncra nem épül, de az átvételkor az `animate-blocks.tsx` importsora és a `lesson-design.css` vége kézi feloldást kér (ott az S6c sorai is állnak), a spec önálló fájlba kerül — `feat/tgm-s2b1-v2` így készült |
| S2b-2 | `feat/tgm-s2b2-megjelenito-leletek` | 31613031, 56bdbe67, 271009c6, 3e101941 (+ merge) | +247 / −29 (docs 47, teszt 145) | S2b-1 | kész helyben |
| S3a-1 | `feat/tgm-s3a1-abrakeszito-forrasra` | 3e9d2e4e | +31 (csak docs: S3a / S3b szeletterv) | S2b-2 (a 6feff77a merge) | csak terv, kód nincs |
| S3a-2, S3b, S4a, S4b, SK3, S10, S7a, S7b, SK4, SK5, S9 | — | — | — | — | nincs elkezdve |

A helyi `feat/tgm-s1b-sk1-forras-fedettseg`, `fix/tgm-sk1b-fedettsegi-kapu-kemenyites`, `feat/tgm-s2a-megjelenitok` és `feat/tgm-s8*` ágak
a squash-merge miatt „előrébb járónak” látszanak, de tartalmuk a #515 / #516-tal a főágon van — higiéniai jelöltek (törlés csak
tulajdonosi jóváhagyással). A `higienia-backup/*` távoli ágak a változatossági ágak mentései.

*Helyesbítés (2026-11-22, a leltár után):* az első változat azt írta, hogy az S2b-1 kódja ütközés nélkül átvehető. A próba-cherry-pick
az első (docs) ütközésnél megállt, a kódcommitok le sem futottak — a próba csak akkor bizonyít ütközésmentességet, ha minden commit lefutott.

**A változatossági cél mérhetősége (seed-determinisztikus ujjlenyomat-eltérés).** A közös mag a `shared/seeded.ts` (S5a): ugyanarra a
bemenetre ugyanaz, különböző magra eltérő kiosztás, `Math.random` nélkül. Szeletenként:

- S5a — `tests/lesson-feedback-openers.test.ts`: 200 kulcson a leggyakoribb nyitás < 10%; ugyanaz a kérdés 50 különböző maggal (térkép)
  ≥ 8 különböző nyitás, mind a saját korosztály kódszótárából; ugyanaz a mag → ugyanaz a nyitás.
- S5b — `tests/lesson-opening-forms.test.ts`, `tests/lesson-bank-plan-seed.test.ts`: 100 magon ≥ 3 nyitásforma és ≥ 25 hősnév; 50 magon
  ≥ 6-féle első módszer; mag nélkül a bankterv bájtra a régi.
- S6a / S6b — `tests/lesson-section-shapes.test.ts`, `scripts/measure/shape-simulation.mts`: a fejezetív-kiosztás szomszéd- és 40%-os
  szabálya 200 magon; a szimuláció a leggyakoribb minta arányát (< 35%) és az azonos-minta valószínűséget (< 20%) méri modellhívás nélkül.
- SK2 — `shared/variety-metrics.ts`, `scripts/measure/variety-measure.mts`: az állományszintű mérőszám (alapvonal | most | küszöb); ez a
  bekapcsolási döntés gépi bizonyítéka. A valódi gyártáson mért eltérés fizetős próbát igényel (a 2026-11-20-as spec 8. szakasza,
  ≈ 20 USD) — csak tulajdonosi jóváhagyással.

**Javasolt sorrend (önálló, semleges kis PR-ok a friss főágról, cherry-pickkel, rebase nélkül):** S5a-v2 → S2b-1 (kódja a láncra nem
épül; az átvétel kézi ütközésfeloldással, lásd a táblázatot) → S5b → S6a → S6b → S2b-2 → S6c (a sávtokenes ábrák az S2b-re épülnek) → SK2 → S3a-1 kódja → S3a-2 → S3b. Az S6c (+572) és az S5a
(+885, ebből 281 docs és 337 teszt) a ~400 soros irányelv fölött van: az S6c két részre bontható (sávtokenes ábrák / ábrafajta-terv).
