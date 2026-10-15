# Végrehajtási utasítás — Node 24.x rögzítése

Terv: `docs/specs/2026-10-15-node-24-rogzites.md`. Ág: `fix/node-24`.
1. `source/package.json` és `source/package-lock.json` (gyökér `packages[""]`): `"engines": { "node": "24.x" }`.
2. `render.yaml`: `NODE_VERSION` → `24` (a blueprint igazodjon; az élő szolgáltatást a package.json vezérli).
3. `.github/workflows/ci.yml`: mind a négy `node-version: '22'` → `'24'`.
4. Ellenőrzés: helyben Node 24.18-on `check`, `lint`, `check:test`, `build`, `npm test`; a CI Node 24-en; a deploy után a Render-napló Node-verziója
   és a health; a `canvas.node` figyelmeztetés hiánya.
