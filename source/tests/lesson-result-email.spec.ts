import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md) — valódi render, vendég tanuló:
 * a feladatok és a helyi kvíz kiértékelése után PONTOSAN EGY beküldés megy (a helyes alakkal, pontszám nélkül);
 * újratöltés után sem megy újra. Felület nincs hozzá („motorháztető alatt”).
 */
test.use({ serviceWorkers: "block" });

async function mock(page: Page) {
  const posts: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/lessons/lesson-r/results" && req.method() === "POST") { posts.push(req.postDataJSON()); return route.fulfill({ status: 202, json: { queued: true } }); }
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/res-fixture") return route.fulfill({ json: { id: "res-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/res-fixture") return route.fulfill({ json: { lessonId: "lesson-r", version: 1, lesson: fusionFixture() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  return posts;
}

test("a feladatok és a helyi kvíz kiértékelése után egy-egy beküldés megy; újratöltés után nem ismétlődik", async ({ page }) => {
  const posts = await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/res-fixture");
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  const first = page.locator("[data-task-id]").first();
  await first.locator("textarea").fill("Az alap és a magasság szorzatának a fele.");
  await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
  await page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();
  await expect.poll(() => posts.filter(p => p.kind === "tasks").length).toBe(1);
  const tasks = posts.find(p => p.kind === "tasks")!;
  // B8 (dokumentált spec-változás, docs/specs/2026-11-25-eredmeny-email-b8.md 1. pont): az új kör azonosítója r2-<128 bit>.
  expect(tasks.roundId).toMatch(/^r2-[0-9a-f]{32}$/);
  expect(Object.keys(tasks.answers as object)).toHaveLength(15);
  expect(tasks).not.toHaveProperty("score");

  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  for (let i = 0; i < 25; i++) await quiz.nth(i).getByRole("button").first().click();
  await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
  await expect.poll(() => posts.filter(p => p.kind === "quiz").length).toBe(1);
  expect(Object.keys(posts.find(p => p.kind === "quiz")!.picks as object)).toHaveLength(25);

  // Kanban #31 (e2e-ingadozók 3. kör): a „már elküldve” jelzőt a kliens a 202-es válasz FELDOLGOZÁSA után írja
  // (`resultReport.ts`); a fenti poll a kérés elfogásakor teljesül. Ha az újratöltés a válasz feldolgozása elé esik, a kör
  // jogosan újra beküldődik (élesben a szerver egyedi kulcsa véd) — ez nem a vizsgált eset. Ezért az újratöltés előtt
  // megvárjuk a valódi állapotot: mindkét kör jelzője a tárolóban van (egy atomi lap-hívás, C-64).
  await expect
    .poll(() => page.evaluate(() => Object.keys(localStorage).filter(k => /:(tasks|quiz):sent:round-/.test(k)).length))
    .toBe(2);

  await page.reload();
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await page.waitForTimeout(1500);
  expect(posts.length, "újratöltés után nincs újabb beküldés").toBe(2);
});
