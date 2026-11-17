import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * Spec 2026-11-17-eredmeny-email-kviz — valódi render, vendég tanuló: a helyi kvíz eredménye akkor is elmegy, ha a tanuló minden
 * kérdésre válaszolt, de a „Kvíz kiértékelése” gombot nem nyomta meg (a kvíz kérdésenként azonnal visszajelez). Körönként egyszer;
 * a hiányos, le nem zárt kör nem megy el. (A gombos út régi tesztje: lesson-result-email.spec.ts.)
 */
test.use({ serviceWorkers: "block" });

async function mock(page: Page) {
  const posts: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/lessons/lesson-q/results" && req.method() === "POST") { posts.push(req.postDataJSON()); return route.fulfill({ status: 202, json: { queued: true } }); }
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/quiz-fixture") return route.fulfill({ json: { id: "quiz-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/quiz-fixture") return route.fulfill({ json: { lessonId: "lesson-q", version: 1, lesson: fusionFixture() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  return posts;
}

const quizPosts = (posts: Array<Record<string, unknown>>) => posts.filter(p => p.kind === "quiz");

test("minden kérdés megválaszolva: a kvíz a lezáró gomb nélkül, pontosan egyszer megy el", async ({ page }) => {
  const posts = await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  for (let i = 0; i < 24; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(1500);
  expect(quizPosts(posts), "hiányos, le nem zárt kör nem megy el").toHaveLength(0);

  await quiz.nth(24).locator("button.lesson-option").first().click();
  await expect.poll(() => quizPosts(posts).length).toBe(1);
  const sent = quizPosts(posts)[0];
  expect(sent.roundId).toMatch(/^round-[a-z0-9]+$/);
  const picks = sent.picks as Record<string, number>;
  expect(Object.keys(picks)).toHaveLength(25);
  expect(Object.values(picks).every(pick => Number.isInteger(pick) && pick >= 0), "minden kérdésre valódi válasz").toBe(true);
  expect(sent).not.toHaveProperty("score");
  // A lezáró gomb még látszik (a kör nincs lezárva); megnyomása nem küld újra.
  await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
  await expect(page.locator(".fusion-panel-quiz")).toHaveAttribute("data-finished", "true");
  await page.waitForTimeout(1500);
  expect(quizPosts(posts), "a lezárás nem küld másodszor").toHaveLength(1);

  await page.reload();
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await expect(page.locator("[data-quiz-id]")).toHaveCount(25);
  await page.waitForTimeout(1500);
  expect(quizPosts(posts), "újratöltés után nincs újabb beküldés").toHaveLength(1);
});

test("hiányos kör lezárása a kihagyásokkal: egy beküldés, a kihagyott kérdés -1", async ({ page }) => {
  const posts = await mock(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
  await page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();
  await expect.poll(() => quizPosts(posts).length).toBe(1);
  const picks = Object.values(quizPosts(posts)[0].picks as Record<string, number>);
  expect(picks).toHaveLength(25);
  expect(picks.filter(pick => pick === -1)).toHaveLength(22);
  await page.waitForTimeout(1500);
  expect(quizPosts(posts)).toHaveLength(1);
});

/** S1b: a lap háttérbe kerülésének utánzása (a telefonon megbízható esemény a `visibilitychange`). */
async function hide(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
}

test("S1b: félbehagyott kvíz — háttérbe kerüléskor pillanatkép megy; válasz nélkül vagy változatlan állapotnál nem; a teljes kör végleges beküldés", async ({ page }) => {
  const posts = await mock(page);
  const partials = () => quizPosts(posts).filter(p => p.partial === true);
  const answered = (p: Record<string, unknown>) => Object.values(p.picks as Record<string, number>).filter(pick => pick >= 0).length;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  await hide(page);
  await page.waitForTimeout(800);
  expect(quizPosts(posts), "válasz nélkül nincs pillanatkép").toHaveLength(0);

  for (let i = 0; i < 3; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await page.waitForTimeout(800); // a CSRF-token előzetes lekérése
  await hide(page);
  await expect.poll(() => partials().length).toBe(1);
  expect(answered(partials()[0])).toBe(3);
  expect(Object.keys(partials()[0].picks as object)).toHaveLength(25);
  expect(partials()[0].roundId).toMatch(/^round-[a-z0-9]+$/);
  expect(typeof partials()[0].startedAt).toBe("number");
  expect(partials()[0]).not.toHaveProperty("score");

  await hide(page);
  await page.waitForTimeout(800);
  expect(partials(), "változatlan állapotnál nincs újabb pillanatkép").toHaveLength(1);

  for (let i = 3; i < 5; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await hide(page);
  await expect.poll(() => partials().length).toBe(2);
  expect(answered(partials()[1])).toBe(5);

  // A kör befejezése: a végleges beküldés `partial` nélkül megy; utána a háttérbe kerülés már nem küld pillanatképet.
  for (let i = 5; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await expect.poll(() => quizPosts(posts).filter(p => p.partial !== true).length).toBe(1);
  await hide(page);
  await page.waitForTimeout(800);
  expect(partials()).toHaveLength(2);
  expect(quizPosts(posts)).toHaveLength(3);
});
