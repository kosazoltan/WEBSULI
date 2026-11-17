# Végrehajtási utasítás — E2E-ingadozók, 3. kör (kanban #76, #31)

**Állapot:** folyamatban – 2026-11-17, ág `fix/e2e-ingadozok-3`
**Terv:** `docs/specs/2026-11-17-e2e-ingadozok-3.md`

## Fájlok

- `source/tests/lesson-result-email.spec.ts` (1)
- `source/tests/duel-online.spec.ts` (2)
- `source/tests/game-win-paths.spec.ts` (3)
- `source/tests/joystick-response.spec.ts` (4)
- `source/tests/speed-math-play.spec.ts` (5)
- `docs/specs/2026-11-17-e2e-ingadozok-3*.md`

Termékkódhoz csak akkor nyúlunk, ha a gyökérok termékhiba ÉS a fájl nincs a párhuzamos PR-ok listáján (terv „Nem cél”).

## Reprodukció (közös)

A CI útja: buildelt szerver (`npm run build:e2e`, egyszer; utána a szerver `node dist/index.js`), eldobható Postgres
(`scripts/run-e2e-tests.ts`), 1 worker, `retries: 0`, Chrome `--disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader`
(szoftveres WebGL), saját port 5231. Ehhez egy IDEIGLENES, gitignore-olt konfiguráció (`source/playwright.repro.tmp.config.ts`) és
egy IDEIGLENES CPU-lassító segéd (`source/tests/support/cpu-throttle.tmp.ts`: `REPRO_CPU` → CDP `Emulation.setCPUThrottlingRate`
minden lapra, a `browser.newContext()`-tel nyitott kontextusokra is) szolgál; a spec tetejére ideiglenesen
`import "./support/cpu-throttle.tmp";` kerül. Egyik sem kerül commitba (a `*.tmp.ts` minta a `.gitignore`-ban; a spec-sor
commit előtt eltávolítva, `git diff` ellenőrzi).

```powershell
cd source
$env:REPRO_CPU='6'; node --import tsx scripts/run-e2e-tests.ts --config playwright.repro.tmp.config.ts tests/<spec> --grep=<minta> --repeat-each=20
```

(PowerShellben a `-g <minta>` két tokenje egy szkript-paraméterként elveszett — „No tests found”; a `--grep=<minta>` egy token.)

## Lépések

1. **lesson-result-email** — a reload előtt `expect.poll` egyetlen `page.evaluate`-tel: a tárolóban mindkét `…:<kind>:sent:round-…`
   jelző megvan. Célzott kísérlet: a `/results` válasz 400 ms-os késleltetése (ideiglenes `REPRO_DELAY`) — előtte a hiba
   determinisztikus, utána nem.
2. **duel-online „EGYSZERRE”** — a CI-trace szerint (lásd Mérés) a két `tap()` közül az egyik a `duel-rematch` gombra várt, amely a
   másik fél kérésének megérkezésekor lecserélődött. A két kattintás egy-egy azonnali `page.evaluate`-tel (a gomb meglétének
   visszaadásával) — így a „egyik kliens sem látja még a másik kérését” előfeltétel ellenőrzött, nem versenyhelyzet.
3. **game-win-paths** — a mérés előtt `waitForStable(page, <eredmény-szelektor>)` (`tests/support/game-mobile-quality.ts`): a
   belépő animáció végére vár (C-33: végállapotú elem).
4. **joystick-response renderszámláló** — gyökérok és javítás a Mérés szerint.
5. **speed-math-play menetvégi hurok** — gyökérok és javítás a Mérés szerint.
6. Kapuk: `git diff --check`, `npx.cmd eslint <változott fájlok> --max-warnings 0`, `npm run check`, `npm run check:test`, az
   érintett specek ismételt futtatása; push előtt teljes kapu (lint, check, check:test, `npm test`,
   `node scripts/qa/three-phase-check.mjs --base origin/main`).
7. A joystick-spec a #484 ágán (`origin/feat/jatek-j3a-kockavadasz-runabanya`, leválasztott munkafa, csak futtatás) is.

## Mérés

(tesztenként: tünet · reprodukció · előtte · gyökérok · javítás · utána · ellenpróba — a futások után kitöltve)
