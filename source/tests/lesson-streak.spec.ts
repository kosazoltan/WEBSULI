import { expect, test, type Page } from "@playwright/test";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { balancedLayouts, choiceSeed } from "../shared/option-order";

/** V5c (docs/specs/2026-11-25-v5c-sorozatjelveny.md): a sorozatjelvény a kvíz végén — csak kapcsolóval (teszt-buildben ablak-kampó). */
test.use({ serviceWorkers: "block" });
const KEY = "websuli:lesson-streak:v1";

async function mock(page: Page, opts: { on: boolean; seed?: unknown }) {
  await page.addInitScript(([on, key, seed]) => {
    if (on) (window as unknown as { __websuliStreakBadge?: boolean }).__websuliStreakBadge = true;
    if (seed && !sessionStorage.getItem("seeded")) { localStorage.setItem(key as string, JSON.stringify(seed)); sessionStorage.setItem("seeded", "1"); }
  }, [opts.on, KEY, opts.seed ?? null] as const);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/lessons/lesson-q/results") return route.fulfill({ status: 202, json: { queued: true } });
    if (path === "/api/auth/user") return route.fulfill({ json: null });
    if (path === "/api/csrf-token") return route.fulfill({ json: { csrfToken: "test" } });
    if (path === "/api/html-files/quiz-fixture") return route.fulfill({ json: { id: "quiz-fixture", title: "Lecke", contentType: "lesson", classroom: 7 } });
    if (path === "/api/lessons/by-file/quiz-fixture") return route.fulfill({ json: { lessonId: "lesson-q", version: 1, lesson: fusionFixture() } });
    if (path.startsWith("/api/design-assets/")) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: [] });
  });
}

/** A kvíz mind a 25 kérdése: `wrong` darab rossz, a többi jó válasz. */
async function play(page: Page, wrong: number) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/quiz-fixture");
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  const quiz = page.locator("[data-quiz-id]");
  await expect(quiz).toHaveCount(25);
  const bank = fusionFixture().experience!.quiz;
  const round = (await quiz.evaluateAll(els => els.map(el => el.getAttribute("data-quiz-id")!))).map(id => bank.find(q => q.id === id)!);
  const layouts = balancedLayouts(round);
  const correctAt = (n: number) => layouts.get(choiceSeed(round[n].question, round[n].options))!.indexOf(round[n].correctIndex);
  for (let i = 0; i < 25; i++) {
    const at = i < wrong ? (correctAt(i) + 1) % round[i].options.length : correctAt(i);
    await quiz.nth(i).getByRole("button").nth(at).click();
  }
}
const band = (page: Page) => page.getByRole("status", { name: "Leckesorozat" });

test("V5c: KI kapcsolónál nincs sorozatsáv és nincs tárolt kulcs", async ({ page }) => {
  await mock(page, { on: false });
  await play(page, 0);
  await expect(page.locator(".fusion-quiz").first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(band(page)).toHaveCount(0);
  expect(await page.evaluate(k => localStorage.getItem(k), KEY)).toBeNull();
});

test("V5c: két jó lecke után a harmadik jó lecke Bronz jelvényt ad; újratöltés után sem számít kétszer", async ({ page }) => {
  await mock(page, { on: true, seed: { count: 2, last: "masik-lecke", rounds: ["x|1", "y|1"] } });
  await play(page, 0);
  await expect(band(page)).toContainText("Sorozat: 3 jó lecke egymás után");
  await expect(band(page)).toContainText("Bronz");
  await expect(band(page)).toContainText("Még 2 az Ezüst jelvényig");
  await page.reload();
  await page.getByRole("tab", { name: "Kvíz", exact: true }).click();
  await expect(band(page)).toContainText("Sorozat: 3 jó lecke egymás után");
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).count, KEY)).toBe(3);
});

test("V5c: 80 % alatti kör nullázza a sorozatot, a sáv ezt mondja", async ({ page }) => {
  await mock(page, { on: true, seed: { count: 4, last: "masik-lecke", rounds: ["x|1"] } });
  await play(page, 6);
  await expect(band(page)).toContainText("A sorozat újraindul");
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).count, KEY)).toBe(0);
});
