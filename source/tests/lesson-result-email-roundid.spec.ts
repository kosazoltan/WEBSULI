import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** B8 (docs/specs/2026-11-25-eredmeny-email-b8.md): 128 bites körazonosító — régi + új kliens közös tárolójával sem megy második levél. */
test.use({ serviceWorkers: "block" });

async function mock(page: Page) {
  const posts: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/lessons/lesson-q/results" && req.method() === "POST") { posts.push(req.postDataJSON() as Record<string, unknown>); return route.fulfill({ status: 202, json: { queued: true } }); }
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/quiz-fixture") return route.fulfill({ json: { id: "quiz-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/quiz-fixture") return route.fulfill({ json: { lessonId: "lesson-q", version: 1, lesson: fusionFixture() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  return posts;
}
async function openQuiz(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await expect(page.locator("[data-quiz-id]")).toHaveCount(25);
}
async function finish(page: Page) {
  await openQuiz(page);
  const quiz = page.locator("[data-quiz-id]");
  for (let i = 0; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
}
const finals = (posts: Array<Record<string, unknown>>) => posts.filter(b => b.kind === "quiz" && !b.partial);
/** A régi kliens visszaírása: a kör rekordjából a `nonce` eltűnik (a régi séma eldobja). */
const asOldClient = (page: Page) => page.evaluate(() => {
  for (const key of Object.keys(localStorage)) {
    const raw = localStorage.getItem(key) ?? "";
    if (raw.includes('"nonce"')) { const v = JSON.parse(raw); delete v.nonce; localStorage.setItem(key, JSON.stringify(v)); }
  }
});
/** Egy másik (régi kliensű) fül a kört a régi azonosítóval küldte el: csak a régi jelző létezik, a kör rekordja itt még nonce-os. */
const onlyLegacyFlag = (page: Page) => page.evaluate(() => {
  for (const key of Object.keys(localStorage)) if (/:sent:r2-/.test(key)) localStorage.removeItem(key);
});
const flagsReady = (page: Page) => expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(k => /:quiz:sent:round-/.test(k)))).toBe(true);

test("B8: új kör — r2-<32 hexa> azonosító, és mindkét „már elküldve” jelző íródik", async ({ page }) => {
  const posts = await mock(page);
  await finish(page);
  await expect.poll(() => finals(posts).length).toBe(1);
  expect(String(finals(posts)[0]!.roundId)).toMatch(/^r2-[0-9a-f]{32}$/);
  // A jelzők a 2xx válasz feldolgozása után íródnak — korlátos várakozás.
  const flags = () => page.evaluate(() => Object.keys(localStorage).filter(k => /:quiz:sent:/.test(k)));
  await expect.poll(async () => (await flags()).some(k => /:sent:r2-[0-9a-f]{32}$/.test(k))).toBe(true);
  expect((await flags()).some(k => /:sent:round-[0-9a-z]+$/.test(k))).toBe(true);
});

test("B8: a régi kliens nonce-vesztése (tárolóírás) után sem megy második levél", async ({ page }) => {
  const posts = await mock(page);
  await finish(page);
  await expect.poll(() => finals(posts).length).toBe(1);
  await flagsReady(page);
  await asOldClient(page);
  await openQuiz(page);
  await page.waitForTimeout(1500);
  expect(finals(posts)).toHaveLength(1);
});

test("B8: a régi azonosítóval (másik, régi kliensű fülben) elküldött kör — csak a régi jelző — nem kap második levelet", async ({ page }) => {
  const posts = await mock(page);
  await finish(page);
  await expect.poll(() => finals(posts).length).toBe(1);
  await flagsReady(page);
  await onlyLegacyFlag(page);
  await openQuiz(page);
  await page.waitForTimeout(1500);
  expect(finals(posts)).toHaveLength(1);
});
