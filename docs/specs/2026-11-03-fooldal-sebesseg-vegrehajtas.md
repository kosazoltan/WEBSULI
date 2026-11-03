# Végrehajtás: főoldal-gyorsítás (terv: `docs/specs/2026-11-03-fooldal-sebesseg.md`)

Munkakönyvtár: `source/`. Ág: `perf/fooldal-sebesseg`.

## T1: build-idejű bélyegképek

- `scripts/build-design-thumbs.mjs`:
  - exportált tiszta mag: `thumbFileName(id, bytes)` → `` `${id}.${sha256(bytes).slice(0, 8)}.webp` ``;
  - `buildThumbs({ srcDir, outDir })` → `manifest`;
  - CLI: `client/public/design` → `client/public/design-thumbs`;
  - `sharp(bytes).resize(480, 320, { fit: "cover" }).webp({ quality: 70 })`, legfeljebb 4 párhuzamosan;
  - a meglévő azonos nevű fájl kimarad;
  - a régi, manifestben már nem szereplő fájlok törlődnek;
  - hibánál napló, a build megy tovább.
- `package.json` `build`: elé `node scripts/build-design-thumbs.mjs &&`. `.gitignore`: `client/public/design-thumbs/`.
- **Ellenőrzés:** `node scripts/build-design-thumbs.mjs` → 603 fájl + `manifest.json`; másodszorra 0 új.

## T2: szerver

- `server/vite.ts` `serveStatic`: `app.use("/design-thumbs", express.static(path.resolve(distPath, "design-thumbs"), { immutable: true, maxAge: "1y", fallthrough: false }))` a generikus static ELŐTT.
- `server/design-assets.ts`:
  - `loadThumbManifest()`: `dist/public/design-thumbs/manifest.json` (vagy a fejlesztői `client/public/design-thumbs/manifest.json`), egyszer, hiba → `{}`;
  - `thumbUrlFor(id)`: `` manifest[id] ? `/design-thumbs/${manifest[id]}` : `/api/design-assets/${id}/thumb` ``;
  - a futásidejű végpont:
    - `thumbCache: Map<id, { sha, buf }>`; találat → ETag `"<sha>-t480"`, 304 vagy kiszolgálás DB nélkül;
    - hiány → a meglévő út;
    - single-flight: `inflight: Map<id, Promise>`;
    - `sharp`-szemafor: legfeljebb 2.
- `server/storage.ts`: `coverThumb: thumbUrlFor(cover ?? \`hero-${designThemeForClassroom(classroom)}\`)`.
- `server/cache/HtmlFilesCache.ts`:
  - `getOrBuild(build)`: friss → adat;
  - elavult → adat azonnal, plusz háttér-újraépítés, ha még nem fut;
  - nincs adat → a közös építés promise-a;
  - `invalidate()` → adat eldobva + generáció++ (a régi generáció eredménye nem kerül be).
- `server/routes.ts`: a `/api/html-files` a `getOrBuild`-et használja.

## T3: kliens

- `UserFileList.tsx`: `src={file.coverThumb ?? \`/api/design-assets/${coverIdFor(file.cover, classroom)}/thumb\`}`; a típusba `coverThumb?: string`.

## T4: tesztek

- **Új:** `tests/design-thumbs-build.test.ts`, `tests/html-files-cache.test.ts`; `tests/design-thumb.test.ts` bővül.
- **Futtatás:** `npx tsc --noEmit` (app + teszt), `npx eslint client/src server --max-warnings 0`, `npm test`, `npm run build` (helyben).

## T4b: review #385 javításai

- `package.json`: `"build:client": "node scripts/build-design-thumbs.mjs && vite build"`.
- `vercel.json`:
  - rewrite `/design-thumbs/:path*` → `https://websuli-api-eu.onrender.com/design-thumbs/:path*` a `/:path*` catch-all előtt;
  - fejléc `/design-thumbs/(.*)`: `public, max-age=31536000, immutable`.
- `server/design-assets.ts`:
  - a `forgetThumb` a `thumbInflight`-ból is töröl;
  - a generálás csak `thumbInflight.get(id) === job` esetén ír a `thumbById`-be, és a `finally` is csak ekkor töröl.
- **Teszt:**
  - `tests/design-thumb.test.ts`: érvénytelenítés generálás közben → a következő kérés újratölt;
  - `tests/design-thumbs-build.test.ts`: a Vercel-build parancs és a rewrite sorrendje.

## T5: PR → automatikus merge → éles visszamérés

- **Élesben:**
  - `curl -sI https://websuli.vip<coverThumb>` → `Cache-Control: … immutable`;
  - 20 párhuzamos bélyegkép-idő;
  - lista-TTFB;
  - böngészős LCP.
