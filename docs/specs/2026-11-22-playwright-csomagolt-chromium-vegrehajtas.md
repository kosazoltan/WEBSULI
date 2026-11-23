# Végrehajtási utasítás: a böngészős tesztek a Playwrighthoz rögzített Chromiumon

> Terv: `docs/specs/2026-11-22-playwright-csomagolt-chromium.md`

1. Bukó őr-teszt: `source/tests/playwright-bundled-chromium-guard.test.ts` — beolvassa a `source/playwright*.config.ts` fájlokat, és
   egyikben sem engedi a `channel` beállítást (`channel:` + `"chrome"` / `'chrome'`). Futtatás: `cd source && npx.cmd tsx --test tests/playwright-bundled-chromium-guard.test.ts` → a módosítás előtt `fail 1`.
2. Minden `source/playwright*.config.ts`-ből a `channel: "chrome"` / `channel: 'chrome'` kivétele (a `devices["Desktop Chrome"]` marad).
   A `playwright.config.ts` megjegyzése a csomagolt Chromiumot írja le.
3. Ugyanaz a parancs → `fail 0`.
4. `npm.cmd run test:e2e -- tests/preview-navigation.spec.ts` → minden teszt `passed` (előtte a 243. sor tesztje bukott, „Target page … closed”).
5. `npm run gate:stage` (a munkafa gyökeréből) → zöld.
6. Csapda-bejegyzés: `docs/agent-csapdak.md` (gépváltás: a stabil Chrome frissülése elválik a rögzített Playwrighttól).
