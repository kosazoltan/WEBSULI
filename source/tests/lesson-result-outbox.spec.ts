import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * B7 (docs/specs/2026-11-25-eredmeny-email-b7.md): a végleges beküldések tartós kimenő sora — valódi render, vendég tanuló. A kapcsoló az
 * e2e-buildben a `window.__websuliResultOutbox` horog.
 */
test.use({ serviceWorkers: "block" });
const PREFIX = "websuli:result-outbox:v1:";

type Posts = Array<Record<string, unknown>>;
async function mock(page: Page, opts: { on: boolean; status: () => number }) {
  const posts: Posts = [];
  await page.addInitScript(on => { if (on) (window as unknown as { __websuliResultOutbox?: boolean }).__websuliResultOutbox = true; }, opts.on);
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/lessons/lesson-q/results" && req.method() === "POST") {
      posts.push(req.postDataJSON() as Record<string, unknown>);
      const status = opts.status();
      return route.fulfill({ status, json: status < 300 ? { queued: true } : { message: "hiba" } });
    }
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/quiz-fixture") return route.fulfill({ json: { id: "quiz-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/quiz-fixture") return route.fulfill({ json: { lessonId: "lesson-q", version: 1, lesson: fusionFixture() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  return posts;
}
async function finishQuiz(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  for (let i = 0; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
}
const outboxKeys = (page: Page) => page.evaluate(p => Object.keys(localStorage).filter(k => k.startsWith(p)), PREFIX);
const finals = (posts: Posts) => posts.filter(b => b.kind === "quiz" && !b.partial);

test("B7: BE kapcsolónál az 5xx-szel bukott végleges beküldés a tárolóban marad, és a következő induláskor — a lecke megnyitása nélkül — elmegy", async ({ page }) => {
  let status = 503;
  const posts = await mock(page, { on: true, status: () => status });
  await finishQuiz(page);
  await expect.poll(() => finals(posts).length).toBeGreaterThanOrEqual(1);
  await expect.poll(() => outboxKeys(page)).toHaveLength(1);
  const before = finals(posts).length;
  status = 202;
  await page.goto("/");
  await expect.poll(() => finals(posts).length, { timeout: 15_000 }).toBe(before + 1);
  const body = finals(posts).at(-1)!;
  expect(Object.keys(body.picks as object)).toHaveLength(25);
  await expect.poll(() => outboxKeys(page)).toHaveLength(0);
  expect(await page.evaluate(() => Object.keys(localStorage).some(k => /:quiz:sent:round-/.test(k)))).toBe(true);
});

test("B7: a 400-as válasz után a bejegyzés törlődik, újra nem megy", async ({ page }) => {
  const posts = await mock(page, { on: true, status: () => 400 });
  await finishQuiz(page);
  await expect.poll(() => finals(posts).length).toBe(1);
  await expect.poll(() => outboxKeys(page)).toHaveLength(0);
  await page.goto("/");
  await page.waitForTimeout(1500);
  expect(finals(posts)).toHaveLength(1);
});

test("B7 / R30: a 7 napnál régebbi tevékenységű bejegyzés induláskor küldés nélkül törlődik", async ({ page }) => {
  const posts = await mock(page, { on: true, status: () => 202 });
  await page.addInitScript(p => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    const old = Date.now() - 8 * 86_400_000;
    localStorage.setItem(`${p}regi`, JSON.stringify({ id: "regi", lessonId: "lesson-q", kind: "quiz", body: { kind: "quiz", roundId: "round-regi", picks: { q1: 0 } },
      flag: "x:quiz:sent:round-regi", partialKey: "x:quiz:partial:round-regi", ownerKey: "x:quiz:owner:round-regi", owner: { learnerTag: null }, activityAt: old }));
  }, PREFIX);
  await page.goto("/");
  await expect.poll(() => outboxKeys(page)).toHaveLength(0);
  await page.waitForTimeout(800);
  expect(finals(posts)).toHaveLength(0);
});

test("B7: KI kapcsolónál a tárolóba nem kerül bejegyzés (a lapon belüli újrapróba marad)", async ({ page }) => {
  const posts = await mock(page, { on: false, status: () => 503 });
  await finishQuiz(page);
  await expect.poll(() => finals(posts).length).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(800);
  expect(await outboxKeys(page)).toHaveLength(0);
});
