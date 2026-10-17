import { expect, test } from "@playwright/test";

/**
 * Arculati bank S2–S3 (docs/specs/2026-10-17-arculati-bank-s2-vegrehajtas.md, review #279): minden blokktípus fejlécében a sáv
 * jelzője (a mozgókép és a próba is); a kabalapóz 64 px, keskeny kijelzőn a cím fölött. A végpont 404 → katalógus-tartalék.
 */
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => { await page.route("**/api/design-assets/**", r => r.fulfill({ status: 404, json: {} })); });

test("a próbalecke minden blokktípusa (példa, ellenőrzés, mozgókép, próba) sávjelzőt kap", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/__lesson-runtime-probe?classroom=7");
  await expect(page.locator(".lesson-block-head").first()).toBeVisible();
  await expect.poll(async () => (await page.locator("img.ws-block-marker").evaluateAll(els => [...new Set(els.map(e => (e.getAttribute("src") ?? "").replace(/^.*marker-([a-z]+)-studio.*$/, "$1")))])).sort())
    .toEqual(expect.arrayContaining(["animate", "check", "example", "try"]));
  const ok = await page.locator("img.ws-block-marker").evaluateAll(els => els.every(e => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0));
  expect(ok, "minden jelzőkép betöltött (katalógus-tartalék)").toBe(true);
});

test("1–5. évfolyam: a fejezetkabala 64 px; keskeny kijelzőn a cím fölött, külön sorban", async ({ page }) => {
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/__lesson-runtime-probe?classroom=4");
    const mascot = page.locator(".ws-section-mascot img").first();
    await expect(mascot).toBeVisible();
    const box = await mascot.boundingBox();
    expect(Math.round(box!.width)).toBe(64);
    const above = await page.locator(".ws-section-mascot").first().evaluate(el => {
      const title = el.parentElement!.querySelector(".lesson-chapter-title")!.getBoundingClientRect();
      return el.getBoundingClientRect().bottom <= title.top + 1;
    });
    expect(above, `${width}: a kabala a cím fölött`).toBe(width <= 480);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});
