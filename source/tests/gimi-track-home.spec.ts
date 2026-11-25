import { expect, test, type Page } from "@playwright/test";

/**
 * 6-osztályos gimnáziumi felvételi csoport a főoldalon (docs/specs/2026-11-24-gimi-felveteli-csoport.md; #1986):
 * külön „Gimi felv.” csip a „Prog.” mellett; kiválasztva csak a csoport anyagai; a „6.” csipnél a többi 6. osztályossal együtt;
 * a hozzárendelt fióknál kiemelt (csillag, „Neked”), vendégnél nem.
 */
test.use({ serviceWorkers: "block" });

const now = new Date().toISOString();
const FILES = [
  { id: "g-math", title: "Gimi felvételi — törtek és arányok", content: "", description: null, classroom: 6, tracks: ["gimi6"], contentType: "lesson", createdAt: now, subject: "matematika" },
  { id: "g-hun", title: "Gimi felvételi — szövegértés", content: "", description: null, classroom: 6, tracks: ["gimi6"], contentType: "lesson", createdAt: now, subject: "magyar" },
  { id: "plain-6", title: "Sima 6. osztályos lecke", content: "", description: null, classroom: 6, tracks: [], contentType: "lesson", createdAt: now, subject: "termeszettudomany" },
  { id: "prog", title: "Programozás alapjai", content: "", description: null, classroom: 0, tracks: [], contentType: "lesson", createdAt: now, subject: "informatika" },
  { id: "plain-4", title: "4. osztályos lecke", content: "", description: null, classroom: 4, tracks: [], contentType: "lesson", createdAt: now, subject: "matematika" },
];

async function open(page: Page, mine: string[]) {
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/auth/user", (route) => route.fulfill({ json: null }));
  await page.route("**/api/tracks/mine", (route) => route.fulfill({ json: { tracks: mine } }));
  await page.route("**/api/html-files", (route) => route.fulfill({ json: FILES }));
  await page.goto("/");
}
const shown = (page: Page) => page.locator('[data-testid^="link-file-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.replace("link-file-", "")).sort());

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
  test(`„Gimi felv.” csip: a Prog. mellett, csak a csoport anyagai; a 6. osztályban is (${viewport.width})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, []);
    const chip = page.getByTestId("button-filter-track-gimi6");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText(/Gimi felv\./);
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(chip).not.toHaveAttribute("data-assigned", "true");
    // közvetlenül a „Prog.” után
    const prog = (await page.getByTestId("button-filter-classroom-0").boundingBox())!;
    const c = (await chip.boundingBox())!;
    const grade1 = page.locator('[data-testid^="button-filter-classroom-"]').nth(1);
    expect(c.x > prog.x || c.y > prog.y, "a csip a Prog. után").toBe(true);
    expect(await grade1.evaluate((el, chipEl) => !!(chipEl && (el.compareDocumentPosition(chipEl) & Node.DOCUMENT_POSITION_PRECEDING)), await chip.elementHandle()), "a csip az évfolyamok előtt").toBe(true);

    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("button-filter-all")).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => shown(page)).toEqual(["g-hun", "g-math"]);

    await page.getByTestId("button-filter-classroom-6").click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => shown(page)).toEqual(["g-hun", "g-math", "plain-6"]);

    await page.getByTestId("button-filter-all").click();
    await expect.poll(async () => (await shown(page)).length).toBe(FILES.length);
  });
}

test("a hozzárendelt fióknál a csip kiemelt (csillag, „Neked”)", async ({ page }) => {
  await open(page, ["gimi6"]);
  const chip = page.getByTestId("button-filter-track-gimi6");
  await expect(chip).toHaveAttribute("data-assigned", "true");
  await expect(chip).toHaveAccessibleName(/Neked/);
  await expect(chip.locator("svg")).toHaveCount(1);
});
