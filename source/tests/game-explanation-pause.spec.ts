import { expect, test } from "@playwright/test";

/**
 * A1 — Szólétra: a magyarázó kártya alatt a kérdés NEM cserélődhet.
 */

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") {
      data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    }
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p.includes("leaderboard") || p.includes("/api/games/score")) data = { ok: true };
    await route.fulfill({ json: data });
  });
});

test("Szólétra: magyarázó kártya alatt a kérdés változatlan marad", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games/word-ladder-hu-en");
  await page.getByTestId("wl-start").click();
  await expect(page.getByTestId("wl-prompt")).toBeVisible();

  const promptBefore = (await page.getByTestId("wl-prompt").innerText()).trim();
  const options = page.locator('[data-testid^="wl-option-"]');
  await expect(options.first()).toBeEnabled();

  // Addig próbálunk opciókat, amíg megjelenik a magyarázó kártya (rossz válasz).
  let opened = false;
  for (let round = 0; round < 8 && !opened; round += 1) {
    const count = await options.count();
    for (let i = 0; i < count; i += 1) {
      if (await page.getByTestId("quiz-feedback").count()) {
        opened = true;
        break;
      }
      if (!(await options.nth(i).isEnabled())) continue;
      await options.nth(i).click();
      if (await page.getByTestId("quiz-feedback").count()) {
        opened = true;
        break;
      }
      // Helyes válasz: várjuk a következő kérdést, majd új kör.
      await expect(page.getByTestId("wl-prompt")).not.toHaveText(promptBefore, { timeout: 4000 }).catch(() => undefined);
      break;
    }
  }
  expect(opened, "nem jött elő magyarázó kártya rossz válaszra").toBeTruthy();

  const frozenPrompt = (await page.getByTestId("wl-prompt").innerText()).trim();
  await page.waitForTimeout(3200);
  expect((await page.getByTestId("wl-prompt").innerText()).trim()).toBe(frozenPrompt);

  await page.getByTestId("quiz-feedback-dismiss").click();
  await expect
    .poll(async () => (await page.getByTestId("wl-prompt").innerText()).trim(), { timeout: 5000 })
    .not.toBe(frozenPrompt);
});
