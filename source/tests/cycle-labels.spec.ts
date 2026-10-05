import { expect, test } from "@playwright/test";

/**
 * Spec 2026-09-30 (docs/specs/2026-09-30-korforgas-felirat-utkozes.md) — a körforgás-ábra hosszú, kétsoros
 * fázisfeliratai VALÓDI renderben: a `?cycle-long=1` mérőlecke (Mezopotámia négy fázisa + hatfázisú
 * víz-körforgás). Mért hiba: 1280 px-en a felirat a számozott színes körre csúszott.
 */

const VIEWPORTS = [360, 390, 1280] as const;

for (const width of VIEWPORTS) {
  test(`körforgás hosszú feliratokkal: nincs felirat–kör átfedés, levágás, görgetősáv (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/__lesson-runtime-probe?cycle-long=1");
    await page.waitForSelector('figure[data-anim="cycle"] svg');
    const report = await page.evaluate(() => {
      const figures = [...document.querySelectorAll<HTMLElement>('figure[data-anim="cycle"]')].map((fig) => {
        const svg = fig.querySelector("svg")!;
        const box = svg.getBoundingClientRect();
        const scale = box.width / svg.viewBox.baseVal.width;
        const toScreen = (c: SVGCircleElement) => {
          const m = c.getScreenCTM()!;
          const p = new DOMPoint(c.cx.baseVal.value, c.cy.baseVal.value).matrixTransform(m);
          return { x: p.x, y: p.y, r: c.r.baseVal.value * m.a, phase: c.closest("[data-phase]")?.getAttribute("data-phase") ?? null, fill: c.getAttribute("fill") };
        };
        const circles = [...svg.querySelectorAll("circle")].map(toScreen);
        const texts = [...svg.querySelectorAll("text")].map((t) => ({
          text: t.textContent ?? "", r: t.getBoundingClientRect(), px: parseFloat(getComputedStyle(t).fontSize) * scale,
          phase: t.closest("[data-phase]")?.getAttribute("data-phase") ?? null,
        }));
        const words = texts.filter((t) => !/^\d+$/.test(t.text));
        const hits: string[] = [];
        for (const t of words) for (const c of circles) {
          const nx = Math.max(t.r.left, Math.min(c.x, t.r.right)), ny = Math.max(t.r.top, Math.min(c.y, t.r.bottom));
          if (Math.hypot(nx - c.x, ny - c.y) < c.r - 1) hits.push(`„${t.text}” × kör (${c.phase ?? "közép"}, ${c.fill})`);
        }
        const clipped = texts.filter((t) => t.r.left < box.left - 0.5 || t.r.right > box.right + 0.5 || t.r.top < box.top - 0.5 || t.r.bottom > box.bottom + 0.5).map((t) => t.text);
        const overlaps: string[] = [];
        for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i].r, b = texts[j].r;
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push(`${texts[i].text} × ${texts[j].text}`);
        }
        // E3: a fázisfelirat legközelebbi fázis-köre a sajátja (a fő kör: a csoport első köre).
        const nodes = new Map<string, { x: number; y: number }>();
        for (const c of circles) if (c.phase !== null && !nodes.has(c.phase)) nodes.set(c.phase, c);
        const strays: string[] = [];
        for (const t of words) {
          if (t.phase === null) continue;
          const mx = (t.r.left + t.r.right) / 2, my = (t.r.top + t.r.bottom) / 2;
          let best = "", bestD = Infinity;
          for (const [phase, n] of nodes) { const d = Math.hypot(n.x - mx, n.y - my); if (d < bestD) { bestD = d; best = phase; } }
          if (best !== t.phase) strays.push(`„${t.text}” (${t.phase}) → ${best}`);
        }
        return { hits, clipped, overlaps, strays, phases: nodes.size, minPx: Math.min(...texts.map((t) => t.px)) };
      });
      return { figures, hScroll: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(report.figures.length).toBe(2);
    expect(report.hScroll).toBe(false);
    for (const [i, f] of report.figures.entries()) {
      expect(f.hits, `${i + 1}. ábra: felirat a körön`).toEqual([]);
      expect(f.clipped, `${i + 1}. ábra: levágott felirat`).toEqual([]);
      expect(f.overlaps, `${i + 1}. ábra: egymásra csúszó felirat`).toEqual([]);
      expect(f.strays, `${i + 1}. ábra: felirat nem a saját köre mellett`).toEqual([]);
      expect(f.minPx, `${i + 1}. ábra: legkisebb betű`).toBeGreaterThanOrEqual(11.5);
    }
    await page.screenshot({ path: `test-results/abrak/cycle-long-${width}.png`, fullPage: true });
  });
}
