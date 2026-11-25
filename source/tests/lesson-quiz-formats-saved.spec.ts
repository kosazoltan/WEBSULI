import { expect, test } from "@playwright/test";

/**
 * V4, review #603: a bejelentkezett tanuló MENTETT kvízében is látszik a típuscímke, és a kiegészítés hiánya a válasz után kitöltődik
 * (a típust a lecke azonos kérdése adja — questionId + azonos szöveg).
 */
test.use({ serviceWorkers: "block" });

test("mentett kvíz: típuscímke és kitöltött hiány", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe?fusion=1&quizFormats=1");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const items = await page.locator("section[data-quiz-format]").evaluateAll(nodes => nodes.map(n => ({
    questionId: n.getAttribute("data-quiz-id")!, format: n.getAttribute("data-quiz-format")!, prompt: n.querySelector("h3")!.textContent!,
    options: [...n.querySelectorAll(".lesson-option")].map(b => b.textContent!.slice(1)),
  })));
  const pick = ["fillGap", "oddOneOut", "number"].map(f => items.find(i => i.format === f)!);
  expect(pick.every(Boolean)).toBe(true);
  const view = (answered: Record<string, number> = {}) => ({
    id: "round1", lessonId: "practice-probe", bankVersion: "v", startedAt: new Date().toISOString(), finishedAt: null, result: null,
    questions: pick.map((q, i) => ({ id: `a${i}`, questionId: q.questionId, questionVersion: "x", prompt: q.prompt, options: q.options, coversConceptIds: [], hintUsed: false, fixedOrder: true,
      ...(answered[`a${i}`] !== undefined ? { answer: { pickedIndex: answered[`a${i}`], usedHint: false, correct: true, answeredAt: new Date().toISOString(), feedback: "Jó." } } : {}) })),
  });
  await page.route("**/api/auth/user", r => r.fulfill({ json: { id: "u1" } }));
  await page.route("**/api/lessons/practice/practice-probe/start", r => r.fulfill({ json: view() }));
  await page.route("**/api/lessons/practice/round1/answer", r => r.fulfill({ json: view({ a0: 0 }) }));
  await page.evaluate(() => localStorage.clear());
  await page.goto("/__lesson-runtime-probe?fusion=1&quizFormats=1&practice=1");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const saved = (i: number) => page.locator(`section[data-quiz-id="${pick[i].questionId}"]`);
  await expect(saved(0)).toHaveAttribute("data-quiz-format", "fillGap");
  await expect(saved(0).getByTestId("quiz-gap")).toHaveText("___");
  await expect(saved(1)).toContainText("Kakukktojás");
  await expect(saved(2)).toContainText("Számolós kérdés");
  await saved(0).locator(".lesson-option").first().click();
  await expect(saved(0).getByTestId("quiz-gap")).toHaveText(pick[0].options[0].trim());
});
