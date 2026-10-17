import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * Websuli ikonkészlet (docs/specs/2026-10-17-websuli-ikonkeszlet.md): a mentéskor rendelt `art.subjectIcon` ikont a lejátszó az
 * adatbázis-végpontról tölti; ha a leckében nincs ilyen mező, a katalógus-választás marad. Valódi render, 390 és 1440 px.
 */
test.use({ serviceWorkers: "block" });
const webp = readFileSync(new URL("../client/public/design/studio/cover-egyenlet.webp", import.meta.url));

test("a lecke saját ikonja az /api/design-assets végpontról töltődik be a tantárgy-címkében", async ({ page }) => {
  const requested: string[] = [];
  await page.route("**/api/design-assets/**", route => {
    requested.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 200, contentType: "image/webp", body: webp });
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/__lesson-runtime-probe?fusion=1&classroom=7&icon=icon-matematika-studio");
    const icon = page.locator(".lesson-chip .ws-subject-ico");
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute("src", "/api/design-assets/icon-matematika-studio");
    await expect.poll(() => icon.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/websuli-design/subject-icon-db-${width}.png` });
  }
  expect(requested).toContain("/api/design-assets/icon-matematika-studio");
});

test("art mező nélküli (régi) leckénél nincs adatbázis-kérés, a katalógus-ikon marad", async ({ page }) => {
  let hits = 0;
  await page.route("**/api/design-assets/**", route => { hits++; return route.abort(); });
  await page.goto("/__lesson-runtime-probe?fusion=1&classroom=7");
  await expect(page.locator(".lesson-chip").first()).toBeVisible();
  const icons = page.locator(".lesson-chip .ws-subject-ico");
  await expect(icons).toHaveCount(1);
  await expect(icons).toHaveAttribute("src", /^\/design\//);
  expect(hits).toBe(0);
});

test("más sávú mentett ikon (az évfolyam a mentés óta változott) nem töltődik be", async ({ page }) => {
  let hits = 0;
  await page.route("**/api/design-assets/**", route => { hits++; return route.abort(); });
  await page.goto("/__lesson-runtime-probe?fusion=1&classroom=7&icon=icon-matematika-future");
  await expect(page.locator(".lesson-chip").first()).toBeVisible();
  await expect(page.locator(".lesson-chip .ws-subject-ico")).toHaveAttribute("src", /^\/design\//);
  expect(hits).toBe(0);
});
