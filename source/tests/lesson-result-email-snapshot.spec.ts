import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { resultRequestSchema } from "../shared/lesson-result-email";

/**
 * B5b (docs/specs/2026-11-25-eredmeny-email-b5b.md): a félbehagyott helyi kvíz pillanatképe (`partial: true`) — valódi render, vendég
 * tanuló. A szerver a `/api/csrf-token` válaszában `resultPartial: true`-val hirdeti (RESULT_PARTIAL_EMAIL BE); nélküle nincs kérés.
 */
test.use({ serviceWorkers: "block" });

type Post = Record<string, unknown> & { kind?: string; partial?: boolean; picks?: Record<string, number> };

async function mock(page: Page, opts: { partial?: boolean; hang?: boolean } = {}) {
  const posts: Array<{ body: Post; keepalive: boolean }> = [];
  await page.addInitScript(() => {
    const w = window as unknown as { __keepalive: boolean[] };
    w.__keepalive = [];
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/\/api\/lessons\/[^/]+\/results$/.test(target)) w.__keepalive.push(init?.keepalive === true);
      return original(input, init);
    };
  });
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/lessons/lesson-q/results" && req.method() === "POST") {
      const body = req.postDataJSON() as Post;
      posts.push({ body, keepalive: false });
      if (opts.hang && body.partial) return; // R44: válasz nélkül függ
      return route.fulfill({ status: 202, json: body.partial ? { queued: true, partial: true } : { queued: true } });
    }
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test", ...(opts.partial ? { resultPartial: true, resultOwnerBinding: true } : {}) } });
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
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  return quiz;
}
async function answer(page: Page, from: number, to: number) {
  const quiz = page.locator("[data-quiz-id]");
  for (let i = from; i < to; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
}
async function hide(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
async function show(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
const partials = (posts: Array<{ body: Post }>) => posts.map(p => p.body).filter(b => b.kind === "quiz" && b.partial === true);
const finals = (posts: Array<{ body: Post }>) => posts.map(p => p.body).filter(b => b.kind === "quiz" && !b.partial);

test("B5b: háttérbe kerüléskor a félbehagyott kör pillanatképe megy — sémahelyes, keepalive, minden kérdés (-1 a megválaszolatlan)", async ({ page }) => {
  const posts = await mock(page, { partial: true });
  await openQuiz(page);
  await answer(page, 0, 3);
  await hide(page);
  await expect.poll(() => partials(posts).length).toBe(1);
  const body = partials(posts)[0]!;
  expect(resultRequestSchema.safeParse(body).success).toBe(true);
  expect(Object.keys(body.picks!)).toHaveLength(25);
  expect(Object.values(body.picks!).filter(v => v >= 0)).toHaveLength(3);
  expect(typeof body.lastAnsweredAt).toBe("number");
  expect(await page.evaluate(() => (window as unknown as { __keepalive: boolean[] }).__keepalive.every(Boolean))).toBe(true);
  expect(finals(posts)).toHaveLength(0);
});

test("B5b: ugyanaz az állapot nem megy újra, egy újabb válasz után igen", async ({ page }) => {
  const posts = await mock(page, { partial: true });
  await openQuiz(page);
  await answer(page, 0, 2);
  await hide(page);
  await expect.poll(() => partials(posts).length).toBe(1);
  await show(page);
  await hide(page);
  await page.waitForTimeout(800);
  expect(partials(posts)).toHaveLength(1);
  await show(page);
  await answer(page, 2, 3);
  await hide(page);
  await expect.poll(() => partials(posts).length).toBe(2);
  expect(Object.values(partials(posts)[1]!.picks!).filter(v => v >= 0)).toHaveLength(3);
});

test("B5b: a szerver jelzése nélkül (régi szerver / KI kapcsoló) nincs pillanatkép", async ({ page }) => {
  const posts = await mock(page, { partial: false });
  await openQuiz(page);
  await answer(page, 0, 3);
  await hide(page);
  await page.waitForTimeout(1500);
  expect(partials(posts)).toHaveLength(0);
});

test("B5b / R3: a kör nézeten belüli cseréjekor az ELHAGYOTT körről megy a pillanatkép", async ({ page }) => {
  const posts = await mock(page, { partial: true });
  await openQuiz(page);
  await answer(page, 0, 4);
  await page.getByRole("button", { name: "Új kvíz" }).click();
  await page.getByRole("button", { name: "Új kör indítása" }).click();
  await expect.poll(() => partials(posts).length).toBe(1);
  expect(Object.values(partials(posts)[0]!.picks!).filter(v => v >= 0)).toHaveLength(4);
});

test("B5b: teljesen megválaszolt kör — csak a végleges beküldés, pillanatkép nincs", async ({ page }) => {
  const posts = await mock(page, { partial: true });
  await openQuiz(page);
  await answer(page, 0, 25);
  await expect.poll(() => finals(posts).length).toBe(1);
  await hide(page);
  await page.waitForTimeout(800);
  expect(partials(posts)).toHaveLength(0);
});

test("B5b / R44: a válasz nélkül függő pillanatkép határideje után ugyanaz az állapot újra elküldhető", async ({ page }) => {
  await page.clock.install();
  const posts = await mock(page, { partial: true, hang: true });
  await openQuiz(page);
  await answer(page, 0, 2);
  await hide(page);
  await expect.poll(() => partials(posts).length).toBe(1);
  await show(page);
  await hide(page);
  await page.waitForTimeout(300);
  expect(partials(posts)).toHaveLength(1);
  await page.clock.fastForward(16_000);
  await show(page);
  await hide(page);
  await expect.poll(() => partials(posts).length).toBe(2);
});
