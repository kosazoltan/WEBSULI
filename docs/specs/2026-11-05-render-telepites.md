# A Render-telepítés pontos leírása és az éles revízió ellenőrzése (2026-11-05)

## Mért tények (Render MCP / API, 2026-11-05)

- `websuli-api-eu` (`srv-d6h9oq9drdic73cied30`): `autoDeploy: yes`, `autoDeployTrigger: commit`, `branch: main`,
  `rootDir: source`, `buildFilter.ignoredPaths: docs/**, **/*.md, source/tests/**, .github/**`.
- Deploy-előzmény: #395 (11:23) és #396 (12:06) települt (`trigger: new_commit`); a #397–#400 (teszt, `scripts/qa`, CI,
  dokumentáció) nem — egyezik a szabállyal. Éles `/api/health`: `revision 9aea145` (#396).
- A felületen beállított build-parancs: `npm install … && (npm run db:migrate || echo MIGRATE_SKIPPED) && npm run build` —
  eltér a `render.yaml`-tól; a migráció hibája nem állítja meg a telepítést. A #396 buildjében a migráció lefutott
  („Database is up to date (39 migration(s) already applied)”).
- A `VERCEL_RENDER_TELEPITES.md` állítása („minden `main` push-ra deployol”) pontatlan volt.

## Cél / nem-cél

- Cél: a leírás a mért működést rögzíti; `scripts/qa/verify-render-revision.mjs` megmondja, hogy az éles backend a várt
  commitot futtatja-e; a szkript tiszta részét a CI QA-lépése teszteli.
- Nem-cél: a Render-beállítás (build-parancs, szűrő) és a `render.yaml` módosítása — tulajdonosi döntés.

## Edge case-ek

- Shallow checkout: a `git log -1 -- <pathspec>` a meglévő előzményen dolgozik; a CI-teszt csak a pathspec érvényességét
  és a döntőfüggvényt ellenőrzi, élő hálózatot nem.
- A szűrő vagy a gyökérmappa változása: a szkript állandóit frissíteni kell (a leírás rögzíti).

<!-- acceptance-checklist -->
- [x] A1: `VERCEL_RENDER_TELEPITES.md` CI/CD szakasza a mért Render-beállítást és következményeit írja le.
- [x] A2: `node --test scripts/qa/verify-render-revision.test.mjs` PASS; a CI QA-lépése futtatja.
- [x] A3: a szkript a mai `main`-re `9aea145`-öt vár — egyezik az éles revízióval (Render API + `/api/health`).
