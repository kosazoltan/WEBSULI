import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { MOBILE_VIEWPORTS, measureOverflow } from "./support/game-mobile-quality";

/**
 * Kanban #50 — a szóbank LEGHOSSZABB játék-alakú hiányos mondata (`clozeStyle: "game"`, `?q=cloze-game`) a közös
 * kérdés-sávban: mindhárom mobilnézetben koppintás nélkül végigolvasható („Mutasd” nélkül), nem lóg ki, és a hibás
 * válasz utáni megoldás-kijelzés is rendben van. Képernyőkép: `testInfo.outputPath()`, és ha a `PLAY_LAB_SHOT_DIR`
 * meg van adva, oda is (JPEG 70, CSS-pixel).
 */

test.use({ serviceWorkers: "block" });

type LabWindow = { __websuliGame?: { forceState: (p: Record<string, unknown>) => void; probe?: () => { questionOpen: number } } };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const vp = page.viewportSize();
  const file = `${name}-${vp?.width ?? 0}x${vp?.height ?? 0}.jpg`;
  await page.screenshot({ path: testInfo.outputPath(file), type: "jpeg", quality: 70 });
  const dir = process.env.PLAY_LAB_SHOT_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, file), type: "jpeg", quality: 70, scale: "css" });
  }
}

for (const vp of MOBILE_VIEWPORTS) {
  test(`a leghosszabb játék-alakú cloze ${vp.width}×${vp.height}: koppintás nélkül olvasható, nem lóg ki`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/__play-lab?auto=1&seed=42&slow=0.5&q=cloze-game");
    await page.waitForFunction(() => typeof (window as unknown as LabWindow).__websuliGame?.probe === "function", undefined, { timeout: 20_000 });
    await expect
      .poll(async () => {
        await page.evaluate(() => (window as unknown as LabWindow).__websuliGame!.forceState({ question: true }));
        return page.evaluate(() => (window as unknown as LabWindow).__websuliGame!.probe!().questionOpen);
      }, { timeout: 15_000 })
      .toBe(1);
    const root = page.getByTestId("play-question");
    const prompt = page.getByTestId("play-question-prompt");
    await expect(prompt).toContainText("_____ des Menschen besteht aus über zweihundert Knochen.");
    await expect(prompt).not.toContainText("Magyarul");
    await expect(root.locator(".play-question-option").first()).toBeVisible();
    await page.waitForTimeout(250);
    // Koppintás nélkül végigolvasható: nincs „Mutasd”, a szöveg nem vágódik le és nem lóg ki.
    await expect(page.getByTestId("play-question-more")).toHaveCount(0);
    const clip = await prompt.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, sw: e.scrollWidth, cw: e.clientWidth }));
    expect(clip.sh, "a prompt függőlegesen nincs levágva").toBeLessThanOrEqual(clip.ch + 1);
    expect(clip.sw, "a prompt vízszintesen nem lóg ki").toBeLessThanOrEqual(clip.cw + 1);
    const card = await page.locator(".play-question-card").boundingBox();
    expect(card).not.toBeNull();
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.y).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(vp.width + 1);
    expect(card!.y + card!.height).toBeLessThanOrEqual(vp.height + 1);
    const ov = await measureOverflow(page);
    expect(ov.x, "nincs vízszintes görgetés").toBeLessThanOrEqual(2);
    await shot(page, testInfo, "cloze-game-question");
    // Hibás válasz → megoldás-kijelzés (a helyes opció kiemelve), nincs blokkoló párbeszéd.
    await root.locator('[data-correct="false"]').first().click();
    await expect(root).toHaveAttribute("data-state", "reveal");
    await expect(root.locator('[data-state="correct"]')).toHaveCount(1);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await page.waitForTimeout(300);
    await shot(page, testInfo, "cloze-game-wrong");
  });
}
