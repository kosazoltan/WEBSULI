# Végrehajtási utasítás: A Websuli makija a főoldalon

**Terv:** `docs/specs/2026-11-18-kabala-fooldal.md` (minden döntés és keret ott van; ez a fájl a lépéseket adja).
**Állapot:** megkezdve 2026-11-18 — ág: `feat/kabala-fooldal`, munkafa: `.claude/worktrees/kabala-fooldal`.

Szabályok: push / PR nincs; `--no-verify`, rebase tilos; tesztet gyengíteni tilos; új npm-függőség, külső fájl tilos; a
`source/scripts/blender/kabala-maki/*` fájlokhoz és a `kiserlet/kabala-maki` ághoz nem nyúlunk (csak `git merge kiserlet/kabala-maki`).
Parancsok a munkafa gyökeréből, Windows-on `npm.cmd` / `npx.cmd`; a böngészőteszt PowerShellből (C-72).

## T0 — Előkészítés

1. `npm.cmd ci --ignore-scripts` a `source` mappában (kilépési kód külön ellenőrizve).
2. Kiinduló mérés: `npx.cmd vite build` a `source` mappában; a `main-*.js`, `main-*.css` mérete nyersen és gzip-pel (a terv 3.1 táblája).

## T1 — Eszközgyártó (a terv 4.3 szakasza)

Fájlok:

- `source/scripts/blender/kabala-fooldal/home_frames.py` — Blender-szkript. Importálja a `../kabala-maki/maki_model.py`-t és
  `maki_anim.py`-t (a `KABALA_MAKI_DIR` környezeti változó felülírhatja a helyet). Rögzített kamera; átlátszó film; PNG RGBA.
  A gyári klipeket (`idle`, `wave`, `cheer`) a `maki_anim.build_actions` akcióiból mintavételezi (`scene.frame_set`), a pózt
  csontonként rögzíti, majd az animációs adatot törli, és a rögzített pózokból renderel. A `cheer` csípő-emelkedését (világ-Z > 0)
  levágja, az értéket méterben a `frames.json` `lift` listájába írja. Saját pózok: `blink` (alakkulcs 0,55 / 1 / 0,55),
  `point-in` (3), `point` (4, ismétlődik), `hop` (5). Kimenet: `<out>/<klip>-<nn>.png`, `<out>/frames.json`
  (`size`, `pxPerMeter`, `clips[{name, frames[], fps, loop, lift[]}]`).
- `source/scripts/blender/kabala-fooldal/build.mjs` — Node-szkript: Blender indítása (`BLENDER_BIN` vagy `blender`), ideiglenes
  mappa (`os.tmpdir()`), közös kivágás (alfa > 8, 3 px ráhagyás), cella = `CELL_H` (200) magas, páros szélesség, 8 oszlop;
  `sharp` WebP (`quality 72`, `alphaQuality 90`, `effort 6`); álló kép = az `idle` első képkockája 2× telefonos méretben;
  fájlnév = `kabala-fooldal.<sha256 első 8>.webp`, `kabala-fooldal-allo.<…>.webp` a `source/client/public/mascot/` alatt (a régi
  hash-ű fájlok törlése); manifest: `source/client/src/mascot/home-mascot.manifest.json` (időbélyeg nélkül, sorvég `\n`).
  Kapcsolók: `--keep-frames <mappa>` (a PNG-k megtartása ellenőrzéshez), `--frames <mappa>` (meglévő képkockákból, Blender nélkül).

Parancs: `node source/scripts/blender/kabala-fooldal/build.mjs` → elvárt utolsó sor: `KABALA-FOOLDAL-BUILD {…"bytes":…}`; a képek
összesen ≤ 300 KB.

Ellenőrzés: egy sötét hátterű áttekintő kép a képkockákról (`--contact <fájl>`), megnézve (Read).

## T2 — Tiszta logika és kapcsoló

- `source/server/lib/home-flags.ts`: `homeMascotOn(env)`, `HOME_MASCOT_META`, `withHomeMascotFlag(html)` (a `</head>` elé szúr, egyszer).
- `source/server/vite.ts`: éles ág — bekapcsolva az `index.html` szövege egyszer beolvasva és megjelölve; `GET /` és `/index.html` az
  `express.static` ELŐTT, valamint az SPA-ág ezt adja; kikapcsolva a kód útja változatlan. Fejlesztői ág: a `transformIndexHtml`
  eredményére ugyanez. `/mascot` statikus kiszolgálás `immutable`, 1 év (mint a `/design-thumbs`).
- `source/client/src/lib/home-mascot.ts`: `homeMascotEnabled(doc)`, `mascotPicks(files, grade, now)`, `mascotHref(file)`,
  `MASCOT_PHRASES`, `pickPhrase(group, seed, previous)`, `fillPhrase(text, title)`, `parseMascotPrefs`, `serializeMascotPrefs`,
  `MASCOT_PREFS_KEY`, `nextStep(state, event)` (állapotgép: `enter → present(i) → … → rest`), `MASCOT_BOX_CLASS`.
- Tesztek: `source/tests/home-mascot.test.ts`, `source/tests/home-mascot-flag.test.ts`.

Parancs: `node --import tsx --test tests/home-mascot.test.ts tests/home-mascot-flag.test.ts` (a `source` mappában) → minden zöld.

## T3 — Felület

- `source/client/src/components/HomeMascotSlot.tsx` (a fő darabban): kapcsoló, tananyagszám, beállítások olvasása; rögzített magasságú
  `<section>`; a `client/src/mascot/HomeMascot.tsx` lusta betöltése a lista megjelenése után tétlen időben (`requestIdleCallback`,
  tartalék: `setTimeout`); hibahatár.
- `source/client/src/mascot/HomeMascot.tsx` + `home-mascot.css` + `sprite-player.ts`: buborék, gombok, a figura gombja, a három link,
  élő régió, állapotgép-vezérlés, Web Animations-lejátszó, `visibilitychange` + `IntersectionObserver`, csökkentett mozgás / adatkímélő mód.
- `source/client/src/components/UserFileList.tsx`: a `WelcomeCard` után `<HomeMascotSlot …/>`; a `WelcomeCard` `hidePicks` kelléket kap.
- `source/client/src/components/WelcomeCard.tsx`: `hidePicks?: boolean` — igaz értéknél a hármas lista nem jelenik meg.

Parancsok: `npx.cmd tsc --noEmit`, `npx.cmd eslint client/src server --max-warnings 0` (a `source` mappában) → 0 hiba.

## T4 — Őr- és böngészőtesztek

- `source/tests/home-mascot-assets-guard.test.ts` (K6, K15).
- `source/tests/home-mascot.spec.ts` (K1, K4–K14). A kapcsolót a teszt a dokumentum-válasz átírásával kapcsolja be (a szerver
  `withHomeMascotFlag` függvényével — ugyanaz a sor, amit a szerver adna); az `/api/**` hívások a `welcome-card.spec.ts` mintája
  szerint elfogva.
- Futtatás előtt: `docker ps --filter name=websuli-e2e- --format "{{.Names}} {{.RunningFor}}"` (≥ 2 friss konténernél várakozás,
  legfeljebb 20 perc). Parancs (PowerShell, `source`): `npm.cmd run test:e2e -- tests/home-mascot.spec.ts tests/welcome-card.spec.ts tests/home-views.spec.ts --workers=1`.

## T5 — Bizonyíték és mérés

- Képernyőképek: `docs/measurements/kabala-fooldal/` — 360×640, 390×844, 1366×768; pillanatok: integet, mutat (1., 2., 3. sor),
  ugrik, pihen, csendesítve, bezárva; rövid képsor a szökkenésről. Mindet megnézni (Read), őszinte ítélettel.
- Mérések a `docs/kabala-fooldal.md`-be: eszközméretek, átvitt méret, csomagméret előtte / utána, hálózati kérések száma kikapcsolva /
  bekapcsolva, képkocka/mp és leghosszabb képkocka 4× CPU-lassítással, CLS.
- Mutációs ellenpróbák (a terv 7. szakasza): mindegyik előtt commit; visszaállítás után `git status --short` üres (C-70).

## T6 — Kapuk

`npm.cmd run gate:stage`, majd `npm.cmd run gate:push` a munkafa gyökeréből (a `native-arch.test.ts` helyi bukása ismert kivétel, C-38).
Záró teljességellenőrzés a terv 6. szakaszának táblája szerint, pontonként.
