import { expect, test } from "@playwright/test";

/**
 * Spec docs/specs/2026-10-19-evfolyam-arculat-lathato.md — valós renderben: a sávok háttere a saját színátmenet (és egymástól
 * különbözik), a régi, beragadt Csendes-nézet-érték nem színteleníti a leckét, a gomb az állapotot mutatja; 390 és 1440 px.
 * Képernyőkép sávonként: test-results/band-colors/.
 */
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => { await page.route("**/api/design-assets/**", (route) => route.fulfill({ status: 404, json: { message: "teszt" } })); });

const BANDS = [
  { classroom: 1, id: "explorer", from: "rgb(201, 237, 192)" },
  { classroom: 4, id: "adventure", from: "rgb(249, 217, 166)" },
  { classroom: 7, id: "studio", from: "rgb(217, 214, 255)" },
  { classroom: 9, id: "laboratory", from: "rgb(201, 227, 248)" },
  { classroom: 11, id: "future", from: "rgb(11, 26, 46)" },
] as const;

test("az öt sáv háttere a saját színátmenete, és mind különböző; nincs kilógás", async ({ page }) => {
  const seen = new Set<string>();
  for (const b of BANDS) for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/__lesson-runtime-probe?fusion=1&classroom=${b.classroom}`);
    const root = page.locator("[data-ws-theme]");
    await expect(root).toHaveAttribute("data-ws-theme", b.id);
    const img = await root.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(img, b.id).toContain("linear-gradient");
    expect(img, b.id).toContain(b.from);
    seen.add(img);
    // A kártyák tetején 4 px-es sávszínű csík (belső árnyék — az elrendezést nem tolja el), nem fehér-a-fehéren.
    const shadow = await page.locator(".lesson-block").first().evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toMatch(/inset/);
    expect(shadow).toMatch(/0px 4px 0px/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/band-colors/${b.id}-${width}.png` });
  }
  expect(seen.size).toBe(BANDS.length);
});

test("a régi, beragadt Csendes-nézet-érték nem színteleníti a leckét; a gomb az állapotot mutatja", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(() => localStorage.setItem("websuli:learning-quiet", "true"));
  await page.goto("/__lesson-runtime-probe?fusion=1&classroom=4");
  const root = page.locator("[data-ws-theme]");
  await expect(page.locator('.fusion-view[data-quiet="false"]')).toHaveCount(1);
  expect(await root.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("rgb(249, 217, 166)");
  const btn = page.getByTestId("learning-quiet");
  await expect(btn).toHaveText(/Csendes nézet/);
  await btn.click();
  await expect(btn).toHaveText(/Színes nézet/);
  // Review #320: a gomb a műveletet nevezi meg — nincs ellentmondó aria-pressed; az állapot a data-on.
  await expect(btn).not.toHaveAttribute("aria-pressed", /.*/);
  await expect(btn).toHaveAttribute("data-on", "true");
  await expect(root).toHaveCSS("background-color", "rgb(247, 246, 242)");
  // A bekapcsolt gomb tömör, látható kitöltésű (nem a halk háttér).
  const fill = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fill).toBe("rgb(56, 79, 104)");
  await page.screenshot({ path: "test-results/band-colors/quiet-on-390.png" });
  await btn.click();
  await expect(btn).toHaveText(/Csendes nézet/);
  expect(await root.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("rgb(249, 217, 166)");
});
