# E2E eldobható adatbázis — végrehajtási utasítás (AI-ügynöknek)

Terv: `docs/specs/2026-10-17-e2e-eldobhato-adatbazis.md`. A parancsok a `source/` mappából futnak. Titkot (DATABASE_URL értékét)
semmilyen kimenetbe, naplóba, commitba nem szabad írni.

1. **`server/lib/e2e-mode.ts` (új):**
   - `isE2eMode(env = process.env): boolean` — `env.WEBSULI_E2E === "1"`.
   - `isLoopbackDatabaseUrl(url: string | undefined): boolean` — `new URL()`; a protokoll `postgres:` vagy `postgresql:`; a
     `hostname` pontosan `127.0.0.1` vagy `[::1]`; nincs `host` és `hostaddr` lekérdezési paraméter; értelmezési hiba → `false`.
   - `assertE2eDatabaseUrl(url)` — ha nem loopback: `Error("[E2E] Az e2e szerver csak 127.0.0.1/::1 adatbázishoz
     kapcsolódhat; az indulás megtagadva.")`. Az üzenet nem tartalmazza az URL-t.
   - `describeE2eDatabase(url): string` — `host:port/adatbázis`, jelszó és felhasználó nélkül.
2. **`server/lib/load-env.ts` (új):** `import dotenv from "dotenv"`; `if (!isE2eMode()) dotenv.config();`.
3. **`server/index.ts`:**
   - Az 1. sor `import "dotenv/config"` helyett `import "./lib/load-env";` (első import marad, hogy a `./db` előtt fusson).
   - Az indulási blokkban `const e2e = isE2eMode();`. Ha `e2e`: `log("[E2E] eldobható adatbázis: <describeE2eDatabase>;
     induláskori írások és háttérjobok kihagyva")`.
   - `syncDesignAssets`, az árva-zárás + sweeper blokk, `startSkillLearningAudit`, `setupScheduledPublishing`,
     `setupDailyViewSummary`, `startAutoBackupJob`, `setupCleanupImprovedFiles` csak `!e2e` esetén; `stopSkillLearningAudit`
     e2e-ben üres függvény.
4. **`server/db.ts`:** a `DATABASE_URL` kiválasztása után, a `new Pool` előtt: `if (isE2eMode()) assertE2eDatabaseUrl(DATABASE_URL);`.
5. **`playwright.config.ts`:** a webServer `env`-be `WEBSULI_E2E: '1'`; a megjegyzés frissítése (a `.env` e2e-ben nem töltődik);
   `const port = process.env.WEBSULI_E2E_PORT || '5000'` a `baseURL`-ben, a health-URL-ben és a `PORT`-ban.
6. **`scripts/run-e2e-tests.ts` (új)** a `scripts/run-learning-db-tests.ts` mintájára:
   - egyedi nevű `postgres:17` konténer, `-p 127.0.0.1::5432`, véletlen jelszó env-ből (`-e POSTGRES_PASSWORD`), `--rm -d`;
   - a `docker port` címe `127.0.0.1:<port>` kell legyen; kész-várás `select 1`-gyel;
   - `node --import tsx server/migrate.ts`, majd `node --import tsx tests/e2e-seed.ts` a saját URL-lel;
   - `node node_modules/@playwright/test/cli.js test ...process.argv.slice(2)` a `DATABASE_URL`, `WEBSULI_E2E=1`,
     véletlen `SESSION_SECRET`, `PW_TEST_HTML_REPORT_OPEN=never`, szabad `WEBSULI_E2E_PORT` (`net.createServer().listen(0)`)
     env-vel; kilépési kód = a Playwrighté;
   - `finally`: `docker stop` csak a saját konténer-azonosítóra; a hibaüzenetből a jelszó kitakarva.
7. **`package.json`:** `"test:e2e": "node --import tsx scripts/run-e2e-tests.ts"`.
8. **`.github/workflows/ci.yml`:** `DATABASE_URL: postgres://postgres:postgres@127.0.0.1:5432/websuli`.
9. **`tests/e2e-mode.test.ts` (új):**
   - `isLoopbackDatabaseUrl`: elfogad `127.0.0.1`, `[::1]`; elutasít neon-hosztot, `localhost`-ot, `127.0.0.1.evil.example`-t,
     `?host=` / `?hostaddr=` paramétert, `mysql:` sémát, üres/értelmezhetetlen értéket.
   - `assertE2eDatabaseUrl`: dob, és az üzenet nem tartalmazza a jelszót/hosztot.
   - Gyermekfolyamat: `WEBSULI_E2E=1`, nem-loopback `DATABASE_URL` → `server/db.ts` importja nem nulla kóddal kilép, a kimenetben
     nincs jelszó.
   - Gyermekfolyamat: ideiglenes mappában `.env` hamis `DATABASE_URL`-lel; `WEBSULI_E2E=1` mellett a `load-env` után a
     `DATABASE_URL` nincs beállítva, `WEBSULI_E2E` nélkül be van.
10. **Kapuk:** `npm run check`, `npm run check:test`, `npm run lint`, `node --import tsx --test tests/e2e-mode.test.ts`,
    teljes `npm test`, majd `npm run test:e2e` (teljes csomag) — a kimenetben az `[E2E]` sor `127.0.0.1:<port>`-tal; utána
    `docker ps` szerint a saját konténer eltűnt, a `platform-db-dev` fut.
