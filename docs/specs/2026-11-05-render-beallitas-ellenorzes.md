# A Render-beállítás összevetése a repóval, CI-ben (2026-11-05)

Tulajdonosi döntés (2026-11-05): (A) a Render-felület build-parancsa a `render.yaml` szerinti legyen; (B) a Render-beállítás
és a repó feltevéseinek összevetése a CI-ben fusson, `RENDER_API_KEY` GitHub-titokkal.

## Mért tények (Render MCP `get_service`, 2026-11-05)

- `websuli-api-eu` (`srv-d6h9oq9drdic73cied30`): `branch: main`, `autoDeploy: yes`, `rootDir: source`,
  `buildFilter.ignoredPaths: docs/**, **/*.md, source/tests/**, .github/**`, `buildFilter.paths: []`.
- `serviceDetails.envSpecificDetails.buildCommand`: `npm install --include=dev --legacy-peer-deps && (npm run db:migrate ||
  echo MIGRATE_SKIPPED) && npm run build` — eltér a `render.yaml` `buildCommand`-jától
  (`npm ci --include=dev --legacy-peer-deps && npm run db:migrate && npm run build`).
- A szolgáltatás nem Blueprint-kezelt; a build-parancsot a Render MCP nem tudja módosítani, az `api.render.com` a
  munkamenet hálózatából nem érhető el (403) → az (A) lépést a tulajdonos végzi a Render-felületen.
- A `scripts/qa/verify-render-revision.mjs` a `RENDER_ROOT_DIR` / `RENDER_IGNORED_PATHS` állandókból számol.

## Cél / nem-cél

- Cél: `scripts/qa/verify-render-settings.mjs` a Render API-ból kiolvasott beállítást összeveti a repó feltevéseivel
  (`RENDER_ROOT_DIR`, `RENDER_IGNORED_PATHS`, `main`, `autoDeploy`, a `render.yaml` build-parancsa); a CI-ben külön job
  futtatja, ha a `RENDER_API_KEY` titok be van állítva.
- Nem-cél: a Render-beállítás módosítása a szkriptből (csak olvas); a titok beállítása (tulajdonos).

## Edge case-ek

- Nincs kulcs (fork PR, még nincs beállítva): a CI-lépés kihagyva, a szkript kézi futtatásnál 2-vel lép ki.
- A kulcs soha nem kerül naplóba; nem 2xx válasznál csak a státusz.
- A kizárt útvonalak sorrendje nem számít (halmaz-összevetés).
- Amíg az (A) lépés nincs kész, a job a build-parancs eltérését jelzi (1) — ez a szándékolt viselkedés.

<!-- acceptance-checklist -->
- [x] A1: AMIKOR a Render-beállítás megegyezik a repó feltevéseivel, a szkript 0-val lép ki; HA bármelyik mező eltér,
  1-gyel, és mezőnként kiírja az eltérést; HA nincs kulcs vagy az API nem érhető el, 2-vel.
  Mérés: `node --test scripts/qa/verify-render-settings.test.mjs` → `# fail 0`.
- [x] A2: AMIKOR a 2026-11-05-i éles beállítás (Render MCP-válasz) az összevetés bemenete, pontosan a build-parancs
  eltérése jelenik meg. Mérés: a teszt „mai éles állapot” esete.
- [x] A3: AMIKOR a CI fut és a `RENDER_API_KEY` titok be van állítva, a „Render-beállítás” job futtatja a szkriptet;
  titok nélkül a lépés kihagyva. Mérés: `grep -c "verify-render-settings.mjs" .github/workflows/ci.yml` → `1`.
- [x] A4: a `VERCEL_RENDER_TELEPITES.md` „Élesítés ellenőrzése” része leírja a szkriptet és a titkot.
  Mérés: `grep -c "verify-render-settings" VERCEL_RENDER_TELEPITES.md` → `1`.
