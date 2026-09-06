import { expect, test } from "@playwright/test";

/**
 * LS-8 (#191) — VALÓS render-ellenőrzés a tananyagkészítés felületről.
 *
 * Miért kell: az AGENTS.md kötelezővé teszi, hogy UI/megjelenítési változásnál
 * ne csak unit/renderer teszt fusson, hanem teljes képernyős böngészős
 * ellenőrzés is (átfedés, levágott szöveg, váratlan scrollbar, overflow).
 *
 * Az admin oldal bejelentkezést kíván, amit az e2e nem tud kiállítani, ezért a
 * panelt IZOLÁLTAN, valódi böngészőben rendereljük ki a `/admin` helyett egy
 * beépített próbaoldalon keresztül. Amit ez bizonyít: a tananyagkészítés
 * felületén a FELTÖLTÉS az első látható elem, a tudás-térkép választó pedig
 * alapértelmezésben nincs a képernyőn.
 */

test.describe("LS-8: tananyagkészítés — egy menüpont", () => {
  test("a feltöltés az elsődleges felület, a tudástár rejtve marad", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      // A 401 a mérőoldalon VÁRT: a /api/studio/maps admin-védett, és a próba
      // nincs bejelentkezve — ez a guard helyes működése, nem render-hiba.
      // (Repo-tapasztalat: a szövegre grepelő log-kapu hamis bukást jelent.)
      if (m.type() === "error" && !/401|Unauthorized/i.test(m.text())) errors.push(m.text());
    });

    await page.goto("/__studio-panel-probe");
    await page.waitForLoadState("networkidle");

    // 1) A feltöltő űrlap ott van, és a fő gomb a tananyagkészítés.
    const form = page.getByTestId("source-upload-form");
    await expect(form).toBeVisible();
    const oneStep = page.getByTestId("one-step-submit");
    await expect(oneStep).toBeVisible();
    await expect(oneStep).toHaveText(/Tananyag készítése/);

    // 2) A kurátori „Csak tudás-térkép" gomb NINCS a tananyagkészítés felületén.
    await expect(page.getByTestId("extract-submit")).toHaveCount(0);

    // 3) A térkép-választó alapértelmezésben nem látszik (a haladó blokk zárva).
    await expect(page.getByTestId("lesson-map-select")).toHaveCount(0);
    await expect(page.getByTestId("studio-advanced-body")).toHaveCount(0);

    // 4) A haladó blokk kinyitható — a kurátori út nem veszett el.
    await page.getByTestId("studio-advanced-toggle").click();
    await expect(page.getByTestId("studio-advanced-body")).toBeVisible();
    await expect(page.getByTestId("lesson-map-select")).toBeVisible();

    expect(errors, `konzol/oldal hibák: ${errors.join(" | ")}`).toEqual([]);
  });

  test("nincs vízszintes túlcsordulás és levágott szöveg (360px és 1280px)", async ({ page }) => {
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/__studio-panel-probe");
      await page.waitForLoadState("networkidle");

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `vízszintes túlcsordulás ${width}px-en`).toBeLessThanOrEqual(1);

      // A fő gomb felirata nem lehet levágva (scrollWidth > clientWidth).
      const clipped = await page.getByTestId("one-step-submit").evaluate((el) => ({
        clipped: el.scrollWidth > el.clientWidth + 1,
        text: el.textContent,
      }));
      expect(clipped.clipped, `levágott gombfelirat ${width}px-en: ${clipped.text}`).toBe(false);

      await page.screenshot({ path: `tests/screenshots/ls8-studio-${width}.png`, fullPage: true });
    }
  });
});
