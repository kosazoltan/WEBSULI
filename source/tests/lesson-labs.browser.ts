import { test, expect, type Locator } from "@playwright/test";
import type { Lesson } from "../shared/lesson-schema";

const lesson: Lesson = {
  title: "Háromszögek területe", subject: "matematika", classroom: 7, mapId: "lab-fixture", sourceOnly: true, misconceptions: [],
  sections: [{ heading: "Az alap és a magasság", probaEnabled: false, blocks: [
    { kind: "explain", depth: "core", readAloud: true, coversConceptIds: ["area"], text: "A háromszög területe az alap és a hozzá tartozó merőleges magasság szorzatának fele. Ha az alap 6 cm és a magasság 4 cm, a terület 12 cm²." },
    { kind: "animate", animKind: "triangleArea", params: { base: 6, height: 4, unit: "cm" }, caption: "Figyeld meg, mitől változik a háromszög területe!", coversConceptIds: ["area"] },
  ] }],
};

async function fullyVisible(locator: Locator, width: number, height: number) {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
  expect(box.height).toBeGreaterThanOrEqual(44);
  // A viewport-contained box can still be clipped by its scroll panel.
  expect(await locator.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const panel = el.closest(".triangle-lab-panel")?.getBoundingClientRect();
    return !panel || (rect.top >= panel.top && rect.bottom <= panel.bottom + 1);
  })).toBe(true);
}

for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
  test(`prediction, real geometry, keyboard and touch at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.route("**/tmp/lesson-fusion.json", r => r.fulfill({ json: lesson }));
    await page.goto("/__lesson-runtime-probe?candidate=1");
    const launch = page.getByRole("button", { name: "Kipróbálom a laborban" });
    await launch.click();
    const dialog = page.getByRole("dialog", { name: "Háromszög-labor" });
    await expect(dialog).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(dialog).toHaveCSS("font-family", '"Source Sans 3", sans-serif');
    const next = dialog.getByRole("button", { name: "Megvizsgálom", exact: true });
    await expect(next).toBeDisabled();
    for (const button of await dialog.getByRole("button").all()) await fullyVisible(button, width, height);
    await dialog.getByRole("button", { name: "Nő a terület", exact: true }).click();
    await next.click();
    await expect(dialog.locator("[data-lab-area]")).toContainText("12 cm²");
    const apex = dialog.getByRole("slider", { name: "Csúcs oldalirányú helyzete" });
    await fullyVisible(apex, width, height);
    await apex.focus(); await apex.press("Home");
    await expect(dialog.locator("[data-lab-area]")).toContainText("12 cm²");
    await expect(dialog.getByRole("img")).toHaveAccessibleName(/talppont az alap meghosszabbításán/);
    const altitude = dialog.getByRole("slider", { name: "Magasság", exact: true });
    await fullyVisible(altitude, width, height);
    await altitude.focus(); await altitude.press("End");
    await expect(dialog.locator("[data-lab-area]")).toContainText("18 cm²");
    const box = (await altitude.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(dialog.locator("[data-lab-area]")).toContainText("12 cm²");
    await fullyVisible(dialog.getByRole("button", { name: "Elmagyarázom" }), width, height);
    await page.screenshot({ path: `test-results/triangle-lab-${width}x${height}.png`, fullPage: false });
    await dialog.getByRole("button", { name: "Elmagyarázom" }).click();
    await expect(dialog).toContainText("A jóslatod: Nő a terület");
    await dialog.getByRole("textbox").fill("Az alap és a merőleges magasság határozza meg a területet.");
    await fullyVisible(dialog.getByRole("button", { name: "Összevetem a magyarázattal" }), width, height);
    await dialog.getByRole("button", { name: "Összevetem a magyarázattal" }).click();
    await expect(dialog).toContainText("kétszeres magassághoz kétszeres terület");
    await fullyVisible(dialog.getByRole("button", { name: "Vissza a leckéhez", exact: true }), width, height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(launch).toBeFocused();
    await launch.click();
    await expect(dialog.getByRole("textbox")).toHaveValue("Az alap és a merőleges magasság határozza meg a területet.");
    expect(errors).toEqual([]);
  });
}
