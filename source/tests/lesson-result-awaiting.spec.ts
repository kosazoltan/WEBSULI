import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * U4d (E7, docs/specs/2026-11-24-osszevont-eredmenylevel.md): ha a szerver az összevont levélhez a másik részre vár (`awaiting`), a
 * lecke tetején és a kész rész alatt figyelmeztetés jelenik meg; a hiányzó rész beküldése után eltűnik.
 */
test.use({ serviceWorkers: "block" });

async function mock(page: Page) {
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/lessons/lesson-w/results" && req.method() === "POST") {
      const kind = (req.postDataJSON() as { kind: string }).kind;
      return route.fulfill({ status: 202, json: kind === "tasks" ? { queued: false, awaiting: "quiz" } : { queued: true, combined: true } });
    }
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/wait-fixture") return route.fulfill({ json: { id: "wait-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/wait-fixture") return route.fulfill({ json: { lessonId: "lesson-w", version: 1, lesson: fusionFixture() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
}

test("E7: a feladatok után a kvízre váró figyelmeztetés látszik (tetején és a rész alatt), a kvíz után eltűnik", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/wait-fixture");
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  await page.locator("[data-task-id]").first().locator("textarea").fill("Az alap és a magasság szorzatának a fele.");
  await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
  await page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();
  const notice = page.getByTestId("result-awaiting");
  await expect(notice.first()).toBeVisible();
  await expect(notice).toHaveCount(2);
  await expect(notice.first()).toContainText("kvíz");
  await notice.first().getByRole("button").click();
  await expect(page.getByRole("tab", { name: "Kvíz", exact: true })).toHaveAttribute("aria-selected", "true");
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  for (let i = 0; i < 25; i++) await quiz.nth(i).getByRole("button").first().click();
  await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
  await expect(notice).toHaveCount(0);
});
