import { expect, test, type Page } from "@playwright/test";

/**
 * Websuli Design (docs/specs/2026-10-16-websuli-design.md) — az öt évfolyamsávos arculat VALÓDI renderben, a négyfüles
 * fúziós leckén: téma, felső sáv, törzsszöveg-méret, gombkontraszt, magyar ékezetek, kilógásmentesség 390 / 768 / 1440 px-en.
 * Képernyőkép témánként és szélességenként a test-results/websuli-design/ alá (a képet meg is kell nézni).
 */

const THEMES = [
  { classroom: 1, id: "explorer", name: "Felfedező világ", minPx: 22, motto: "Kíváncsiság • Játék • Alapok" },
  { classroom: 4, id: "adventure", name: "Tudás kalandjai", minPx: 19, motto: "Fedezz fel • Próbáld ki • Fejlődj" },
  { classroom: 7, id: "studio", name: "Kreatív stúdió", minPx: 17, motto: "Gondolkodj • Alkoss • Oldj meg" },
  { classroom: 9, id: "laboratory", name: "Digitális tudáslabor", minPx: 16, motto: "Elemezz • Kísérletezz • Valósítsd meg" },
  { classroom: 11, id: "future", name: "Jövőtervező", minPx: 16, motto: "Tudás • Célok • Lehetőségek" },
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
      // Dokumentált spec-változás (docs/specs/2026-10-17-websuli-lecke-hos.md): a felső sáv helyett sávfejléc — téma neve és mottó.
      await expect(page.getByTestId("ws-bandhead")).toContainText(t.name);
      await expect(page.getByTestId("ws-bandhead")).toContainText(t.motto);
      // A törzsszöveg a téma minimuma (a tananyag-blokk számított mérete).
      const bodyPx = await page.locator(".lesson-block").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(bodyPx).toBeGreaterThanOrEqual(t.minPx);
      // Review #267: a tényleges tananyagszöveg (bekezdések, összefoglaló kártyák, kérdéscím) is legalább a téma minimuma.
      const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll(".lesson-block p:not(.fusion-eyebrow), .lesson-block li, .lesson-recap-card, .fusion-view h3")]
        .filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => parseFloat(getComputedStyle(el).fontSize))));
      expect(smallest).toBeGreaterThanOrEqual(t.minPx);
      // A kiválasztott fül és a felső sáv szövege a mért színekből ≥ 4,5:1.
      // Review #267: a sávot a saját tömör hátterével mérjük (a <strong> háttere átlátszó lenne).
      // A sávfejléc háttere színátmenet: a cím–háttér párokat (title/soft, title/panel) a lesson-design.test.ts méri.
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

// Review #267: élmény (borítóábra) nélküli leckén a fejléc nem hagy üres oszlopot, az embléma látszik.
test("borítóábra nélküli lecke: nincs üres második fejlécoszlop, az embléma látható", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/__lesson-runtime-probe?classroom=7");
  // Dokumentált spec-változás (docs/specs/2026-10-17-websuli-lecke-hos.md): az élmény nélküli lecke is kaphat képet a katalógusból.
  // A review #267 védelme marad: nincs üres fejlécoszlop — vagy a kép, vagy az embléma látszik, és a cím kitölti a kártyát.
  await page.locator(".lesson-hero h1").waitFor();
  const hasArt = await page.locator(".lesson-hero .ws-art").count();
  if (hasArt) await expect(page.locator(".lesson-hero .ws-art > img")).toBeVisible();
  // Review #273: kép híján a rajzos tartalék (LessonCoverArt) áll a kép helyén — üres oszlop sosem marad.
  else await expect(page.locator(".lesson-hero .lesson-cover-art")).toBeVisible();
  const cols = await page.locator(".lesson-hero").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(cols).toBe(1);
  const h1w = await page.locator(".lesson-hero h1").evaluate((el) => el.getBoundingClientRect().width);
  const herow = await page.locator(".lesson-hero").evaluate((el) => el.getBoundingClientRect().width);
  expect(h1w).toBeGreaterThan(herow * 0.6);
});

// Review #267: a Csendes nézet a témás leckén is tompít (a sötét 11–12. o. téma is világos, halk felületre vált).
test("Csendes nézet: a témás lecke a halk palettára vált", async ({ page }) => {
  await page.goto("/__lesson-runtime-probe?fusion=1&classroom=11");
  const root = page.locator("[data-ws-theme]");
  const before = await root.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.locator(".learning-quiet").first().click();
  await expect(page.locator('.fusion-view[data-quiet="true"]')).toHaveCount(1);
  await expect(root).toHaveCSS("background-color", "rgb(247, 246, 242)");
  expect(before).not.toBe("rgb(247, 246, 242)");
});

// Websuli lecke-hős (docs/specs/2026-10-17-websuli-lecke-hos.md): a katalógusból választott kép betölt, alt szöveggel; kabala csak 1–5.
for (const t of THEMES) {
  test(`${t.classroom}. évfolyam → ${t.id}: a lecke-hős képe a katalógusból, a kabala csak 1–5. évfolyamon`, async ({ page }) => {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/__lesson-runtime-probe?fusion=1&classroom=${t.classroom}`);
      const art = page.locator(".ws-art > img, .lesson-cover-art").first();
      await expect(art).toBeVisible();
      const loaded = await page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>(".ws-art img")].every(i => i.complete && i.naturalWidth > 0 && i.closest(".ws-mascot") ? true : i.complete && i.naturalWidth > 0 && i.alt.length > 0));
      expect(loaded).toBe(true);
      const mascot = await page.locator(".ws-mascot").count();
      // A portré nem ismétli a rókát, ha a kép maga is a kabalát mutatja (data-kabala).
      const kabalaInPicture = await page.locator(".ws-art[data-kabala]").count();
      if (t.classroom <= 5 && await page.locator(".ws-art").count() && !kabalaInPicture) expect(mascot).toBe(1); else expect(mascot).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/websuli-design/hero-${t.id}-${width}.png` });
    }
  });
}
