import { expect, test } from "@playwright/test";

// Spec: docs/specs/2026-10-18-admin-korszerusites.md — csoportos admin menü és olvasható keresőmező (valós render).
test.use({ serviceWorkers: "block" });

const luminance = (rgb: string) => {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`admin menü csoportokban, kereső olvasható ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/__admin-tabs-probe");
    const bar = page.getByTestId("admin-tab-groups");
    await expect(bar).toBeVisible();
    for (const label of ["Tananyagok", "Készítés és javítás", "Tanulók és levelek", "Rendszer és mentések"]) await expect(bar.getByText(label, { exact: true })).toBeVisible();
    const tabs = bar.getByRole("tab");
    // S4 (docs/specs/2026-10-18-tanuloi-profil-s4-vegrehajtas.md): a „Tanulók” fül — 16 fül (dokumentált spec-változás).
    await expect(tabs).toHaveCount(16);
    for (let i = 0; i < 16; i++) {
      const t = tabs.nth(i);
      await expect(t).toBeVisible();
      expect((await t.innerText()).trim().length, `${i}. fül felirata`).toBeGreaterThan(2);
      await expect(t.locator("svg")).toHaveCount(1);
    }
    await bar.getByTestId("tab-users").click();
    await expect(page.getByTestId("probe-active-tab")).toHaveText("users");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "nincs vízszintes túlcsordulás").toBeLessThanOrEqual(0);

    // A csoportfeliratok is AA-kontrasztosak (a studio-ui.spec mérése 70%-os átlátszóságnál 4,19-et talált).
    for (const id of ["materials", "authoring", "communication", "system"]) {
      const label = page.getByTestId(`admin-tab-group-${id}`).locator("span").first();
      const { fg, bgc } = await label.evaluate(el => {
        let n: Element | null = el; let bgc = "rgba(0, 0, 0, 0)";
        while (n && /rgba\(0, 0, 0, 0\)|transparent/.test(bgc)) { bgc = getComputedStyle(n).backgroundColor; n = n.parentElement; }
        return { fg: getComputedStyle(el).color, bgc };
      });
      const [a, b] = [luminance(fg), luminance(bgc)].sort((x, y) => y - x);
      expect((a + 0.05) / (b + 0.05), `${id} felirat kontrasztja ${fg} / ${bgc}`).toBeGreaterThanOrEqual(4.5);
    }

    const search = page.getByTestId("probe-admin-search");
    await search.fill("fehérl");
    const { color, bg } = await search.evaluate(el => { const s = getComputedStyle(el); return { color: s.color, bg: s.backgroundColor }; });
    const [l1, l2] = [luminance(color), luminance(bg)].sort((a, b) => b - a);
    expect((l1 + 0.05) / (l2 + 0.05), `kontraszt ${color} / ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
}
