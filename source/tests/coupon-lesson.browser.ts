import { test, expect } from "@playwright/test";

for (const [width, height] of [[390, 844], [844, 390], [1366, 768]]) {
  test(`lesson coupon: actual answer, source bank and return link ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const id = "a".repeat(64); const answers: unknown[] = []; let requestedLesson = false;
    await page.addInitScript(() => localStorage.setItem("websuli.spaceQuiz.grade", "4"));
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url()); const p = url.pathname;
      let data: unknown = [];
      if (p === "/api/auth/user") data = { id: "fixture", classroom: 4 };
      if (p.endsWith("/csrf-token")) data = { csrfToken: "fixture-token" };
      if (p.endsWith("/coupons/active")) data = { coupon: { id: "coupon-fixture", lessonId: "older-lesson", sectionIdx: -1, minutes: 10, remainingSeconds: 600, started: false } };
      if (p.endsWith("/start")) data = { remainingSeconds: 600 };
      if (p.includes("material-quizzes")) {
        requestedLesson ||= url.searchParams.get("lessonId") === "older-lesson";
        data = { materials: [], items: [{ id, prompt: "Melyik a merőleges magasság?", options: ["Ferde oldal", "Merőleges szakasz", "Kerület", "Átló"], correctIndex: 1, explanation: "A magasság merőleges az alap egyenesére.", topic: "math" }] };
      }
      if (p.endsWith("/bonus")) { answers.push(route.request().postDataJSON()); data = { correct: false, bonusSeconds: 0, remainingSeconds: 599 }; }
      if (p.endsWith("/sync-eligibility")) data = { eligible: false };
      await route.fulfill({ json: data });
    });
    await page.goto("/games/space-asteroid-quiz");
    await expect(page.getByTestId("coupon-hud")).toBeVisible();
    await expect.poll(() => requestedLesson).toBe(true);
    await page.getByTestId("sa-start").click();
    const wrong = page.getByRole("button", { name: "Ferde oldal", exact: true });
    await expect(wrong).toBeInViewport();
    await wrong.click();
    await expect.poll(() => answers.length).toBe(1);
    expect(answers[0]).toMatchObject({ quizItemId: id, pickedIndex: 0 });
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await expect(page.getByTestId("quiz-feedback").locator(":scope > div")).toHaveCSS("opacity", "1");
    const dismiss = page.getByTestId("quiz-feedback-dismiss");
    expect(await dismiss.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && el.contains(hit); })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../tmp/coupon-proof/answer-${width}.png` });
    // Expiry uses the lesson resolver, with no invalid section-0 anchor for a final quiz.
    await page.route("**/api/lessons/coupons/active*", route => route.fulfill({ json: { coupon: { id: "coupon-fixture", lessonId: "older-lesson", sectionIdx: -1, minutes: 10, remainingSeconds: 0, started: true } } }));
    await page.reload();
    await expect(page.getByTestId("coupon-expired-back")).toBeInViewport();
    await expect(page.locator('a:has([data-testid="coupon-expired-back"])')).toHaveAttribute("href", "/lesson/older-lesson");
  });
}
