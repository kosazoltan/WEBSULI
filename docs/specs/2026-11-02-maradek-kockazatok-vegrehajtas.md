# Végrehajtás — maradó kockázatok (terv: `docs/specs/2026-11-02-maradek-kockazatok.md`)

Munkakönyvtár: `source/` (a CI-fájl a repó gyökerében).

## T1 — `tests/learning-flow.browser.ts` borító-ellenőrzés
- A `await expect(page.locator(".lesson-cover-art")).toBeVisible();` helyett: `await page.locator(".lesson-hero h1").waitFor();`, majd
  `.lesson-hero .ws-art` jelenléténél `.lesson-hero .ws-art > img` látható, különben `.lesson-hero .lesson-cover-art` látható.
- Ellenőrzés: `npx playwright test --config playwright.learning-flow.config.ts tests/learning-flow.browser.ts` → az 1–5. teszt `ok`.

## T2 — `tests/learning-flow.browser.ts` kvízkattintás
- Import: `balancedLayouts, choiceSeed` a `../shared/option-order`-ből; a kör a `[data-quiz-id]` azonosítókból és a `fusionFixture()`
  bankjából; `correctAt(n)` = a helyes opció megjelenített helye; az utolsó és az első kérdésnél erre kattint.
- Ellenőrzés: ugyanaz a parancs → `10 passed`.

## T3 — `.github/workflows/ci.yml`
- Az E2E jobban a service-worker lépés után két lépés: `npx playwright test --config playwright.learning-flow.config.ts` és
  `npx playwright test --config playwright.lesson-practice.config.ts`.
- Ellenőrzés: helyben mindkét parancs zöld (23 passed / 8 passed); a PR CI „Playwright E2E” jobja zöld.

## T4 — 2. és 3. kockázat
- Kód nem változik; a záró jelentés NOT DONE + ok jelöléssel nevezi meg, és a tulajdonostól kér döntést / admin-munkamenetet.
