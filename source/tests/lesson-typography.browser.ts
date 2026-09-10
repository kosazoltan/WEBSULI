import { expect, test } from "@playwright/test";
import { HUNGARIAN_FONT_PROBE, LESSON_FONTS, withLessonTypography } from "../shared/lesson-typography";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync(new URL("../client/public/fonts/manifest.json", import.meta.url), "utf8")) as { fonts: Array<{ family: string; style: string; internalFamily: string; postScriptName: string }> };

for (const [width, height] of [[390, 844], [844, 390], [1440, 1000]]) {
  test(`Hungarian font files really render in Chrome at ${width}x${height}, without Google`, async ({ page, context }) => {
    await page.setViewportSize({ width, height });
    await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
    await page.goto("/__lesson-runtime-probe?fusion=1");
    await expect(page.getByRole("tab", { name: "Tananyag", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("[data-band]")).toHaveCSS("font-family", '"Source Sans 3", sans-serif');
    await page.screenshot({ path: `test-results/typography-lesson-${width}x${height}.png`, fullPage: false });
    const cards = LESSON_FONTS.map((font, fi) => `<article><div class="eyebrow">0${fi + 1} · ELLENŐRZÖTT MAGYAR KÉSZLET</div><h2 style='font-family:"${font}"'>${font}</h2>${["normal", "italic"].map((style, si) => [400, 600, 800].map(weight => `<p id="probe-${fi}-${si}-${weight}" style='font-family:"${font}";font-style:${style};font-weight:${weight}'>${HUNGARIAN_FONT_PROBE}</p>`).join("")).join("")}<div class="caption">Normál és dőlt · 400 / 600 / 800 · ő Ő ű Ű</div></article>`).join("");
    await page.setContent(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><link href="/fonts/lesson-fonts.css" rel="stylesheet"><style>
      *{box-sizing:border-box}body{margin:0;background:#f4f5f1;color:#1c3543;font-family:"Source Sans 3",sans-serif;padding:clamp(16px,4vw,50px)}main{max-width:1200px;margin:auto}.top{display:flex;gap:20px;justify-content:space-between;border-bottom:1px solid #cdd8d6;padding-bottom:20px;margin-bottom:32px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.12em;color:#316d66}h1{font-size:clamp(28px,5vw,48px);line-height:1.2;max-width:700px;margin:16px 0}h2{font-size:30px;margin:15px 0 25px;font-weight:600}.intro{max-width:650px;color:#4d6773;font-size:19px;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:32px}article{background:#fff;border:1px solid #d9e3df;border-top:4px solid #338378;border-radius:18px;padding:24px;min-width:0}article:nth-child(2){border-top-color:#4169b1}article:nth-child(3){border-top-color:#b87540}article p{font-size:20px;line-height:1.6;overflow-wrap:anywhere;border-bottom:1px solid #edf0ee;padding:10px 0}.caption{font-size:13px;color:#586c73}.pill{background:#e0eee7;padding:6px 12px;border-radius:20px;font-size:13px;white-space:nowrap;align-self:start}@media(max-width:950px){.grid{grid-template-columns:1fr}.top{flex-wrap:wrap}}
      </style></head><body><main><div class="top"><strong>WEBSULI / TIPOGRÁFIA</strong><span class="pill">Magyar karakterek · helyi betűfájlok</span></div><div class="eyebrow">OLVASHATÓSÁG, AMIRE ÉPÍTHETÜNK</div><h1>Az ő és az ű is<br>ugyanahhoz a betűhöz tartozik.</h1><p class="intro">Három gondosan összehangolt család. Barátságos tanulóoldalakhoz, tiszta magyarázatokhoz és elmélyült olvasáshoz.</p><div class="grid">${cards}</div></main></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const cdp = await context.newCDPSession(page);
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    for (const [fi, font] of LESSON_FONTS.entries()) for (const [si, style] of ["normal", "italic"].entries()) for (const weight of [400, 600, 800]) {
      const loaded = await page.evaluate(async ({ font, style, weight, text }) => (await document.fonts.load(`${style} ${weight} 20px "${font}"`, text)).length, { font, style, weight, text: HUNGARIAN_FONT_PROBE });
      expect(loaded).toBeGreaterThan(0);
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `#probe-${fi}-${si}-${weight}` });
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      expect(fonts.length).toBeGreaterThan(0);
      // CDP reports the binary family (e.g. Nunito ExtraLight). Variable instances
      // derive their own PostScript name, so nameID 6 is not their runtime identity.
      const artifact = manifest.fonts.find(f => f.family === font && f.style === style)!;
      expect(fonts.every(f => f.isCustomFont && f.familyName === artifact.internalFamily), JSON.stringify({font, style, weight, fonts})).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/typography-proof-${width}x${height}.png`, fullPage: true });
    // The actual HTML adapter must survive the production same-origin CSP too.
    await page.setContent(withLessonTypography(`<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'"></head><body><h1>${HUNGARIAN_FONT_PROBE}</h1><p id="combined">${HUNGARIAN_FONT_PROBE.normalize("NFD")}</p></body></html>`, 7));
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("h1")).toHaveCSS("font-family", '"Source Sans 3", serif');
    const current = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: current.root.nodeId, selector: "#combined" });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    const expected = manifest.fonts.find(f => f.family === "Source Sans 3" && f.style === "normal")!;
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every(f => f.isCustomFont && f.familyName === expected.internalFamily)).toBe(true);
  });
}
