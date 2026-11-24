import { expect, test, type Locator, type Page } from "@playwright/test";

import { setAdventTime } from "./support/advent-e2e";
import { measureOverflow } from "./support/game-mobile-quality";

/**
 * Főoldal felső régiójának elrendezése (tulajdonosi kérés 2026-11-24, feladat #1984):
 * a támogatói kártya négyzetes csempeként a Hero MELLÉ kerül (a Hero ennyivel keskenyebb), alatta az adventi naptár,
 * alatta a „Szia! Hogy hívnak?” kártya, majd EGY sorban, teljes szélességben az osztályválasztó + kereső + nézetváltó.
 * Telefonon minden egymás alá kerül, vízszintes görgetés nélkül.
 */
test.use({ serviceWorkers: "block" });

const DEC3 = "2026-12-03T10:00:00Z";
const bb = async (l: Locator) => (await l.first().boundingBox())!;
const contentBox = async (page: Page) => {
  const c = page.locator(".container").first();
  const box = (await c.boundingBox())!;
  const pad = await c.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft) + parseFloat(getComputedStyle(el).paddingRight));
  return { x: box.x, width: box.width - pad };
};

test.describe("asztal 1440×900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("támogatói csempe a Hero mellett, alatta advent, Szia, majd egy sorban szűrő + kereső + nézet", async ({ page }) => {
    await setAdventTime(page, DEC3);
    await page.goto("/");
    await expect(page.getByTestId("advent-home-card")).toBeVisible();
    await expect(page.getByTestId("welcome-ask")).toBeVisible();

    const hero = await bb(page.locator("header.hero-bar"));
    const sponsor = await bb(page.getByTestId("sponsor-bar"));
    const content = await contentBox(page);

    // 1. a csempe a Hero jobb oldalán, egy sorban vele
    expect(sponsor.x, "a támogatói csempe a Hero jobb oldalán").toBeGreaterThanOrEqual(hero.x + hero.width - 1);
    expect(Math.abs(sponsor.y - hero.y), "a csempe és a Hero teteje egy vonalban").toBeLessThanOrEqual(4);
    expect(Math.abs(sponsor.height - hero.height), "a csempe és a Hero azonos magasságú").toBeLessThanOrEqual(4);
    expect(hero.width, "a Hero keskenyebb a teljes sávnál").toBeLessThan(content.width - sponsor.width);
    expect(sponsor.x + sponsor.width, "a sor kitölti a tartalomsávot").toBeGreaterThanOrEqual(content.x + content.width - 24);
    // négyzetes csempe: oldalarány 0,8–1,6
    const ratio = sponsor.width / sponsor.height;
    expect(ratio, `a csempe oldalaránya ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(0.8);
    expect(ratio).toBeLessThanOrEqual(1.6);
    // mindkét támogatói logó a csempén belül
    for (const logo of await page.locator("[data-testid=sponsor-bar] a").all()) {
      const l = await bb(logo);
      expect(l.x).toBeGreaterThanOrEqual(sponsor.x - 1);
      expect(l.x + l.width).toBeLessThanOrEqual(sponsor.x + sponsor.width + 1);
    }

    // 2. sorrend: Hero-sor → advent → Szia → eszközsor
    const advent = await bb(page.getByTestId("advent-home-card"));
    const welcome = await bb(page.getByTestId("welcome-ask"));
    const toolbar = await bb(page.getByTestId("home-toolbar"));
    expect(advent.y, "az advent a Hero-sor alatt").toBeGreaterThanOrEqual(Math.max(hero.y + hero.height, sponsor.y + sponsor.height));
    expect(welcome.y, "a Szia-kártya az advent alatt").toBeGreaterThanOrEqual(advent.y + advent.height);
    expect(toolbar.y, "az eszközsor a Szia-kártya alatt").toBeGreaterThanOrEqual(welcome.y + welcome.height);

    // 3. az eszközsor: osztályválasztó + kereső + nézetváltó egymás mellett, teljes szélességben
    const chips = await bb(page.getByTestId("home-classroom-filter"));
    const search = await bb(page.getByTestId("input-search"));
    const views = await bb(page.getByTestId("home-view-switch"));
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(Math.abs(mid(chips) - mid(search)), "a szűrő és a kereső egy sorban").toBeLessThanOrEqual(16);
    expect(Math.abs(mid(search) - mid(views)), "a kereső és a nézetváltó egy sorban").toBeLessThanOrEqual(16);
    expect(chips.x + chips.width).toBeLessThanOrEqual(search.x + 1);
    expect(search.x + search.width).toBeLessThanOrEqual(views.x + 1);
    expect(Math.abs(toolbar.width - content.width), "az eszközsor teljes szélességű").toBeLessThanOrEqual(2);
    expect(search.width, "a kereső kitölti a maradék helyet").toBeGreaterThanOrEqual(240);
    expect((await measureOverflow(page)).x, "nincs vízszintes görgetés").toBe(0);
  });
});

test.describe("telefon 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("telefonon minden egymás alatt, vízszintes görgetés nélkül", async ({ page }) => {
    await setAdventTime(page, DEC3);
    await page.goto("/");
    await expect(page.getByTestId("advent-home-card")).toBeVisible();
    const hero = await bb(page.locator("header.hero-bar"));
    const sponsor = await bb(page.getByTestId("sponsor-bar"));
    const advent = await bb(page.getByTestId("advent-home-card"));
    expect(sponsor.y, "a csempe a Hero alatt").toBeGreaterThanOrEqual(hero.y + hero.height - 1);
    expect(advent.y, "az advent a csempe alatt").toBeGreaterThanOrEqual(sponsor.y + sponsor.height - 1);
    const search = await bb(page.getByTestId("input-search"));
    const chips = await bb(page.getByTestId("home-classroom-filter"));
    expect(search.y, "a kereső a szűrő alatt").toBeGreaterThanOrEqual(chips.y + chips.height - 1);
    expect((await measureOverflow(page)).x, "nincs vízszintes görgetés").toBe(0);
  });
});
