import { devices, expect, test, type Page } from "@playwright/test";

import { emulateSafeArea } from "./support/game-mobile-quality";
import { expectMetaScreenOk, insetsFor, metaShot } from "./support/game-meta-quality";

test.use({ serviceWorkers: "block" });

/**
 * A játékok meta-képernyőinek (garázs, pályaválasztó, beállítás, ranglista, statisztika) mobil mérése érintős Pixel 7
 * profilban (docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md, „Mérő”; X1–X7: `support/game-meta-quality.ts`).
 * Első eset a Vihargarázs (tulajdonosi hibajelentés 2026-11-16, Android, álló nézet): a 412×800-as nézet a valódi
 * telefon címsorral / rendszersávokkal csökkentett magassága.
 */
test.use({ ...devices["Pixel 7"] });

const META_VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 412, height: 800 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
  { width: 915, height: 412 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

const TORNADO = "/games/tornado-hunter-200";

async function openTornadoMenu(page: Page): Promise<void> {
  await page.goto(TORNADO);
  await expect(page.getByTestId("tornado-quick-start")).toBeVisible({ timeout: 20_000 });
}

/** A menü „Beállítások” részében lévő gombhoz előbb a lenyílót kell kinyitni (StartScreen `<details>`). */
async function openMenuSettings(page: Page): Promise<void> {
  const summary = page.locator("details.game-start-settings > summary");
  if ((await page.locator("details.game-start-settings[open]").count()) === 0) await summary.tap();
}

test.describe("Vihargarázs", () => {
  for (const viewport of META_VIEWPORTS) {
    test(`${viewport.width}x${viewport.height}: X1–X7, érintéses végigjárás (szűrő → jármű → fejlesztés → vissza)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const insets = insetsFor(viewport);
      await openTornadoMenu(page);
      await page.getByRole("button", { name: "Vihargarázs" }).tap();
      await expect(page.getByRole("heading", { name: "Vihargarázs" })).toBeVisible();
      await emulateSafeArea(page, insets);
      await metaShot(page, "tornado-garazs");
      await metaShot(page, "tornado-garazs-teljes", true);
      await expectMetaScreenOk(page, "Vihargarázs nyitva", { insets });

      // Szűrő → egy másik (meg nem vett) jármű → vissza a sajátra → fejlesztés megvétele.
      await page.getByRole("button", { name: /^Felderítő/ }).tap();
      await expect(page.getByTestId("tornado-garage-filter-scout")).toHaveAttribute("aria-pressed", "true");
      const tiles = page.locator('[data-testid^="tornado-garage-vehicle-"]');
      await tiles.nth(1).tap();
      await expect(tiles.nth(1)).toHaveAttribute("aria-pressed", "true");
      await expectMetaScreenOk(page, "Vihargarázs, Felderítő szűrő, idegen jármű", { insets });
      await tiles.nth(0).tap();
      await expect(page.getByTestId("tornado-garage-upgrade-engine")).toBeVisible();
      await expect(page.getByTestId("tornado-garage-upgrade-engine")).toContainText("900 SC");
      await page.getByTestId("tornado-garage-upgrade-engine").tap();
      await expect(page.getByTestId("tornado-coins")).toContainText("300 SC");
      await expect(page.getByTestId("tornado-garage-upgrade-engine")).toHaveAttribute("data-level", "1");
      // 300 SC-ből a Motor 2. szintje (1710 SC) nem fér bele: ez a soron is látszik.
      await expect(page.getByTestId("tornado-garage-upgrade-engine")).toHaveAttribute("data-affordable", "false");
      await metaShot(page, "tornado-garazs-fejlesztve");
      await expectMetaScreenOk(page, "Vihargarázs fejlesztés után", { insets });

      await page.getByRole("button", { name: "Vissza" }).first().tap();
      await expect(page.getByTestId("tornado-quick-start")).toBeVisible();
    });
  }
});

test.describe("Viharvadász további meta-képernyői", () => {
  for (const viewport of [META_VIEWPORTS[0], META_VIEWPORTS[3], META_VIEWPORTS[4]]) {
    for (const s of [
      { name: "Szintek", open: async (page: Page) => page.getByRole("button", { name: /Vadászat indítása/ }).tap(), heading: /Szintek/ },
      { name: "Rekordok", open: async (page: Page) => { await openMenuSettings(page); await page.getByRole("button", { name: "Rekordok" }).tap(); }, heading: /Rekord/ },
      { name: "Statisztika", open: async (page: Page) => { await openMenuSettings(page); await page.getByRole("button", { name: "Statisztika" }).tap(); }, heading: /Statisztika/ },
      { name: "Beállítások", open: async (page: Page) => { await openMenuSettings(page); await page.getByRole("button", { name: /Iskolai szint/ }).tap(); }, heading: /Beállítás/ },
    ]) {
      test(`${s.name} ${viewport.width}x${viewport.height}: X1–X7`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const insets = insetsFor(viewport);
        await openTornadoMenu(page);
        await s.open(page);
        await expect(page.getByRole("heading", { name: s.heading }).first()).toBeVisible();
        await emulateSafeArea(page, insets);
        await metaShot(page, `tornado-${s.name.toLowerCase()}`);
        await expectMetaScreenOk(page, `Viharvadász ${s.name}`, { insets });
      });
    }
  }
});
