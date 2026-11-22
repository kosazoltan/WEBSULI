# Spec: a böngészős tesztek a Playwrighthoz rögzített Chromiumon futnak

> Dátum: 2026-11-22 · Szerző: Claude (orkesztrátor) · Állapot: JÓVÁHAGYVA (tulajdonosi döntés űrlapon, 2026-11-22: „Csomagolt Chromium (Javasolt)”)
> Végrehajtás: `docs/specs/2026-11-22-playwright-csomagolt-chromium-vegrehajtas.md`

## 1. Cél

A Playwright-konfigurációk eddig a gépre telepített Google Chrome-ot használták (`channel: "chrome"`). Az új fejlesztői gépen a stabil Chrome
158 a projektben rögzített Playwright 1.57-tel egy sandboxolt iframe-nél (`sandbox="allow-scripts"` + `srcdoc`) mindig összeomlik
(`exitCode=2147483651`), a Playwright saját Chromiumán (`chromium-1200`) ugyanez hibátlan. Emiatt a PR előtti kapu böngészős köre
helyben blokkolt (a `preview-navigation.spec.ts` „opaque sandbox storage fallback” tesztje a főág kódjával is bukik). A cél: minden
böngészős teszt a Playwright verziójához rögzített Chromiumon fusson, így a gép Chrome-frissítése többé ne törhesse el a kapukat.

## 2. NEM cél

- A Playwright verziójának emelése.
- A tesztek tartalmának módosítása.
- A kézi teljesítménymérő szkript (`source/scripts/perf/measure-game-frames.mjs`) — szándékosan a valódi, fejes Chrome-ot méri.

## 3. Érintett területek

- `source/playwright*.config.ts` (minden konfiguráció, amely `channel: "chrome"`-ot állít).
- `source/tests/playwright-bundled-chromium-guard.test.ts` (új őr-teszt).
- A CI (`.github/workflows/ci.yml`) már telepíti a csomagolt Chromiumot (`npx playwright install --with-deps chromium`), ezért nem változik.

## 4. Rögzített döntések

- A böngésző forrása a Playwrighthoz rögzített Chromium (`devices["Desktop Chrome"]` marad a viewport / UA miatt, a `channel` kikerül).
- Fejlesztői gépen egyszeri lépés: `npx.cmd playwright install chromium` a `source`-ban (a `npm ci` nem tölti le).

## 5. Edge case-ek

- Gép, amelyen nincs letöltve a csomagolt Chromium: a Playwright egyértelmű hibát ad a telepítési paranccsal.
- Konfiguráció, amely más `channel`-t állítana: az őr-teszt bukik.

## 6. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->
- WHEN a `source/playwright*.config.ts` fájlok bármelyike `channel: "chrome"`-ot tartalmaz THEN the guard test SHALL fail.
- WHEN a `preview-navigation.spec.ts` „opaque sandbox storage fallback” tesztje ezen a gépen fut THEN it SHALL pass.
- WHEN a CI lefut THEN the Playwright E2E parts SHALL pass (a csomagolt Chromiummal).

## 7. Tesztterv

- Az új őr-teszt (`npx tsx --test tests/playwright-bundled-chromium-guard.test.ts`): a módosítás előtt bukik, utána zöld.
- `npm.cmd run test:e2e -- tests/preview-navigation.spec.ts`: előtte a 243. sor tesztje bukik, utána zöld.

## 8. Kockázat / visszavonás

- A Chromium és a Chrome renderelése kis mértékben eltérhet (képernyőkép-alapú mérők). Visszavonás: a commit revertje.
