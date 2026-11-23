import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { resultRequestSchema } from "../shared/lesson-result-email";

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
  // B1b (R2): a kör kezdete és az utolsó válasz ideje a törzsben — a szerver szigorú sémája (B1a) elfogadja.
  expect(resultRequestSchema.safeParse(sent).success, "a törzs megfelel a szerver sémájának").toBe(true);
  expect(typeof sent.startedAt === "number" && (sent.startedAt as number) > 0).toBe(true);
  expect(typeof sent.lastAnsweredAt === "number" && (sent.lastAnsweredAt as number) >= (sent.startedAt as number)).toBe(true);
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

// --- Eredmény-e-mail B1b (R2): a 7 napos korhatár az UTOLSÓ VÁLASZHOZ mér ---

/** A beküldés szervere kapcsolható: hibánál 500-at ad (a kliens újrapróbál, a kör „elküldetlen” marad), különben rögzít és 202-t ad. */
async function switchableMock(page: Page) {
  const accepted: Array<Record<string, unknown>> = [];
  const state = { fail: true, attempts: 0 };
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/lessons/lesson-q/results" && req.method() === "POST") {
      state.attempts++;
      if (state.fail) return route.fulfill({ status: 500, json: { message: "hiba" } });
      accepted.push(req.postDataJSON());
      return route.fulfill({ status: 202, json: { queued: true } });
    }
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/quiz-fixture") return route.fulfill({ json: { id: "quiz-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/quiz-fixture") return route.fulfill({ json: { lessonId: "lesson-q", version: 1, lesson: fusionFixture() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
  return { accepted, state };
}

const DAY = 86_400_000;
const T0 = new Date("2026-11-02T10:00:00+01:00").getTime();

/** Megnyitja a kvízt, megválaszolja mind a 25 kérdést (a szerver ekkor hibázik), majd megvárja, hogy az újrapróbák elfogyjanak. */
async function answerAllWhileFailing(page: Page, attempts: () => number) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  return { quiz, finish: async () => { await page.clock.runFor(60_000); expect(attempts(), "az első beküldés megpróbálta, de nem ért célba").toBeGreaterThan(0); } };
}

async function reloadAndCount(page: Page) {
  await page.reload();
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await expect(page.locator("[data-quiz-id]")).toHaveCount(25);
  await page.clock.runFor(5_000);
  await page.waitForTimeout(1500);
}

for (const sample of [{ days: 8, sends: 0, name: "8 nappal az utolsó válasz után a le nem zárt, elküldetlen kör már nem megy el" }, { days: 6, sends: 1, name: "6 nappal az utolsó válasz után az elküldetlen kör még elmegy" }]) {
  test(`B1b korhatár: ${sample.name}`, async ({ page }) => {
    const { accepted, state } = await switchableMock(page);
    await page.clock.install({ time: new Date(T0) });
    const { quiz, finish } = await answerAllWhileFailing(page, () => state.attempts);
    for (let i = 0; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
    await finish();
    expect(accepted).toHaveLength(0);

    await page.clock.setSystemTime(new Date(T0 + sample.days * DAY));
    state.fail = false;
    const before = state.attempts;
    await reloadAndCount(page);
    expect(accepted.filter(p => p.kind === "quiz")).toHaveLength(sample.sends);
    if (!sample.sends) expect(state.attempts, "elavult körnél a kérés el sem indul").toBe(before);
  });
}

// 1. vak kör L1 + L3: a korhatár az UTOLSÓ VÁLASZHOZ mér, nem a kezdéshez.
test("B1b korhatár: 8 napja megnyitott, de MA megválaszolt kör elmegy (a kezdés ideje nem számít)", async ({ page }) => {
  const { accepted, state } = await switchableMock(page);
  await page.clock.install({ time: new Date(T0) });
  const { quiz, finish } = await answerAllWhileFailing(page, () => state.attempts);
  await quiz.nth(0).locator("button.lesson-option").first().click(); // a kör 8 nappal a többi válasz előtt indul
  await page.clock.setSystemTime(new Date(T0 + 8 * DAY));
  for (let i = 1; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await finish();
  state.fail = false;
  await reloadAndCount(page);
  const sent = accepted.filter(p => p.kind === "quiz");
  expect(sent).toHaveLength(1);
  expect((sent[0].lastAnsweredAt as number) - (sent[0].startedAt as number)).toBeGreaterThanOrEqual(8 * DAY - 60_000);
});

test("B1b korhatár: a régi kliens által tárolt kör (válaszidő nélkül) 8 nap múlva is elmegy — a kor ismeretlen, nem elavult", async ({ page }) => {
  const { accepted, state } = await switchableMock(page);
  await page.clock.install({ time: new Date(T0) });
  const { quiz, finish } = await answerAllWhileFailing(page, () => state.attempts);
  for (let i = 0; i < 25; i++) await quiz.nth(i).locator("button.lesson-option").first().click();
  await finish();
  // A B1b előtti kliens formátuma: a tárolt körből kivesszük az utolsó válasz idejét.
  const stripped = await page.evaluate(() => {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? "null");
        if (value && typeof value === "object" && "lastAnsweredAt" in value) { delete value.lastAnsweredAt; localStorage.setItem(key, JSON.stringify(value)); n++; }
      } catch { /* nem JSON érték */ }
    }
    return n;
  });
  expect(stripped, "volt tárolt kör válaszidővel").toBeGreaterThan(0);
  await page.clock.setSystemTime(new Date(T0 + 8 * DAY));
  state.fail = false;
  await reloadAndCount(page);
  const sent = accepted.filter(p => p.kind === "quiz");
  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toHaveProperty("lastAnsweredAt");
});
