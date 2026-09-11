import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { withLessonTypography } from "../shared/lesson-typography";
const story = { title: "A kertész döntése", start: "start", nodes: [
  { id: "start", text: "Szemléltető helyzet: a növény földje száraz. Mit teszel?", choices: [
    { label: "Meglocsolom", feedback: "A növénynek vízre van szüksége.", next: "water" },
    { label: "Sötétbe teszem", feedback: "A növény fényt is igényel.", next: "light" },
  ] },
  { id: "water", text: "A föld újra nedves.", choices: [], conclusion: "A növénynek vízre és fényre is szüksége van." },
  { id: "light", text: "Gondold át a fény szerepét!", choices: [], conclusion: "A sötétség nem pótolja a vizet." },
] };
const attr = (value: unknown) => JSON.stringify(value).replaceAll("&", "&amp;").replaceAll("'", "&#39;").replaceAll('"', "&quot;");
for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
  test(`production HTML shared interactions ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.route("**/interaction-proof", route => route.fulfill({ contentType: "text/html; charset=utf-8", headers: { "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:" }, body: withLessonTypography(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:16px}main{max-width:1000px;margin:auto;display:grid;gap:24px}</style></head><body><main><h1>Felfedező műhely · őŐűŰ</h1><div data-lesson-interaction="triangleArea" data-params='${attr({ base: 6, height: 4, unit: "cm" })}'></div><div data-lesson-interaction="decisionStory" data-params='${attr(story)}'></div></main></body></html>`, 4) }));
    await page.goto("/interaction-proof");
    await page.getByRole("button", { name: /Kipróbálom a laborban/ }).click();
    const lab = page.locator("dialog.triangle-lab");
    await lab.locator(".triangle-lab-choices button").first().click();
    await lab.getByRole("button", { name: "Megvizsgálom" }).click();
    const diagram = lab.getByRole("img"); const before = await diagram.getAttribute("aria-label");
    await lab.getByRole("slider", { name: "Csúcs oldalirányú helyzete" }).fill("1.4");
    await lab.getByRole("slider", { name: "Magasság", exact: true }).fill("1.5");
    await expect(diagram).not.toHaveAttribute("aria-label", before!);
    await lab.getByRole("button", { name: "Elmagyarázom" }).click();
    await lab.getByRole("button", { name: "Vissza a leckéhez", exact: true }).click();
    await page.getByRole("button", { name: "Végigjárom a történetet" }).click();
    const dialog = page.locator("dialog.decision-story");
    await dialog.getByRole("button", { name: "Meglocsolom" }).click();
    await expect(dialog.getByRole("status")).toContainText("vízre");
    const next = dialog.getByRole("button", { name: "Tovább", exact: true });
    const box = await next.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(await next.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    await next.click(); await dialog.getByRole("textbox").fill("Víz és fény is kell.");
    await dialog.getByRole("button", { name: "Összevetem a magyarázattal" }).click();
    await expect(dialog).toContainText("vízre és fényre");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir("../tmp/interaction-proof", { recursive: true });
    await page.screenshot({ path: `../tmp/interaction-proof/story-${viewport.width}.png` });
    await dialog.getByRole("button", { name: "Másik utat próbálok" }).click();
    await dialog.getByRole("button", { name: "Sötétbe teszem" }).click(); await next.click();
    await expect(dialog).toContainText("Gondold át");
    await dialog.getByRole("button", { name: "Vissza a leckéhez" }).click();
    expect(errors).toEqual([]);
  });
}
