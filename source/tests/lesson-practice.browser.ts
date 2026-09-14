import { test, expect, type Page, type Locator } from "@playwright/test";
import { compactFusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { PracticeView } from "../shared/lesson-attempt";
import { readFile } from "node:fs/promises";

async function fullyVisible(button: Locator, page: Page) {
  await button.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const size = page.viewportSize()!; const box = await button.boundingBox(); expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await button.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return [0.1, 0.5, 0.9].every(fraction => element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height * fraction)));
  })).toBe(true);
  expect(await button.evaluate(el => { const r = el.getBoundingClientRect(); const blockers = []; let p = el.parentElement; while (p) { const style = getComputedStyle(p); const b = p.getBoundingClientRect(); if (/(auto|hidden|scroll|clip)/.test(style.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) blockers.push({ parent: p.className, buttonTop: r.top, buttonBottom: r.bottom, parentTop: b.top, parentBottom: b.bottom }); p = p.parentElement; } return blockers; })).toEqual([]);
}
async function fixture(page: Page, questionCount = 2) {
  const lesson = questionCount === 2 ? compactFusionFixture() : standardFusionFixture();
  const round: PracticeView = { id: "saved-round", lessonId: "practice-probe", bankVersion: "v1", startedAt: new Date().toISOString(), finishedAt: null, result: null,
    questions: lesson.experience!.quiz.slice(0, questionCount).map((q, i) => ({ id: i.toString(16).padStart(64, "0"), questionId: q.id, questionVersion: "v1", prompt: q.question, options: q.options, coversConceptIds: q.coversConceptIds, hintUsed: false })) };
  let failNext = true;
  await page.route("**/api/auth/user", r => r.fulfill({ json: { id: "synthetic-learner" } }));
  await page.route("**/api/csrf-token", r => r.fulfill({ json: { csrfToken: "synthetic-token" } }));
  await page.route("**/tmp/lesson-fusion.json", r => r.fulfill({ json: lesson }));
  await page.route("**/api/lessons/practice/**", async r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith("/answer")) {
      if (failNext) { failNext = false; await r.fulfill({ status: 503, json: { message: "Próba mentési hiba" } }); return; }
      const data = r.request().postDataJSON(); const q = round.questions.find(q => q.id === data.questionId)!; const source = lesson.experience!.quiz.find(item => item.id === q.questionId)!;
      if (!q.answer) q.answer = { pickedIndex: data.pickedIndex, usedHint: q.hintUsed, correct: data.pickedIndex === source.correctIndex, answeredAt: new Date().toISOString(), feedback: source.feedbackPerOption[data.pickedIndex] };
    }
    if (path.endsWith("/hint")) round.questions.find(q => q.id === r.request().postDataJSON().questionId)!.hintUsed = true;
    if (path.endsWith("/finish")) {
      expect(questionCount).toBe(2);
      round.finishedAt = new Date().toISOString();
      round.result = { score: 100, correctCount: 2, independentCorrect: 2, total: 2, weakConceptIds: [], coupon: { id: "fixture-coupon", minutes: 1, expiresAt: new Date(Date.now() + 60000).toISOString() }, alreadyRewarded: false, minCorrectForCoupon: 2 };
    }
    await r.fulfill({ json: round });
  });
  return round;
}
for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) test(`saved first answer, retry, reload and reward at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height }); await fixture(page);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/__lesson-runtime-probe?candidate=1&practice=1");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await expect(page.getByText("A válaszaid mentve", { exact: true })).toBeVisible();
  const first = page.locator('.fusion-quiz:visible .lesson-option').first();
  await fullyVisible(first, page); await fullyVisible(page.getByRole("button", { name: "Kvíz kiértékelése", exact: true }), page);
  await first.click(); await expect(page.getByRole("alert")).toContainText("Próba mentési hiba");
  await expect(page.locator('.fusion-quiz:visible .lesson-feedback')).toHaveCount(0);
  await fullyVisible(page.getByRole("button", { name: "Mentés újrapróbálása" }), page);
  await page.getByRole("button", { name: "Mentés újrapróbálása" }).click();
  await expect(first).toBeDisabled(); await expect(page.locator('.fusion-quiz:visible .lesson-feedback')).toBeVisible();
  await page.reload(); await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await expect(page.locator('.fusion-quiz:visible .lesson-option').first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-quiz-id]:visible')).toHaveCount(2);
  await expect(page.getByRole("tabpanel", { name: "Kvíz", exact: true }).locator(".learning-pager, .learning-mode")).toHaveCount(0);
  const question = page.locator('[data-quiz-id="q2"]');
  const answer = question.locator('.lesson-option').nth(3);
  await fullyVisible(answer, page);
  await page.screenshot({ path: `test-results/practice-options-${width}x${height}.png`, fullPage: false });
  await fullyVisible(page.getByRole("button", { name: "Segítség: vissza a magyarázathoz", exact: true }), page);
  await fullyVisible(answer, page); await answer.click();
  await expect(page.getByText("A válaszaid mentve", { exact: true })).toBeVisible();
  await fullyVisible(page.getByRole("button", { name: "Kvíz kiértékelése", exact: true }), page);
  await page.screenshot({ path: `test-results/practice-${width}x${height}.png`, fullPage: false });
  await page.getByRole("button", { name: "Kvíz kiértékelése", exact: true }).click();
  await expect(page.getByRole("region", { name: "Mentett kvízeredmény" })).toContainText("100% · 2 / 2 pont");
  await expect(page.getByRole("link", { name: "Játékot választok" })).toHaveAttribute("href", "/games");
  await expect(page.getByText(/Gyakorló osztályzat: Jeles \(5\)/)).toBeVisible();
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eredmény letöltése", exact: true }).click();
  const download = await downloadReady;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.percent).toBe(100); expect(exported.questions).toHaveLength(2);
  expect(exported.questions.every((q: PracticeView["questions"][number]) => !!q.answer)).toBe(true);
  expect(exported.seconds).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(exported)).not.toMatch(/synthetic-learner|fixture-coupon/);
  await page.getByText("A kör válaszainak áttekintése", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Kapcsolódó magyarázat", exact: true })).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
for (const [width, height] of [[320, 900], [844, 390], [1365, 612]]) test(`saved continuous 25-question list preserves arbitrary answer order and missing continuation at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  const round = await fixture(page, 25);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const answers: string[] = [];
  let finishes = 0;
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/answer")) answers.push(request.postDataJSON().questionId);
    if (path.endsWith("/finish")) finishes++;
  });
  await page.goto("/__lesson-runtime-probe?candidate=1&practice=1");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const panel = page.getByRole("tabpanel", { name: "Kvíz", exact: true });
  const questions = panel.locator("[data-quiz-id]");
  await expect(panel.locator("[data-quiz-id]:visible")).toHaveCount(25);
  await expect(panel.locator(".learning-pager, .learning-mode")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /Teljes kvíz|Következő kérdés|Előző kérdés/ })).toHaveCount(0);
  const lastAnswer = questions.last().locator(".lesson-option").first();
  await fullyVisible(lastAnswer, page);
  await lastAnswer.click();
  await expect(page.getByRole("alert")).toContainText("Próba mentési hiba");
  expect(round.questions.some(question => question.answer)).toBe(false);
  await expect(questions.locator(".lesson-feedback")).toHaveCount(0);
  const retryResponse = page.waitForResponse(response => response.url().endsWith("/answer") && response.status() === 200);
  await page.getByRole("button", { name: "Mentés újrapróbálása" }).click();
  await retryResponse;
  await expect(lastAnswer).toHaveAttribute("aria-pressed", "true");
  await expect(questions.first().locator(".lesson-option").first()).toBeEnabled();
  const firstResponse = page.waitForResponse(response => response.url().endsWith("/answer") && response.status() === 200);
  await questions.first().locator(".lesson-option").first().click();
  await firstResponse;
  await expect(panel).toContainText("2 / 25 válasz · 2 pont");
  expect(answers).toEqual([round.questions[24].id, round.questions[24].id, round.questions[0].id]);
  expect(round.questions.filter(question => question.answer).map(question => question.questionId)).toEqual(["q1", "q25"]);
  await page.reload();
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await expect(panel.locator("[data-quiz-id]:visible")).toHaveCount(25);
  await expect(panel).toContainText("2 / 25 válasz · 2 pont");
  for (const question of [questions.first(), questions.last()]) {
    await expect(question.locator(".lesson-option").first()).toHaveAttribute("aria-pressed", "true");
    for (const option of await question.locator(".lesson-option").all()) await expect(option).toBeDisabled();
  }
  await page.getByRole("button", { name: "Kvíz kiértékelése", exact: true }).click();
  await page.getByRole("button", { name: "Folytatom a kitöltést", exact: true }).click();
  await expect(questions.nth(1)).toBeFocused();
  await expect(questions.nth(1)).toBeInViewport();
  await expect(panel.locator("[data-quiz-id]:visible")).toHaveCount(25);
  expect(finishes).toBe(0);
  expect(round.finishedAt).toBeNull();
  expect(round.result).toBeNull();
  for (const question of [questions.first(), questions.nth(1), questions.last()]) {
    for (const option of await question.locator(".lesson-option").all()) await fullyVisible(option, page);
  }
  expect(await questions.evaluateAll(elements => elements.every(element => element.scrollHeight <= element.clientHeight + 1 && !/auto|scroll/.test(getComputedStyle(element).overflowY)))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/practice-continuous-${width}x${height}.png` });
  expect(errors).toEqual([]);
});
test("teacher report shows measured counts, empty/error states and a bounded question list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let mode: "data" | "error" | "empty" = "data";
  await page.route("**/api/studio/lessons/practice-probe/learning-report", r => mode === "error" ? r.fulfill({ status: 503, json: { message: "Riport próbahiba" } }) : r.fulfill({ json: {
    completedRounds: mode === "empty" ? 0 : 3, limit: 1000, asOf: new Date().toISOString(), questions: mode === "empty" ? [] : Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, prompt: `Kérdés ${i + 1}: őszinte, önálló válasz`, concepts: ["area"], attempts: 3, wrong: 2, hints: 1 })),
  } }));
  await page.goto("/__studio-panel-probe?report=1");
  await expect(page.getByRole("region", { name: "Mentett kvízeredmények" })).toContainText("3 lezárt kör");
  await expect(page.getByText("2 hibás vagy kihagyott / 3 válasz · 1 segítségkérés")).toHaveCount(20);
  await page.getByRole("button", { name: "Következő", exact: true }).click();
  await expect(page.getByText("Kérdés 21: őszinte, önálló válasz", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mode = "error"; await page.reload(); await expect(page.getByRole("alert")).toContainText("A tanulási riport most nem érhető el.");
  mode = "empty"; await page.getByRole("button", { name: "Újra", exact: true }).click();
  await expect(page.getByText("Még nincs mentett kvízeredmény.", { exact: true })).toBeVisible();
});
