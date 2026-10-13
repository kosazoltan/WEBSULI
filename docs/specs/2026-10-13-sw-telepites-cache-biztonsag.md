# Service worker: biztonságos telepítés (offline cache nem vész el)

Forrás: Sourcery review a kosazoltan/WEBSULI#206 PR-on (a hiba már a PR előtt is megvolt).

## Tény (kódból ellenőrizve)

`source/client/public/service-worker.js` `install` kezelője először **minden** cache-t töröl
(`caches.keys()` → `caches.delete`), és csak utána hívja a `cache.addAll(STATIC_ASSETS)`-t.
Ha bármelyik statikus fájl kérése elbukik, az `addAll` rejectel, a telepítés megszakad,
az új worker `redundant` lesz, a régi aktív marad — de a régi cache (benne `/offline.html`)
már törölve van. A felhasználó elveszíti az offline tartalék oldalt.

## Cél

- `install`: csak az új, verziózott `CACHE_NAME` cache-t tölti fel; semmit nem töröl.
- `activate`: a `CACHE_NAME`-től eltérő cache-eket törli (ez már így van). Az `activate`
  csak sikeres telepítés után fut, tehát ekkor az új cache teljes.
- `CACHE_VERSION` emelése továbbra is új cache-nevet és frissítést jelent; `skipWaiting` marad.

## Nem-cél

- A fetch-stratégia, push, notificationclick változtatása.
- A `CACHE_VERSION` értékének módosítása (a viselkedés-változás nem igényel új verziót, de a
  böngésző a bájt-eltérés miatt úgyis frissít).

## Edge case-ek

- Elbukó asset telepítéskor: régi cache és `/offline.html` megmarad; a régi worker aktív.
- Félig feltöltött új cache: az `addAll` atomikus (hibánál nem ír semmit), legfeljebb egy üres
  `CACHE_NAME` cache maradhat; ezt a következő sikeres `activate` nem törli (azonos név), a
  következő sikeres `install` feltölti. Elfogadható.
- Első telepítés (nincs régi cache): változatlanul működik.

## Elfogadás (EARS)

- AMIKOR egy új verzió sikeresen települ és aktiválódik, a rendszer cache-listája PONTOSAN
  az új `CACHE_NAME`-ből áll, és abban megvan az `/offline.html`.
- HA egy statikus asset kérése elbukik az új verzió telepítésekor, AKKOR a régi cache
  megmarad, benne az `/offline.html`, és a régi worker marad aktív.
- Ellenőrzés: Playwright böngészőteszt (`source/tests/service-worker-install.spec.ts`) valódi
  Chrome service workerrel; a teszt a régi kóddal bukik (hibapróba), az újjal zöld.

## Érintett fájlok

- `source/client/public/service-worker.js`
- `source/tests/service-worker-install.spec.ts` (új)
- `source/tests/support/service-worker-static-server.mjs` (új)
- `source/playwright.service-worker.config.ts` (új)
