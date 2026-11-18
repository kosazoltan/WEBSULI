import { expect, test, type Page } from "@playwright/test";

import { ADVENT_GIFT_MESSAGE } from "../shared/advent/rules";
import { seedProgress, setAdventTime, setClientAdventTime, shot } from "./support/advent-e2e";
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
      await page.goto("/adventi-naptar");
      await expect(page.getByTestId("advent-grade-picker")).toBeVisible();
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

  test("tesztidő nélkül (a többi főoldali teszt helyzete; kikapcsolt kapcsolóval egyenértékű): a kártya egy pillanatra sem kerül a lapra, és EGYETLEN /api/advent kérés sem megy (terv 20., S4 F1)", async ({ page }) => {
    // A böngésző órája decembert mutat, de a teszt NEM ad tesztidőt: a kliens szezon-számítása ilyenkor „nincs naptár”.
    await page.clock.setFixedTime(new Date(DEC3));
    const adventRequests: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/advent")) adventRequests.push(r.url()); });
    await page.addInitScript(() => {
      const w = window as unknown as { __adventCardSeen?: boolean };
      w.__adventCardSeen = false;
      new MutationObserver(() => { if (document.querySelector('[data-testid="advent-home-card"]')) w.__adventCardSeen = true; })
        .observe(document.documentElement, { childList: true, subtree: true });
    });
    await page.goto("/");
    await expect(page.getByTestId("button-filter-all").or(page.getByTestId("home-view-switch")).first()).toBeVisible();
    await page.waitForTimeout(1200);
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __adventCardSeen?: boolean }).__adventCardSeen), "a kártya egy pillanatra sem került a lapra").toBe(false);
    expect(adventRequests, "naptár-kérés a főoldalról").toEqual([]);
    // Szezonon kívüli tesztidővel ugyanez: semmi nem rajzolódik, semmi nem megy ki.
    await setAdventTime(page, "2026-11-23T10:00:00Z");
    await page.goto("/");
    await expect(page.getByTestId("button-filter-all").or(page.getByTestId("home-view-switch")).first()).toBeVisible();
    await page.waitForTimeout(600);
    await expect(card(page)).toHaveCount(0);
    expect(adventRequests, "naptár-kérés szezonon kívül").toEqual([]);
  });

  test("elállított eszközóra és hibás bekapcsolási sorrend: a kártya legfeljebb megjelenik és összecsukódik, vagy nem jelenik meg — a naptároldalon a szerver dönt (terv 20.)", async ({ page }) => {
    // 1) Az eszköz órája októbert mutat, a szerveren december van: a kártya nem jelenik meg, a naptároldal mégis működik.
    await setAdventTime(page, DEC3);
    await setClientAdventTime(page, "2026-10-10T10:00:00Z");
    await page.goto("/");
    await expect(page.getByTestId("button-filter-all").or(page.getByTestId("home-view-switch")).first()).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    await page.goto("/adventi-naptar");
    await expect(page.getByTestId("advent-grade-picker")).toBeVisible();
    // 2) Az eszköz órája decembert mutat, a szerveren január 7. van (bezárt): a kártya megjelenik, majd összecsukódik.
    await setAdventTime(page, "2027-01-07T10:00:00Z");
    await setClientAdventTime(page, DEC3);
    await page.route("**/api/advent/status", async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.fallback(); });
    await page.goto("/");
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveCount(0, { timeout: 10_000 });
    await page.goto("/adventi-naptar");
    await expect(page.getByTestId("advent-closed")).toBeVisible();
    // 3) Hibás bekapcsolási sorrend (a kliens-build bekapcsolva, a szerver még nem — itt: nincs tesztidő-fejléc): ugyanez.
    await page.context().setExtraHTTPHeaders({});
    await page.goto("/");
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveCount(0, { timeout: 10_000 });
    await page.goto("/adventi-naptar");
    await expect(page.getByText("A naptár most nem érhető el.")).toBeVisible();
  });

  test("végigjátszott naptár: a kártya „Megnézem” gombja az összesítést nyitja az ajándék-üzenettel (S3 K3, S4 F2)", async ({ page }) => {
    const DEC24 = "2026-12-24T10:00:00Z";
    await setAdventTime(page, DEC24);
    await page.goto("/adventi-naptar");
    await expect(page.getByTestId("advent-grade-picker")).toBeVisible();
    await seedProgress(page, DEC24, { grade: 5, days: Array.from({ length: 24 }, (_, i) => i + 1) });
    await page.goto("/");
    await expect(page.getByTestId("advent-home-status")).toHaveText("Végigértél: 24 / 24 ablak világít");
    await expect(page.getByTestId("advent-home-cta")).toHaveText("Megnézem");
    await page.getByTestId("advent-home-cta").tap();
    await expect(page.getByTestId("advent-summary")).toBeVisible();
    await expect(page.getByTestId("advent-gift-message")).toHaveText(ADVENT_GIFT_MESSAGE);
    await shot(page, "h-megnezem-osszesites");
  });
});

/**
 * CLS a böngésző saját layout-shift megfigyelőjével (felhasználói bemenet nélküli elmozdulások összege) — a kártya miatti
 * többlet a szezonon kívüli betöltéshez mérve. A státusz 400 ms-ot késik (iskolai hálózat), a látogató ELŐSZÖR jár itt.
 */
async function clsOf(page: Page): Promise<{ cls: number; sources: string[] }> {
  return page.evaluate(() => (window as unknown as { __cls: { cls: number; sources: string[] } }).__cls);
}
for (const size of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test.describe("CLS első látogatáskor " + size.width + "×" + size.height, () => {
    test.use({ viewport: size, hasTouch: size.width < 768, isMobile: size.width < 768 });

    test("a kártya az első rajzoláskor a helyén van: a miatta mért elrendezés-ugrás ≤ 0,02, a státusz megérkezése semmit nem mozdít (A47, terv 20.)", async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: { cls: number; sources: string[] } };
        w.__cls = { cls: 0, sources: [] };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node | null }> }>) {
            if (entry.hadRecentInput) continue;
            w.__cls.cls += entry.value;
            for (const source of entry.sources ?? []) {
              const el = source.node instanceof Element ? source.node : null;
              if (el) w.__cls.sources.push(el.getAttribute("data-testid") ?? el.id ?? el.tagName);
            }
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      let answered = false;
      await page.route("**/api/advent/status", async (route) => { await new Promise((r) => setTimeout(r, 400)); answered = true; await route.fallback(); });
      const settleHome = async () => {
        await expect(page.getByTestId("button-filter-all").or(page.getByTestId("home-view-switch")).first()).toBeVisible();
        await page.waitForTimeout(1500);
      };
      // Alapvonal: szezonon kívül (nincs kártya) — a főoldal saját elmozdulásai.
      await setAdventTime(page, "2026-11-23T10:00:00Z");
      await page.goto("/");
      await settleHome();
      const base = await clsOf(page);
      // Első látogatás a szezonban: üres tárhely, a kártya azonnal a helyén.
      await setAdventTime(page, DEC3);
      await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
      // (Szezonon kívül a kártya semmit nem kér le, így az `answered` itt még biztosan hamis — külön teszt méri.)
      await page.goto("/");
      await expect(card(page)).toBeVisible();
      expect(answered, "a kártya a státusz válasza ELŐTT már látszik").toBe(false);
      const early = (await card(page).boundingBox())!;
      await expect(page.getByTestId("advent-home-cta"), "a gomb azonnal ott van").toBeVisible();
      await settleHome();
      expect(answered).toBe(true);
      const season = await clsOf(page);
      const late = (await card(page).boundingBox())!;
      expect({ y: late.y, height: late.height }, "a kártya nem mozdul és nem változik a státusz megérkezésekor").toEqual({ y: early.y, height: early.height });
      test.info().annotations.push({ type: "advent-cls", description: size.width + "×" + size.height + ": szezonon kívül " + base.cls.toFixed(4) + ", szezonban (első látogatás) " + season.cls.toFixed(4) });
      expect(season.cls - base.cls, "a kártya miatti CLS-többlet (szezonon kívül " + base.cls.toFixed(4) + " → szezonban " + season.cls.toFixed(4) + "; források: " + [...new Set(season.sources)].join(", ") + ")").toBeLessThanOrEqual(0.02);
      expect(season.sources, "a kártya maga nem mozdul el").not.toContain("advent-home-card");
    });
  });
}
