import { test, expect } from "@playwright/test";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";

/**
 * Tulajdonosi jelzés (2026-10-01, telefon-képernyőkép): a lecke alatti admin „Tananyag javítása” panel címe szinte
 * olvashatatlan. Gyökérok: a `bg-card` kártyán nem volt saját szövegszín (`text-card-foreground`), a cím a lecke-oldal
 * örökölt szövegszínét kapta. A mérés a kirajzolt (számított) szín és a kártya háttere közti WCAG-kontraszt.
 *
 * Review #172: az alkalmazás nem kapcsolja be a Tailwind `.dark` osztályt (nincs témaváltó, a kliens nem képezi le az
 * OS-preferenciát) — a felhasználónál előforduló két állapot az OS világos/sötét preferenciája; ezt a kettőt méri a teszt.
 */
const srgb = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]: number[]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const rgb = (css: string) => (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 4).map(Number);

test.use({ serviceWorkers: "block" });
for (const mode of ["light", "dark"] as const) {
  test(`a „Tananyag javítása” cím olvasható (OS ${mode} preferencia)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/user") return route.fulfill({ json: { id: "admin-fixture", isAdmin: true, firstName: "Admin" } });
      if (path === "/api/config") return route.fulfill({ json: { baseUrl: "http://localhost", materialOrigin: "" } });
      if (path === "/api/html-files/repair-fixture") return route.fulfill({ json: { id: "repair-fixture", title: "Háromszög", contentType: "lesson" } });
      if (path === "/api/lessons/by-file/repair-fixture") return route.fulfill({ json: { lessonId: "repair-lesson", version: 1, lesson: compactFusionFixture() } });
      return route.fulfill({ json: [] });
    });
    await page.goto("/preview/repair-fixture");
    const title = page.locator("#lesson-repair-title");
    await expect(title).toBeVisible();
    await title.scrollIntoViewIfNeeded();
    const colors = await title.evaluate((el) => {
      let card: Element | null = el;
      while (card && getComputedStyle(card).backgroundColor.match(/rgba?\(0, 0, 0, 0\)|transparent/)) card = card.parentElement;
      return { fg: getComputedStyle(el).color, bg: card ? getComputedStyle(card).backgroundColor : "" };
    });
    const [a, b] = [lum(rgb(colors.fg)), lum(rgb(colors.bg))].sort((x, y) => y - x);
    const contrast = (a + 0.05) / (b + 0.05);
    expect(contrast, `cím ${colors.fg} a ${colors.bg} háttéren`).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `test-results/repair-panel-${mode}.png` });
  });
}
