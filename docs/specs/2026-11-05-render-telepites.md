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
- [x] A1: AMIKOR valaki a `VERCEL_RENDER_TELEPITES.md`-ből tájékozódik, a CI/CD szakasz a Render API-ból mért szabályt
  (`main`, `rootDir: source`, `buildFilter.ignoredPaths`) és következményeit írja le.
  Mérés: `grep -c "build-szűrő kizárt útvonalain" VERCEL_RENDER_TELEPITES.md` → `1`.
- [x] A2: AMIKOR a CI fut, a `verify-render-revision` tesztjei lefutnak.
  Mérés: `node --test scripts/qa/verify-render-revision.test.mjs` → `# fail 0`; `.github/workflows/ci.yml` QA-lépése tartalmazza.
- [x] A3: AMIKOR a `main` utolsó telepítést indító commitja élesben fut, a szkript 0-val lép ki; HA eltér, 1-gyel; HA
  nem ellenőrizhető (hálózat, sekély klón, közbeeső commit), 2-vel. Mérés: a mai `main`-re a várt revízió `9aea145`
  (`git log -1 --first-parent … -- <pathspec>`), egyezik a Render API élő deployjával.
