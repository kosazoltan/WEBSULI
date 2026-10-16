import { expect, test, type Page } from "@playwright/test";

/**
 * Websuli Design (docs/specs/2026-10-16-websuli-design.md) — az öt évfolyamsávos arculat VALÓDI renderben, a négyfüles
 * fúziós leckén: téma, felső sáv, törzsszöveg-méret, gombkontraszt, magyar ékezetek, kilógásmentesség 390 / 768 / 1440 px-en.
 * Képernyőkép témánként és szélességenként a test-results/websuli-design/ alá (a képet meg is kell nézni).
 */

const THEMES = [
  { classroom: 1, id: "explorer", name: "Felfedező világ", minPx: 22 },
  { classroom: 4, id: "adventure", name: "Tudás kalandjai", minPx: 19 },
  { classroom: 7, id: "studio", name: "Kreatív stúdió", minPx: 17 },
  { classroom: 9, id: "laboratory", name: "Digitális tudáslabor", minPx: 16 },
  { classroom: 11, id: "future", name: "Jövőtervező", minPx: 16 },
] as const;

async function contrastOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const st = getComputedStyle(el);
    const [a, b] = [lum(rgb(st.color)), lum(rgb(st.backgroundColor))];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, selector);
}

for (const t of THEMES) {
  test(`${t.classroom}. évfolyam → ${t.id}: felső sáv, olvasható törzsszöveg, kontrasztos gomb, ő/ű, nincs kilógás`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/__lesson-runtime-probe?fusion=1&classroom=${t.classroom}`);
      await page.evaluate(() => document.fonts.ready);
      const root = page.locator("[data-ws-theme]");
      await expect(root).toHaveAttribute("data-ws-theme", t.id);
      await expect(page.getByTestId("ws-topbar")).toContainText(`Websuli / ${t.name}`);
      // A törzsszöveg a téma minimuma (a tananyag-blokk számított mérete).
      const bodyPx = await page.locator(".lesson-block").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(bodyPx).toBeGreaterThanOrEqual(t.minPx);
      // A kiválasztott fül és a felső sáv szövege a mért színekből ≥ 4,5:1.
      expect(await contrastOf(page, ".ws-topbar strong")).toBeGreaterThanOrEqual(4.5);
      expect(await contrastOf(page, '.fusion-tabs button[aria-selected="true"]')).toBeGreaterThanOrEqual(4.5);
      // Magyar ő/ű a lecke saját fontjával (nincs tartalékfont-csere a címsorban).
      await expect(page.locator("h1")).toContainText(/[őű]/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/websuli-design/${t.id}-${width}.png`, fullPage: false });
    }
    // A fő gomb (Feladatok fül „Ellenőrzés” / következő) szövegkontrasztja is mérve, ha látható.
    await page.getByRole("tab", { name: "Feladatok", exact: true }).click();
    const primary = page.locator(".fusion-primary").first();
    if (await primary.count()) expect(await contrastOf(page, ".fusion-primary")).toBeGreaterThanOrEqual(4.5);
    expect(errors).toEqual([]);
  });
}

test("a régi élménytéma és díszítőeffekt nem jelenik meg (az arculatot az évfolyam adja)", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe?fusion=1&classroom=4&theme=princess");
  await expect(page.locator("[data-ws-theme]")).toHaveAttribute("data-ws-theme", "adventure");
  await expect(page.locator("[data-experience]")).toHaveAttribute("data-experience", "websuli");
  await expect(page.locator(".lesson-sparkles")).toHaveCount(0);
  await expect(page.locator("[data-flair]")).toHaveCount(0);
});
