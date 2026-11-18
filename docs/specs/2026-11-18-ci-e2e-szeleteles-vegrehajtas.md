# Végrehajtás: a CI böngészős körének szeletelése (AI-olvasható utasítás)

> Terv: `docs/specs/2026-11-18-ci-e2e-szeleteles.md` · Ág: `chore/ci-e2e-szeleteles` · Munkafa:
> `.claude/worktrees/ci-e2e-gyorsitas`
> **Állapot:** megvalósítva helyben; push / PR / CI-futás az orkesztrátoré (NOT RUN: a workflow-t a CI csak push után futtatja).

Szabályok erre a szeletre: a `source/` alatt SEMMI nem módosul (se teszt, se konfig); `retries`, `workers`, időkorlát a
Playwright-konfigban érintetlen; a szkript Node ESM, függőség nélkül; tesztet gyengíteni tilos; titok sehova; push, PR,
`--no-verify`, rebase tilos; a főág védelméhez nem nyúlunk.

## 1. lépés — Doksik (első commit)

- Fájlok: `docs/specs/2026-11-18-ci-e2e-szeleteles.md`, `docs/specs/2026-11-18-ci-e2e-szeleteles-vegrehajtas.md`.
- Parancs: `node scripts/qa/three-phase-check.mjs --base origin/main` → elvárt: `[három-fázis] OK: Nincs kódváltozás …`.
- Commit: `docs(ci): a böngészős kör szeletelésének terve és végrehajtási utasítása`.

## 2. lépés — Felosztó és számláló-ellenőr: `scripts/qa/e2e-shards.mjs`

Exportok (tiszta függvények, a tesztek közvetlenül hívják):

- `flattenTests(json)` — a Playwright JSON-riporter kimenete → `[{ id, project, file, titles, key, status, results, durationMs }]`
  a lista sorrendjében. `id` = `<spec.id>::<projekt>`; `file` = a teszt forrásfájlja a `testDir`-hez képest (`spec.file`, pl.
  `support/game-mobile-quality.ts`); `titles` = a `describe`-címek (a névtelen kimarad) + a teszt címe; `key` =
  `[projekt] › fájl › cím › …` — ez egyben a `--test-list` sora (a Playwright `loadTestList` a `›` mentén bont, projektet, a
  `rootDir`-hez viszonyított fájlt és a teljes címutat egyezteti); `results` = az eredmények száma; `durationMs` = az összes
  kísérlet ideje.
- `inexpressible(tests)` — a `--test-list`-ben ki nem fejezhető címek (`›`, üres, szélső szóköz): a `plan` ezeknél megáll.
- `validateWeights(w)` — `defaultSecPerTest > 0`, `files[*] > 0`, `splittable` fájlnevek tömbje.
- `partition(tests, weights, total)` → `total` darab `{ tests, weight }`; a bemenet előbb a stabil `key` szerint rendeződik (a
  lista sorrendjétől független; a szeleten belül is `key` szerinti sorrend); egység = fájl; a `splittable` fájl a szelet-cél
  felénél nehezebb esetben egymást követő, közel azonos darabszámú részekre bomlik; rendezés súly szerint csökkenően (holtverseny:
  név), kiosztás a legkönnyebb szeletbe (holtverseny: kisebb sorszám); a szeleten belül a lista sorrendje.
- `testListText(tests)`, `reportName(part)` (`e2e-report-<k>.json`).
- `checkCoverage(listed, shards)` → `{ ok, problems, rows, sum, skipped, expected }` a terv 5. pontja szerint (átment =
  `expected` / `flaky`; deklarált kihagyás külön) (hiányzó jelentés, listán
  kívüli, kétszer futó, eredmény nélküli, egyik szeletben sem futó teszt; összeg ≠ lista).
- `measuredWeights(tests, previous)` — a jelentésekből mért mp / teszt fájlonként (a `splittable` és a megjegyzés megmarad).
- `main(argv, log)` — `plan --list --weights --total --part --out`, `check --list --reports --total [--weights --weights-out]`;
  hibánál 1. A `plan` megáll üres listánál, azonos kulcsú teszteknél, üres szeletnél, hibás `--part`-nál.

Súlyfájl: `scripts/qa/e2e-shard-weights.json` (`defaultSecPerTest`, `splittable`, `files`). Kezdőértékek: a terv 1.3 pontjának
mérése (két zöld CI-futás idősora a kimért futási sorrendre vetítve).

Teszt: `scripts/qa/e2e-shards.test.mjs` (`node --test`): címút (beágyazott / névtelen `describe`, forrásfájl), felosztás
(minden teszt pontosan egyszer, determinisztikus, nem bontható fájl együtt marad, bontható nehéz fájl szétoszlik, kiegyensúlyozott),
`--test-list` sor, ki nem fejezhető cím, számláló-ellenőr minden hibaága, `plan` → hamis jelentések → `check` körút, és **őr a
valódi fájlokra**: a `ci.yml` mátrixának számozott részei = 1…`E2E_SHARDS`; pontosan egy job neve „Playwright E2E”, `always()`
feltétellel, az `e2e-parts`-ra várva, a rész-eredményt ellenőrző lépéssel; a súlyfájl érvényes.

- Parancs: `node --test scripts/qa/e2e-shards.test.mjs` → minden eset zöld (az őr-esetek a 3. lépés workflow-jával együtt).
- Commit: a 3. lépéssel EGYÜTT (az őr-esetek a valódi `ci.yml`-t olvassák, külön commitban pirosak lennének).

## 3. lépés — Workflow: `.github/workflows/ci.yml`

- Workflow-szintű `env: E2E_SHARDS: 6`.
- `three-phase` job „Unit test” lépése: a listához `scripts/qa/e2e-shards.test.mjs`.
- Új `e2e-parts` job (a régi `e2e-tests` lépéseivel): `name: E2E rész (${{ matrix.part }})`, `runs-on: ubuntu-24.04`,
  `needs: lint-typecheck`, `timeout-minutes: 60`, `strategy: { fail-fast: false, matrix: { part: ['1','2','3','4','5','6',
  'kiegeszito'] } }`, ugyanaz a `postgres:16` service és job-`env`. Lépések: checkout → Node → `npm ci` → böngésző-telepítés
  (változatlan) → build → migráció → seed →
  - számozott részben: `npx playwright test --list --reporter=json > "$RUNNER_TEMP/e2e-list.json"`, majd
    `node ../scripts/qa/e2e-shards.mjs plan … --total "$E2E_SHARDS" --part "$E2E_PART" --out "$RUNNER_TEMP/e2e-shard.txt"`, majd
    `npx playwright test --test-list "$RUNNER_TEMP/e2e-shard.txt" --reporter=dot,html,json`
    (`PLAYWRIGHT_JSON_OUTPUT_NAME: e2e-report-<rész>.json`);
    (a `--list` módban a JSON a szabványos kimenetre megy — a `PLAYWRIGHT_JSON_OUTPUT_NAME` ott nem ír fájlt, helyben mérve);
  - a `kiegeszito` részben: az öt meglévő `--config` lépés változatlan paranccsal;
  - artefaktum: `e2e-json-<rész>` (számozott rész, megszakítás kivételével mindig), bukáskor `playwright-report-<rész>`
    (`source/playwright-report` + `source/test-results`), `overwrite: true`.
- `e2e-tests` job (a név marad „Playwright E2E”): `needs: [lint-typecheck, e2e-parts]`, `if: ${{ always() }}`,
  `timeout-minutes: 15`; lépések: checkout → „Minden rész zöld?” (`test "$PARTS_RESULT" = "success"`) → Node → `npm ci` →
  `actions/download-artifact@v4` (`pattern: e2e-json-*`, `merge-multiple: true`) → lista + `e2e-shards.mjs check … --weights-out`
  → a mért súlyfájl artefaktumként (`e2e-shard-weights-measured`).
- Parancs: `node --test scripts/qa/e2e-shards.test.mjs` (az őr a valódi `ci.yml`-t olvassa) → zöld.
- Commit: `ci: a böngészős kör hat szeletben + kiegészítő rész, egy záró „Playwright E2E” ellenőrzéssel`.

## 4. lépés — Helyi igazolás (szkripttel)

A `source/` mappában (`npm.cmd ci --ignore-scripts` után; Windows-on a Playwrightot `node node_modules/@playwright/test/cli.js`
alakban hívd — C-72):

1. Teljes lista: `CI=true node node_modules/@playwright/test/cli.js test --list --reporter=json > <lista.json>` → tesztszám.
2. Mind a 6 részre: `node ../scripts/qa/e2e-shards.mjs plan --list <lista.json> --weights ../scripts/qa/e2e-shard-weights.json
   --total 6 --part <k> --out <szelet-k.txt>`, majd a Playwright SAJÁT kiválasztása:
   `… test --list --test-list <szelet-k.txt> --reporter=json > <e2e-report-k.json>`.
3. Unió / átfedés: a `<e2e-report-k.json>` fájlok a `--list` miatt eredmény nélküliek, ezért a `check` „nem futott le” sorokat ad
   (ez itt elvárt); az unió hiánytalanságát és az átfedésmentességet külön, az azonosítók halmazán kell kimutatni (a PR-leírásban
   a kimenet).
4. Valódi futás a számláló-ellenőr igazolására (kis lista, eldobható adatbázison, a CI kapcsolóival): egy néhány tesztes
   `--test-list` (köztük adatbázist író, `serial` fájl) → `CI=true PLAYWRIGHT_JSON_OUTPUT_NAME=<mappa>/e2e-report-1.json node
   --import tsx scripts/run-e2e-tests.ts --test-list <kis.txt> --reporter=dot,html,json`; a listája
   `… test --list --test-list <kis.txt> --reporter=json > <kis-lista.json>`; majd `node ../scripts/qa/e2e-shards.mjs check --list
   <kis-lista.json> --reports <mappa> --total 1` → `EGYEZIK`, a „lefutott” oszlop = a tesztszám; ellenpróba a TELJES listával →
   `ELTÉR`, kilépési kód 1. Előtte: `docker ps --filter name=websuli-e2e- --format "{{.Names}} {{.RunningFor}}"` (≥ 2 friss
   konténernél várj).
5. Egy TELJES szelet helyi futtatása nem része ennek a körnek (NOT RUN: szeletenként ~15–40 perc gépidő a közös gépen, más
   ügynökök böngészős futásai mellett); a fájlok közötti sorrendfüggést az első CI-futás mutatja ki (6. lépés 5. pont). A
   kiegészítő öt konfig az adatbázist és az alkalmazásszervert nem használja (saját Vite- / statikus szerver — a terv 6. pontja).

## 5. lépés — Csapda-javaslat és kapuk

- C-48: szelet-PR nem ír a közös `docs/agent-csapdak.md` katalógusba; a csapda-javaslat a zárójelentésbe kerül, az orkesztrátor
  veszi fel (a beépített `--shard` darabszám szerint vág; a futási sorrend nem a fájllista; `--list` módban a JSON a szabványos
  kimenetre megy; a kötelező ellenőrzés nevét záró job viselje `always()`-szal, mert a kihagyott job sikeresnek számít).
- `npm run gate:stage`, majd `npm run gate:push` a munkafa gyökeréből (a `native-arch.test.ts` helyi bukása ismert kivétel).

## 6. lépés — Az első CI-futásnál ellenőrizendő (NOT RUN a push előtt)

1. Mind a 7 „E2E rész (…)” job elindul, mindegyikben él a Postgres-konténer, a migráció és a seed zöld.
2. A számozott részek „Szelet kijelölése” lépése ugyanazt a táblát írja ki (6 sor, 819 teszt összesen), más-más csillaggal.
3. A záró „Playwright E2E” kimenete: `a szeletekben lefutott tesztek összege: 819; a lista teljes száma: 819 → EGYEZIK`.
4. Falióra: a futás indulásától a „Playwright E2E” zöldjéig ≤ 30 perc; a leghosszabb rész jobideje ≤ 20 perc. Ha több: a
   súlyfájl frissítése az `e2e-shard-weights-measured` artefaktumból (csak a `files` és a `defaultSecPerTest`), új mérés.
5. Bukó teszt egy részben, amely a mainen zöld: sorrendfüggés gyanúja → a rész `playwright-report-<k>` artefaktuma; a javítás a
   tesztben (saját előfeltétel), nem a szeletelés lazítása.
6. Ellenpróba a védelemre: a PR „Checks” fülén a „Playwright E2E” a záró job; a `gate:merge` „kötelező ellenőrzések” lépése zöld.
7. Lint-bukásnál (ha előfordul) a „Playwright E2E” piros (nem „skipped”).
8. „Re-run failed jobs” egy bukott részre: a rész újrafut, a záró job az új jelentéssel számol (az artefaktum felülírása
   UNVERIFIED — ha a letöltés a régi jelentést adja, a záró job a „nem futott le” sorral bukik; akkor teljes újrafuttatás kell,
   és jegy a javításra).

## 7. Összevonási sorrend (C-61)

A PR repó-szintű hatókörű (`.github/workflows/**`, `scripts/qa/**`): a `gate:merge` csak akkor zöld, ha a CI a jelenlegi mainnel
futott. Előbb a testvér-PR (`test/joystick-tsunami-stabil`), utána ez, összevonási ablakban (a main beolvasztása → zöld CI →
`gate:merge` → merge, közben más PR nem megy be).
