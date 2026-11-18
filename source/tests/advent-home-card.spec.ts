import { expect, test, type Page } from "@playwright/test";

import { clearAdventTime, seedProgress, setAdventTime, shot } from "./support/advent-e2e";
import { measureOverflow, smallFonts, smallTargets } from "./support/game-mobile-quality";

/**
 * Adventi naptár — főoldali kártya a Hero és a tananyagok között (docs/specs/2026-11-18-adventi-naptar.md 14.; A44–A48):
 * teljes szélesség, alacsony (telefonon ≤ 132 px, 768 px-től ≤ 160 px), egy koppintás a kérdésig, szezonon kívül nincs,
 * a játékok között soha, és a lista nem ugrik el a betöltésekor.
 */
test.use({ serviceWorkers: "block" });

const DEC3 = "2026-12-03T10:00:00Z";
const card = (page: Page) => page.getByTestId("advent-home-card");
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

/** Az első tananyag-sáv / szűrő felső éle — a kártya ennyivel tolja lejjebb a listát. */
const filterTop = async (page: Page) => (await box(page, '[data-testid="button-filter-all"], [data-testid="home-view-switch"]')).y;

for (const viewport of [{ name: "telefon", width: 390, height: 844, max: 132 }, { name: "asztal", width: 1366, height: 768, max: 160 }]) {
  test.describe(`${viewport.name} ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.width < 768, isMobile: viewport.width < 768 });

    test("a kártya a Hero alatt, a szűrő és a tananyagok fölött; teljes szélesség, alacsony; a gomb ≥ 48 px (A44)", async ({ page }) => {
      // Szezonon kívül: nincs kártya — ez a lista eredeti helye.
      await setAdventTime(page, "2026-11-23T10:00:00Z");
      await page.goto("/");
      await expect(page.getByTestId("button-filter-all").or(page.getByTestId("home-view-switch")).first()).toBeVisible();
      await expect(card(page)).toHaveCount(0);
      const without = await filterTop(page);
      await shot(page, `h-${viewport.name}-szezonon-kivul`);

      await setAdventTime(page, DEC3);
      await page.goto("/");
      await expect(card(page)).toBeVisible();
      await expect(page.getByTestId("advent-home-status")).toHaveText("Ma a 3. ablak nyílik — és még 2 vár rád");
      const c = (await card(page).boundingBox())!;
      const container = await box(page, ".container");
      expect(c.height, "a kártya magassága").toBeLessThanOrEqual(viewport.max);
      expect(c.height).toBeGreaterThanOrEqual(viewport.max - 1);
      expect(Math.abs(c.width - (container.width - 2 * parseFloat(await page.locator(".container").first().evaluate((el) => getComputedStyle(el).paddingLeft)))), "teljes szélesség a tartalomsávban").toBeLessThanOrEqual(2);
      const withCard = await filterTop(page);
      expect(c.y, "a kártya a szűrő fölött").toBeLessThan(withCard);
      const shift = withCard - without;
      // A kártya csak a saját magasságával + a térközzel tolja lejjebb a listát (terv 14.2: ≤ 144 / ≤ 172 px).
      expect(shift, `a lista eltolódása: ${without} → ${withCard}`).toBeLessThanOrEqual(viewport.max + 12);
      expect(shift).toBeGreaterThan(0);
      test.info().annotations.push({ type: "advent-home-card", description: `${viewport.name}: szűrő teteje kártya nélkül ${Math.round(without)} px, kártyával ${Math.round(withCard)} px (eltolódás ${Math.round(shift)} px), kártyamagasság ${Math.round(c.height)} px` });
      const cta = (await page.getByTestId("advent-home-cta").boundingBox())!;
      expect(cta.width).toBeGreaterThanOrEqual(48);
      expect(cta.height).toBeGreaterThanOrEqual(48);
      await expect(page.getByTestId("advent-home-cta")).toHaveText("Kinyitom");
      expect((await measureOverflow(page)).x, "nincs vízszintes görgetés").toBe(0);
      const scope = async <T extends { testid?: string | null; text?: string }>(rows: T[]) => rows.filter((r) => (r.testid ?? "").startsWith("advent-") || /Adventi naptár|ablak/.test(r.text ?? ""));
      expect(await scope(await smallTargets(page)), "M2 a kártyán").toEqual([]);
      expect(await scope(await smallFonts(page)), "M3 a kártyán").toEqual([]);
      await shot(page, `h-${viewport.name}-kartya`);
    });

    test("egy koppintás a kérdésig: a kártya gombja megnyitja a naptárat és a mai ablak kérdését (A45, M8)", async ({ page }) => {
      await setAdventTime(page, DEC3);
      await page.goto("/adventi-naptar");
      await expect(page.getByTestId("advent-grade-picker")).toBeVisible();
      await seedProgress(page, DEC3, { grade: 5, days: [1] });
      await page.goto("/");
      await expect(page.getByTestId("advent-home-status")).toHaveText("Ma a 3. ablak nyílik — és még 1 vár rád");
      if (viewport.width < 768) await page.getByTestId("advent-home-cta").tap(); else await page.getByTestId("advent-home-cta").click();
      await expect(page.getByTestId("advent-question")).toBeVisible();
      await expect(page.getByTestId("advent-dialog")).toContainText("3. ablak");
      expect(new URL(page.url()).search, "a nyit=ma paraméter eltűnik").toBe("");
      await shot(page, `h-${viewport.name}-egy-koppintas`);
    });
  });
}

test.describe("szezon és regresszió", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("november 29.: „Hamarosan” gomb nélkül; január 7. és tesztidő nélkül: nincs kártya (A15, A46)", async ({ page }) => {
    await setAdventTime(page, "2026-11-29T10:00:00Z");
    await page.goto("/");
    await expect(page.getByTestId("advent-home-status")).toHaveText("Hamarosan: december 1. — még 2 nap");
    await expect(page.getByTestId("advent-home-cta")).toHaveCount(0);
    await shot(page, "h-hamarosan");
    await setAdventTime(page, "2027-01-07T10:00:00Z");
    await page.goto("/");
    await expect(page.getByTestId("button-filter-all").or(page.getByTestId("home-view-switch")).first()).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    // Szezonban, de a szerver szerint a naptár nem él (nincs tesztidő-fejléc = kikapcsolt): a kártya eltűnik.
    await page.clock.setFixedTime(new Date(DEC3));
    await clearAdventTime(page);
    await page.goto("/");
    await expect(page.getByTestId("button-filter-all").or(page.getByTestId("home-view-switch")).first()).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });

  test("a naptár nincs a játékok között: a játéklista és a főoldali játék-rács nem hivatkozik rá (A46)", async ({ page }) => {
    await setAdventTime(page, DEC3);
    await page.goto("/games");
    await expect(page.locator('a[href^="/games/"]').first()).toBeVisible();
    await expect(page.locator('a[href*="adventi"]')).toHaveCount(0);
    await expect(page.getByText(/advent/i)).toHaveCount(0);
    await page.goto("/");
    await expect(card(page)).toBeVisible();
    await expect(page.locator('#gyakorlo-jatekok a[href*="adventi"]')).toHaveCount(0);
  });

  test("a lista nem ugrik el: a kártya helye a tartalom megérkezése előtt foglalt (A47)", async ({ page }) => {
    await setAdventTime(page, DEC3);
    // Lassú szerver: az állapot és a státusz 800 ms-ot késik — a kártya doboza addig is a végleges méretén áll.
    await page.route("**/api/advent/**", async (route) => { await new Promise((r) => setTimeout(r, 800)); await route.fallback(); });
    await page.goto("/");
    await expect(card(page)).toBeVisible();
    // A szerver még nem válaszolt: a doboz már a helyén van, benne az azonnali felhívás és a gomb.
    await expect(page.getByTestId("advent-home-status")).toHaveText("Nyisd ki a mai ablakot!");
    await expect(page.getByTestId("advent-home-cta")).toBeVisible();
    const early = (await card(page).boundingBox())!;
    const earlyFilter = await filterTop(page);
    await expect(page.getByTestId("advent-home-status")).toHaveText(/Ma a 3\. ablak nyílik/, { timeout: 10_000 });
    const late = (await card(page).boundingBox())!;
    expect(late.height, "a kártya magassága nem változik a tartalom megérkezésekor").toBe(early.height);
    expect(await filterTop(page), "a szűrő nem mozdul el").toBe(earlyFilter);
  });
});
