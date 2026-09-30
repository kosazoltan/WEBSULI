import { expect, test } from "@playwright/test";

/**
 * Spec 2026-09-30 (docs/specs/2026-09-30-abratervezo-3d.md): a forgatható 3D-jelenet VALÓDI renderben
 * (`?scene3d=1`, zikkurat a két folyó között) telefonon és asztalon: a vászon kirajzolódik, a feliratok a
 * vásznon belül vannak és nem fedik egymást, nincs vízszintes görgetősáv, a húzás valóban forgat.
 */

const VIEWPORTS = [360, 390, 1280] as const;

for (const width of VIEWPORTS) {
  test(`3D-jelenet: kirajzolódik, feliratok a vásznon belül, átfedés nélkül, húzásra forog (${width} px)`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/__lesson-runtime-probe?scene3d=1");
    const host = page.locator('figure[data-anim="scene3d"] [role="img"]');
    await host.scrollIntoViewIfNeeded();
    await expect(host.locator("canvas")).toBeVisible();
    // A feliratok a vetítés után jelennek meg (opacity 1); a kezdő forgatás megáll a húzásnál.
    await expect.poll(async () => host.locator('span[aria-hidden="true"]').evaluateAll((els) => els.filter((e) => (e as HTMLElement).style.opacity === "1").length)).toBeGreaterThanOrEqual(4);
    const report = await host.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const labels = [...el.querySelectorAll<HTMLElement>('span[aria-hidden="true"]')].filter((s) => s.style.opacity === "1").map((s) => ({ text: s.textContent ?? "", r: s.getBoundingClientRect() }));
      const outside = labels.filter((l) => l.r.left < box.left - 0.5 || l.r.right > box.right + 0.5 || l.r.top < box.top - 0.5 || l.r.bottom > box.bottom + 0.5).map((l) => l.text);
      const overlaps: string[] = [];
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i].r, b = labels[j].r;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push(`${labels[i].text} × ${labels[j].text}`);
      }
      return { outside, overlaps, width: box.width, height: box.height, hScroll: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(report.outside, "vásznon kívüli felirat").toEqual([]);
    expect(report.overlaps, "egymásra csúszó felirat").toEqual([]);
    expect(report.hScroll).toBe(false);
    expect(Math.round(report.height)).toBe(Math.round((report.width * 3) / 4));
    // Húzás: az alaphelyzetbe állítás után a kép a húzástól (és csak attól) változik.
    await page.getByRole("button", { name: "↻ Alaphelyzet" }).click();
    await page.waitForTimeout(300);
    const before = await host.screenshot();
    const b = (await host.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.45, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await host.screenshot();
    expect(Buffer.compare(before, after), "a húzás nem forgatta a jelenetet").not.toBe(0);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/abrak/scene3d-${width}.png`, fullPage: false });
  });
}
