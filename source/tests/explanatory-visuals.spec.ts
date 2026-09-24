import { expect, test } from "@playwright/test";

/**
 * Spec 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md, 1. szelet) — a magyarázó ábrák
 * VALÓDI renderben: a `?visuals=1` mérőlecke öt ábrája (holdciklus, kiskockás téglatest, átlagár,
 * halmazok, kerekítés) telefonon és asztalon. Mért hibák a fejlesztéskor: kilógó oldalcímke,
 * egymásra csúszó kétsoros felirat, 9 px-es betű, az átlag-felirat a „480” fölött, levágott „1452”.
 */

const VIEWPORTS = [360, 390, 1280] as const;

for (const width of VIEWPORTS) {
  test(`magyarázó ábrák: nincs levágás, átfedés, görgetősáv; betű ≥ 12 px (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/__lesson-runtime-probe?visuals=1");
    await page.waitForSelector('figure[data-anim="cycle"] svg');
    const report = await page.evaluate(() => {
      const figures = [...document.querySelectorAll<HTMLElement>("figure[data-anim]")].map((fig) => {
        const svg = fig.querySelector("svg")!;
        const box = svg.getBoundingClientRect();
        const scale = box.width / svg.viewBox.baseVal.width;
        const texts = [...svg.querySelectorAll("text")].map((t) => ({ text: t.textContent ?? "", r: t.getBoundingClientRect(), px: parseFloat(getComputedStyle(t).fontSize) * scale }));
        const clipped = texts.filter((t) => t.r.left < box.left - 0.5 || t.r.right > box.right + 0.5 || t.r.top < box.top - 0.5 || t.r.bottom > box.bottom + 0.5).map((t) => t.text);
        const overlaps: string[] = [];
        for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i].r, b = texts[j].r;
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push(`${texts[i].text} × ${texts[j].text}`);
        }
        return { kind: fig.dataset.anim, clipped, overlaps, minPx: Math.min(...texts.map((t) => t.px)) };
      });
      return { figures, hScroll: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(report.figures.map((f) => f.kind)).toEqual(["cycle", "labeledShape", "barChart", "venn", "numberLine"]);
    expect(report.hScroll).toBe(false);
    for (const f of report.figures) {
      expect(f.clipped, `${f.kind}: levágott felirat`).toEqual([]);
      expect(f.overlaps, `${f.kind}: egymásra csúszó felirat`).toEqual([]);
      expect(f.minPx, `${f.kind}: legkisebb betű`).toBeGreaterThanOrEqual(11.5);
    }
    // A holdfázisok valóban rajzolódnak: 8 fázisból 7 megvilágított (az újhold sötét).
    expect(await page.locator('figure[data-anim="cycle"] path[fill="#facc15"]').count()).toBe(7);
    await page.screenshot({ path: `test-results/abrak/visuals-${width}.png`, fullPage: true });
  });
}
