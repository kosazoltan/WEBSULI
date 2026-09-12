import { test, expect } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

// Keep the candidate JSON interception identical in the focused and general CI runs.
test.use({ serviceWorkers: "block" });

for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1440, 900], [2560, 1440]]) {
  test(`four pages, written tasks and frozen quiz scoring at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/__lesson-runtime-probe?fusion=1");
    await expect(page.getByRole("tab", { name: "Tananyag", exact: true })).toBeVisible();
    for (const name of ["Tananyag", "Módszerek", "Feladatok", "Kvíz"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect.poll(async () => (await page.locator(".fusion-tabs").boundingBox())!.y).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const targets = await page.locator(".fusion-tabs button").evaluateAll(els => els.map(e => { const b = e.getBoundingClientRect(); return { width: b.width, height: b.height }; }));
      expect(targets.every(b => b.width >= 44 && b.height >= 44)).toBe(true);
    }
    const quiz = page.locator('[data-quiz-id]');
    await expect(quiz).toHaveCount(25);
    await expect(page.locator('[data-quiz-id]:visible')).toHaveCount(1);
    await page.getByRole("button", { name: "Teljes kvíz", exact: true }).click();
    await quiz.first().getByRole("button").nth(1).click();
    await expect(quiz.first().getByRole("button").first()).toBeDisabled();
    for (let i = 1; i < 25; i++) await quiz.nth(i).getByRole("button").first().click();
    await page.getByRole("button", { name: "Kvíz kiértékelése" }).click();
    await expect(page.getByRole("region", { name: "Kvíz eredmény" })).toContainText("24 / 25 pont");
    await page.reload();
    await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
    await expect(page.getByRole("region", { name: "Kvíz eredmény" })).toContainText("96%");
    await page.getByRole("button", { name: "Új kvíz", exact: true }).click();
    await page.getByRole("button", { name: "Mégse", exact: true }).click();
    await expect(page.getByRole("region", { name: "Kvíz eredmény" })).toContainText("24 / 25 pont");
    await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
    await expect(page.locator('[data-task-id]')).toHaveCount(15);
    await expect(page.locator('[data-task-id]:visible')).toHaveCount(1);
    await page.getByRole("button", { name: "Teljes feladatsor", exact: true }).click();
    const first = page.locator('[data-task-id]').first();
    const id = await first.getAttribute("data-task-id");
    await first.locator("textarea").fill(String((Number(id!.slice(1)) + 1) * 2));
    await page.getByRole("button", { name: "Feladatok kiértékelése" }).click();
    await page.getByRole("button", { name: "Lezárom a kihagyásokkal", exact: true }).click();
    await expect(page.getByRole("region", { name: "Feladatok eredmény" })).toContainText("1 / 15 pont");
    await page.getByRole("tab", { name: "Tananyag", exact: true }).click();
    await expect(page.getByRole("tablist")).toBeInViewport();
    await page.screenshot({ path: `test-results/fusion-viewport-${width}x${height}.png` });
    await page.screenshot({ path: `test-results/fusion-${width}x${height}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("cognitive gates unlock methods, sorting works with accessible controls, themes differ", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe?fusion=1");
  const ocean = await page.locator('[data-experience]').evaluate(e => getComputedStyle(e).backgroundColor);
  await page.getByRole("tab", { name: "Módszerek", exact: true }).click();
  await expect(page.locator('[data-method="sorting"]')).toHaveCount(0);
  const methods = page.getByRole("tabpanel", { name: "Módszerek", exact: true });
  await methods.locator('[data-method="gate"]').first().getByRole("button").first().click();
  await expect(methods.locator('[data-method="sorting"]')).toBeVisible();
  const sort = methods.locator('[data-method="sorting"]');
  // Reacquire the moving control: a coordinate double-click hits a different row after the first move.
  await sort.getByRole("button", { name: "Azonosítom az alapot és a magasságot. feljebb", exact: true }).click();
  await sort.getByRole("button", { name: "Azonosítom az alapot és a magasságot. feljebb", exact: true }).click();
  await sort.getByRole("button", { name: "Összeszorzom az alapot és a magasságot. feljebb", exact: true }).click();
  await sort.getByRole("button", { name: "Sorrend ellenőrzése", exact: true }).click();
  await expect(sort.getByRole("status")).toContainText("Helyes sorrend");
  await page.goto("/__lesson-runtime-probe?fusion=1&theme=cosmos");
  expect(await page.locator('[data-experience]').evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe(ocean);
});

test("foreign-language glossary starts speech only on request, with the correct language and rate", async ({ page }) => {
  const lesson = fusionFixture(); lesson.subject = "angol";
  lesson.experience!.language = "en-GB";
  lesson.experience!.glossary = [{ word: "triangle", translation: "háromszög", partOfSpeech: "főnév", example: "This is a triangle.", exampleTranslation: "Ez egy háromszög." }];
  await page.addInitScript(() => {
    const calls: Array<{ text: string; lang: string; rate: number }> = [];
    Object.defineProperty(window, "speechSynthesis", { value: { cancel() {}, speak(u: SpeechSynthesisUtterance) { calls.push({ text: u.text, lang: u.lang, rate: u.rate }); } } });
    Object.defineProperty(window, "__speechCalls", { value: calls });
  });
  await page.route("**/tmp/lesson-fusion.json", route => route.fulfill({ json: lesson }));
  await page.goto("/__lesson-runtime-probe?candidate=1");
  await expect(page.getByRole("heading", { name: "Szószedet · hallgasd és mondd utánam!" })).toBeVisible();
  const calls = () => page.evaluate(() => (window as unknown as { __speechCalls: unknown[] }).__speechCalls);
  expect(await calls()).toEqual([]);
  await page.getByRole("button", { name: "triangle meghallgatása", exact: true }).click();
  // SpeechSynthesisUtterance.rate is stored by Chrome as a 32-bit float.
  expect(await calls()).toEqual([{ text: "triangle", lang: "en-GB", rate: Math.fround(.85) }]);
  await page.locator('.fusion-glossary input[type="range"]').fill("0.65");
  await page.getByRole("button", { name: "This is a triangle. meghallgatása", exact: true }).click();
  expect((await calls())[1]).toEqual({ text: "This is a triangle.", lang: "en-GB", rate: Math.fround(.65) });
});


test("all six palettes keep readable ink and complete worked examples", async ({ page }) => {
  const colors = new Set<string>();
  for (const theme of ["ocean", "forest", "sunset", "cosmos", "paper", "berry"]) {
    await page.goto(`/__lesson-runtime-probe?fusion=1&theme=${theme}`);
    await expect(page.getByText("Eredmény: 12 cm²", { exact: true })).toBeVisible();
    const palette = await page.locator("[data-experience]").evaluate(el => {
      const s = getComputedStyle(el);
      const luminance = (color: string) => {
        const rgb = color.match(/\d+/g)!.slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
      };
      const a = luminance(s.color), b = luminance(s.backgroundColor);
      return { color: s.backgroundColor, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
    expect(palette.contrast).toBeGreaterThanOrEqual(4.5);
    colors.add(palette.color);
  }
  expect(colors.size).toBe(6);
});

test("oral exercises remain usable without a microphone and actual touch drag orders steps", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
  });
  await page.goto("/__lesson-runtime-probe?fusion=1");
  await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
  await page.getByRole("button", { name: "Teljes feladatsor", exact: true }).click();
  expect(await page.getByText("Szóbeli gyakorlás", { exact: false }).count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Válasz diktálása" })).toHaveCount(0);
  const writtenAnswer = page.locator("[data-task-id] textarea").first();
  await writtenAnswer.fill("Gépeléssel is működik.");
  await expect(writtenAnswer).toHaveValue("Gépeléssel is működik.");
  await page.getByRole("tab", { name: "Módszerek", exact: true }).click();
  const methods = page.getByRole("tabpanel", { name: "Módszerek", exact: true });
  await methods.locator('[data-method="gate"]').first().getByRole("button").first().click();
  const sort = methods.locator('[data-method="sorting"]');
  await sort.scrollIntoViewIfNeeded();
  const cdp = await context.newCDPSession(page);
  for (const destination of [0, 1]) {
    const from = await sort.locator(".fusion-drag").last().boundingBox();
    const to = await sort.locator(".fusion-drag").nth(destination).boundingBox();
    if (!from || !to) throw new Error("Missing drag geometry");
    const x = from.x + from.width / 2, y = from.y + from.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: to.x + to.width / 2, y: to.y + to.height / 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await cdp.detach();
  await sort.getByRole("button", { name: "Sorrend ellenőrzése" }).click();
  await expect(sort.getByRole("status")).toContainText("Helyes sorrend");
});
