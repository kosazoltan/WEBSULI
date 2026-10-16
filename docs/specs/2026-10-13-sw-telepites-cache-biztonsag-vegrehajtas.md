# Végrehajtás: service worker biztonságos telepítés

Spec: `docs/specs/2026-10-13-sw-telepites-cache-biztonsag.md`. Munkakönyvtár: `source/`.

## 1. Tesztszerver — `tests/support/service-worker-static-server.mjs`

- Node `http` szerver, port a `SW_TEST_PORT` env-ből (alap 5179), `127.0.0.1`.
- `client/public` fájljait szolgálja ki (path-traversal védelem: a feloldott út a gyökér alatt legyen).
- Állapot: `version` (null = eredeti fájl), `fail` (útvonalak halmaza).
- `GET /service-worker.js`: a fájl tartalma; ha `version` be van állítva, a
  `const CACHE_VERSION = '...'` sort `const CACHE_VERSION = '<version>'`-re cseréli;
  `Cache-Control: no-store`.
- `fail`-ben szereplő útvonalra 500.
- `GET /__sw-test/reset`, `GET /__sw-test/set?version=X&fail=/a,/b` — vezérlés; `GET /` egy
  minimális HTML oldal.

## 2. Playwright config — `playwright.service-worker.config.ts`

- `testMatch: "service-worker-install.spec.ts"`, `channel: "chrome"`, `workers: 1`,
  `baseURL: http://127.0.0.1:5179`, `serviceWorkers: "allow"`.
- `webServer.command: "node tests/support/service-worker-static-server.mjs"`, url `/__sw-test/reset`.

## 3. Teszt — `tests/service-worker-install.spec.ts`

Közös: `reset`, oldal betöltése, `navigator.serviceWorker.register('/service-worker.js')`,
`navigator.serviceWorker.ready`, a v1 cache-név (`caches.keys()`) kiolvasása.
- (1) `set?version=9.9.9-ok` → `registration.update()` → várj, amíg az aktív worker cache-neve
  `anyagok-profiknak-v9.9.9-ok` és `caches.keys()` pontosan `[új név]`; `/offline.html` benne.
- (2) `set?version=9.9.9-fail&fail=/favicon.ico` → `update()` → várj, amíg az installing worker
  `redundant`; `caches.keys()` tartalmazza a régi nevet, `caches.open(régi).match('/offline.html')` megvan;
  `registration.active` a régi worker.

Hibapróba: a teszt (2) a régi `install` kóddal BUKIK. Parancs:
`npx playwright test -c playwright.service-worker.config.ts` (elvárt: régi kóddal 1 failed, javítás után 2 passed).

## 4. Javítás — `client/public/service-worker.js`

`install`: `caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())`;
a törlő ág és a „clearing ALL caches” log kikerül. `activate` változatlan.

## 5. Verifikáció és PR

- `npx playwright test -c playwright.service-worker.config.ts` → 2 passed.
- `npm test` célzottan nem érintett; `npx tsc --noEmit` (ha a config/spec típus-ellenőrzött).
- Branch `fix/sw-install-cache-safety`, PR a `main`-re; merge csak kifejezett kérésre.

## Kiegészítés 2026-10-16 (a PR CI-hibája)
- **Hiba:** a fő `playwright.config.ts` minden `*.spec.ts` fájlt futtat, így a SW-tesztet is a saját statikus szervere nélkül. Ott az `update()` nem hoz új workert, ezért a teszt szükségszerűen bukik.
- **Javítás:**
  - A tesztfájl új neve `tests/service-worker-install.browser.ts` (a `lesson-arbiter.browser.ts` mintájára). A fő futás nem veszi fel.
  - A `playwright.service-worker.config.ts` `testMatch`-e ezt a fájlt nézi.
  - A `channel: "chrome"` helyett a CI-ben telepített beépített Chromium fut (`npx playwright install chromium`).
  - Új CI-lépés: `npx playwright test --config playwright.service-worker.config.ts`.
- A `main` 2026-10-16-i állapotán a hiba még fennáll: az `install` minden cache-t töröl.

## Kiegészítés 2026-10-16 (review #207)
- **`CACHE_VERSION` 4.3.0 → 4.4.0.** Új cache-név nélkül a frissítés a régi, azonos nevű cache-t használná tovább, benne elavult futásidejű válaszokkal.
  Szabály: minden worker-kiadás új verziót kap.
- **Sikertelen telepítés:** ha a jelölt cache a telepítés előtt nem létezett, törlődik, így nem halmozódnak az elhagyott cache-ek. A meglévő (aktív) cache-hez nem nyúl.
- **Teszt:** az `updatefound` figyelése a `registration.update()` ELŐTT indul, így a gyorsan aktiválódó worker sem okoz téves bukást.
  A sikertelen ágban a cache-lista pontosan a régi cache (nincs elhagyott jelölt).
