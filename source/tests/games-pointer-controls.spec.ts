import { expect, test, type Page } from "@playwright/test";

/**
 * C2 — egér/trackpad: D-pad elrejtve, vászon kapja a helyet;
 * touch: D-pad látható és ≥44 px.
 *
 * A coarse/fine döntést a `useCoarsePointer` matchMedia-ja vezérli —
 * ezt InitScripttel mockoljuk (devices nested use Playwrightban tilos).
 */

test.use({ serviceWorkers: "block" });

async function mockPointer(page: Page, coarse: boolean) {
  await page.addInitScript((isCoarse) => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query === "(hover: none)" || query === "(pointer: coarse)") {
        return {
          matches: isCoarse,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return orig(query);
    }) as typeof window.matchMedia;
  }, coarse);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
    localStorage.setItem("websuli.spaceQuiz.grade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") {
      data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    }
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p.includes("leaderboard") || p.includes("/api/game/score")) data = { ok: true };
    await route.fulfill({ json: data });
  });
});

test("fine pointer: BlockCraft D-pad elrejtve, vászon ≥60%", async ({ page }) => {
  await mockPointer(page, false);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/games/block-craft-quiz");
  await page.getByTestId("bc-start").click();
  await expect(page.getByTestId("bc-touch-controls")).toHaveCount(0);
  await expect(page.getByTestId("bc-keyboard-hint")).toBeVisible();
  const ratio = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLElement)) return 0;
    return canvas.getBoundingClientRect().height / window.innerHeight;
  });
  expect(ratio).toBeGreaterThanOrEqual(0.6);
});

test("fine pointer: Aszteroida joystick elrejtve, vászon ≥60%", async ({ page }) => {
  await mockPointer(page, false);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/games/space-asteroid-quiz");
  await page.getByTestId("sa-start").click();
  await expect(page.getByTestId("sa-touch-controls")).toHaveCount(0);
  await expect(page.getByTestId("sa-keyboard-hint")).toBeVisible({ timeout: 15_000 });
  const ratio = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLElement)) return 0;
    return canvas.getBoundingClientRect().height / window.innerHeight;
  });
  expect(ratio).toBeGreaterThanOrEqual(0.6);
});

test("coarse pointer: BlockCraft D-pad ≥44 px", async ({ page }) => {
  await mockPointer(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games/block-craft-quiz");
  await page.getByTestId("bc-start").click();
  const pad = page.getByTestId("bc-touch-controls");
  await expect(pad).toBeVisible({ timeout: 15_000 });
  const btn = pad.getByRole("button").first();
  const box = await btn.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("coarse pointer: Aszteroida joystick ≥44 px", async ({ page }) => {
  await mockPointer(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games/space-asteroid-quiz");
  await page.getByTestId("sa-start").click();
  const pad = page.getByTestId("sa-touch-controls");
  await expect(pad).toBeVisible({ timeout: 15_000 });
  const box = await pad.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
});
