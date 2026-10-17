import { expect, test, type Page } from "@playwright/test";

// Tananyaglista a NAT 2020 tanítási menetrendje szerint (docs/specs/2026-10-17-tanmenet-rendezes.md): a főoldal listája és az
// évfolyamválasztó a mai témát teszi előre; a „Most tanuljuk” jelölés a ±2 hétben; az illesztetlen anyag hátul.
test.use({ serviceWorkers: "block" });

// 2026-10-19 (hétfő) ≈ a tanév 0,18-ad része.
const NOW = new Date("2026-10-19T09:00:00");
const base = { userId: null, content: "", description: "" };
const FILES = [
  { ...base, id: "uj-illesztetlen", title: "Legújabb, tanmenet nélküli anyag", classroom: 5, createdAt: "2026-10-18T10:00:00Z", curriculum: null },
  { ...base, id: "evvege", title: "Év végi téma", classroom: 5, createdAt: "2026-10-17T10:00:00Z", curriculum: { pos: 0.93, label: "Év vége" } },
  { ...base, id: "mai", title: "A mai téma", classroom: 5, createdAt: "2025-01-01T10:00:00Z", curriculum: { pos: 0.19, label: "Matematika 5.: Törtek" } },
  { ...base, id: "multbeli", title: "Szeptemberi téma", classroom: 5, createdAt: "2025-01-02T10:00:00Z", curriculum: { pos: 0.05, label: "Szeptember" } },
  { ...base, id: "kozelgo", title: "Novemberi téma", classroom: 5, createdAt: "2025-01-03T10:00:00Z", curriculum: { pos: 0.27, label: "November" } },
  { ...base, id: "masik-evfolyam", title: "Nyolcadikos mai téma", classroom: 8, createdAt: "2025-01-04T10:00:00Z", curriculum: { pos: 0.2, label: "Fizika" } },
];

async function open(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.route("**/api/**", route => route.fulfill({ json: {} }));
  await page.route("**/api/auth/user", route => route.fulfill({ json: null }));
  await page.route("**/api/html-files", route => route.fulfill({ json: FILES }));
  await page.goto("/");
}
const order = (page: Page) => page.locator('[data-testid^="link-file-"]').evaluateAll(els => els.map(e => e.getAttribute("data-testid")!.replace("link-file-", "")));

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`tanmenet szerinti sorrend és „Most tanuljuk” jelölés ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await expect(page.getByText("A mai téma", { exact: true })).toBeVisible();
    // főoldal (Mind): a mai témák elöl (több évfolyamról), utána közelgő, múltbeli, év vége, végül az illesztetlen
    expect(await order(page)).toEqual(["mai", "masik-evfolyam", "kozelgo", "multbeli", "evvege", "uj-illesztetlen"]);
    await expect(page.getByTestId("badge-current-mai")).toHaveText("Most tanuljuk");
    await expect(page.getByTestId("badge-current-masik-evfolyam")).toBeVisible();
    await expect(page.getByTestId("badge-current-evvege")).toHaveCount(0);
    await expect(page.getByTestId("badge-current-uj-illesztetlen")).toHaveCount(0);

    // a tanuló belép az évfolyamába: ugyanaz a rendezőelv
    await page.getByTestId("button-filter-classroom-5").click();
    expect(await order(page)).toEqual(["mai", "kozelgo", "multbeli", "evvege", "uj-illesztetlen"]);

    // a jelölés nem okoz túlcsordulást
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    const badge = await page.getByTestId("badge-current-mai").boundingBox();
    const card = await page.getByTestId("link-file-mai").boundingBox();
    expect(badge!.x + badge!.width).toBeLessThanOrEqual(card!.x + card!.width);
    await page.screenshot({ path: `test-results/curriculum-order-${viewport.width}.png`, fullPage: false });
  });
}
