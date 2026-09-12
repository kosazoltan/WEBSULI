import { test, expect, type Page, type Locator } from "@playwright/test";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { PracticeView } from "../shared/lesson-attempt";
import { readFile } from "node:fs/promises";

async function fullyVisible(button: Locator, page: Page) {
  const size = page.viewportSize()!; const box = await button.boundingBox(); expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await button.evaluate(el => { const r = el.getBoundingClientRect(); const blockers = []; let p = el.parentElement; while (p) { const style = getComputedStyle(p); const b = p.getBoundingClientRect(); if (/(auto|hidden|scroll|clip)/.test(style.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) blockers.push({ parent: p.className, buttonTop: r.top, buttonBottom: r.bottom, parentTop: b.top, parentBottom: b.bottom }); p = p.parentElement; } return blockers; })).toEqual([]);
}
async function fixture(page: Page) {
  const lesson = compactFusionFixture();
  const round: PracticeView = { id: "saved-round", lessonId: "practice-probe", bankVersion: "v1", startedAt: new Date().toISOString(), finishedAt: null, result: null,
    // This server-round fixture deliberately has two questions and a 2/2 result.
    questions: lesson.experience!.quiz.slice(0, 2).map((q, i) => ({ id: String(i).repeat(64), questionId: q.id, questionVersion: "v1", prompt: q.question, options: q.options, coversConceptIds: q.coversConceptIds, hintUsed: false })) };
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
      round.finishedAt = new Date().toISOString();
      round.result = { score: 100, correctCount: 2, independentCorrect: 2, total: 2, weakConceptIds: [], coupon: { id: "fixture-coupon", minutes: 1, expiresAt: new Date(Date.now() + 60000).toISOString() }, alreadyRewarded: false, minCorrectForCoupon: 2 };
    }
    await r.fulfill({ json: round });
  });
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
  await page.getByRole("button", { name: "Következő kérdés", exact: true }).click();
  const answer = page.locator('.fusion-quiz:visible .lesson-option').nth(3);
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
