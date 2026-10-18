# E2E: eldobható adatbázis és az éles DB kizárása (2026-10-17)

## Probléma (a kódból ellenőrizve)

- `source/playwright.config.ts` `webServer`-e `npm run build:e2e && node dist/index.js`-t indít `NODE_ENV=production`-nel, a
  `process.env`-et változatlanul továbbadva.
- `source/server/index.ts:1` `import "dotenv/config"`: helyben a szerver a `source/.env`-ből tölti a `DATABASE_URL`-t — ez az
  éles Neon adatbázis. A dotenv a `.env` minden, a környezetben még nem szereplő kulcsát betölti (`DEV_DATABASE_URL`-t is).
- `source/server/db.ts` modulbetöltéskor létrehozza a poolt és azonnal kapcsolódik (`testConnectionWithRetry()`).
- Induláskor írások (`server/index.ts`): `syncDesignAssets()` (design_assets), `closeOrphanedOneStepRuns()`,
  `closeOrphanedStudioJobs()`, `startStudioJobSweeper()` — egy éppen futó éles gyártást is lezárhat. Ezen felül háttérjobok
  indulnak: `startSkillLearningAudit`, `setupScheduledPublishing`, `setupDailyViewSummary` (e-mail), `startAutoBackupJob`,
  `setupCleanupImprovedFiles`.
- CI (`.github/workflows/ci.yml`, `e2e-tests`): `postgres:16` service-konténer, `DATABASE_URL=...@localhost:5432/websuli`,
  `npm run db:migrate`, `tests/e2e-seed.ts`, majd `npx playwright test`. A CI tehát már eldobható DB-n fut; a helyi futás nem.
- A többi `playwright.*.config.ts` csak vite/statikus szervert indít, adatbázis nélkül — nem érintett.

## Cél

1. A helyi `npm run test:e2e` saját, eldobható `postgres:17` konténert indít (loopbackra kötve, véletlen jelszóval), alkalmazza
   a migrációkat (`server/migrate.ts`), betölti az e2e seedet, ezen futtatja a Playwrightot, végül eltávolítja a konténert.
2. E2E módban (`WEBSULI_E2E=1`, a `playwright.config.ts` webServer-e mindig beállítja) a szerver:
   - nem tölti be a `.env`-et (így sem a `DATABASE_URL`, sem a `DEV_DATABASE_URL` éles értéke nem kerül be);
   - megtagadja az indulást (a pool létrehozása ELŐTT kivétellel kilép), ha a `DATABASE_URL` hosztja nem `127.0.0.1` vagy `::1`;
   - kihagyja az induláskori írásokat és a háttérjobokat (felsorolás fent);
   - egy sort naplóz: `[E2E] ...` a loopback host:porttal (jelszó/URL nélkül) — ez a futás bizonyítéka.
3. CI: a `DATABASE_URL` `localhost` helyett `127.0.0.1` (az őr szigorú, `localhost`-ot nem fogad el, mert a névfeloldás nem
   garantáltan loopback).

## Nem-cél

- A `platform-db-dev` konténert nem érintjük, nem használjuk (a harness saját, egyedi nevű konténert indít és csak azt állítja le).
- A CI szerkezete (service-konténer) marad; csak a host változik.
- A vite/statikus Playwright-konfigok és a `scripts/run-learning-db-tests.ts` nem változnak.
- Az éles indulási útvonal nem változik: `WEBSULI_E2E` nélkül a `.env` ugyanúgy betöltődik és minden job elindul.

## Érintett fájlok

- új `source/server/lib/e2e-mode.ts` — `isE2eMode()`, `isLoopbackDatabaseUrl()`, `assertE2eDatabaseUrl()`, `describeE2eDatabase()`
- új `source/server/lib/load-env.ts` — dotenv csak nem-e2e módban
- `source/server/index.ts` — `load-env` import, e2e-ágon a jobok kihagyása, `[E2E]` naplósor
- `source/server/db.ts` — az őr a pool létrehozása előtt
- `source/playwright.config.ts` — `WEBSULI_E2E: '1'` a webServer env-ben
- új `source/scripts/run-e2e-tests.ts` — eldobható DB harness
- `source/package.json` — `test:e2e` → harness
- `.github/workflows/ci.yml` — `127.0.0.1`
- új `source/tests/e2e-mode.test.ts` — unit + gyermekfolyamatos teszt

## Rögzített döntések

- Loopback: csak a `127.0.0.1` és `[::1]` hoszt; tilos a `host`/`hostaddr` lekérdezési paraméter (a `pg` ezzel felülírná a
  hosztot); nem `postgres:`/`postgresql:` séma vagy értelmezhetetlen URL → elutasítás.
- Az őr hibaüzenete soha nem tartalmazza az URL-t (csak hogy miért utasította el, pl. „a hoszt nem loopback”).
- A harness a projekt `.env`-jét nem olvassa, a gyermekfolyamatok env-jéből törli a `DATABASE_URL`/`DEV_DATABASE_URL`-t, majd
  csak a saját eldobható URL-t adja át. A Playwright HTML-riport nem nyílik meg automatikusan (`PW_TEST_HTML_REPORT_OPEN=never`).
- A harness a Playwright CLI-t `process.execPath`-szel indítja (Windows-on nincs shell-shim), a parancssori argumentumokat
  továbbadja (pl. `npm run test:e2e -- tests/websuli.spec.ts`).
- A harness szabad portot választ a web szervernek (`WEBSULI_E2E_PORT`; a `playwright.config.ts` alapértéke 5000 marad a CI
  számára), mert egy másik checkout 5000-en futó szervere különben megakasztja a futást (mérve 2026-10-17).

## Edge case-ek

- `WEBSULI_E2E=1`, `DATABASE_URL` hiányzik → `db.ts` a `localhost` alapértékre esne → elutasítás (nem loopback-IP).
- `postgres://u:p@127.0.0.1.evil.example/db` → hostname nem pontosan `127.0.0.1` → elutasítás.
- `postgres://u:p@127.0.0.1:5432/db?host=ep-x.neon.tech` → elutasítás.
- A Docker nem fut / a konténer nem lesz kész → a harness hibával kilép, a konténert (ha létrejött) leállítja.
- A Playwright bukik → a harness a Playwright kilépési kódjával lép ki, a konténert leállítja.

## Elfogadás (EARS)

- AMIKOR `WEBSULI_E2E=1` és a `DATABASE_URL` hosztja nem `127.0.0.1`/`::1`, a szerver AKKOR a DB-pool létrehozása előtt nem
  nulla kóddal kilép, és a kimenet nem tartalmazza az URL-t.
- AMIKOR `WEBSULI_E2E=1`, a szerver NEM tölti be a `.env` fájlt.
- AMIKOR `WEBSULI_E2E=1`, a szerver NEM hívja a `syncDesignAssets`, `closeOrphanedOneStepRuns`, `closeOrphanedStudioJobs`,
  `startStudioJobSweeper` függvényeket és a háttérjobokat, és naplózza az `[E2E]` sort a loopback host:porttal.
- AMIKOR `WEBSULI_E2E` nincs beállítva, az indulás viselkedése változatlan.
- AMIKOR a fejlesztő `npm run test:e2e`-t futtat, a teljes Playwright-csomag egy saját `postgres:17` konténeren fut, amely a
  futás végén eltávolításra kerül; a `platform-db-dev` érintetlen.

## Mért eredmény (2026-10-17, Windows, helyi Docker)

- `npm run test:e2e`: saját `postgres:17` konténer, `127.0.0.1:<véletlen port>`; 30 migráció + 12 seed-tananyag; a szerver
  naplója: `[E2E] eldobható adatbázis: 127.0.0.1:<port>/websuli_e2e; induláskori írások és háttérjobok kihagyva`.
- Eredmény: a `games-touch-controls.spec.ts` nélküli 206 teszt 206/206 zöld; a `games-touch-controls.spec.ts` külön futtatva
  10/10 zöld — összesen 216/216.
- Meglévő, ettől a változástól független hiba (nem javítva): Windows-on a tesztek lefutása után a Playwright-workerek nem lépnek
  ki, a futás a globális időkorlátig áll, majd 1-es kóddal ér véget („Timed out waiting … for the test suite to run”). Ugyanez
  történik adatbázis és Node-szerver nélkül, csak vite-tal futtatva is (a `games-touch-controls.spec.ts`-szel mérve), tehát
  nem a szerver vagy a DB okozza. Helyben ajánlott: `npm run test:e2e -- --global-timeout=1200000`.
- Negatív próba: a buildelt szerver a valódi `.env`-et tartalmazó mappából `WEBSULI_E2E=1`-gyel indítva 1-es kóddal kilép
  („az indulás megtagadva”); a kimenetben nincs `neon.tech` vagy `postgres://` szöveg.
- Megfigyelés: a futás alatt egy idegen `node dist/index.js` foglalta az 5000-es portot — ezért kell a szabad port.
