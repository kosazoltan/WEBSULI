import { expect, test } from "@playwright/test";

import { ADVENT_GIFT_MESSAGE } from "../shared/advent/rules";
import { clearAdventTime, pickOption, playDoor, proxyHeaders, seedProgress, setAdventTime, settle, shot } from "./support/advent-e2e";
import { MOBILE_VIEWPORTS, hideAndShowPage, measureOverflow, overlappingTargets, safeAreaViolations, smallFonts, smallTargets } from "./support/game-mobile-quality";

/**
 * Adventi naptár — a naptár oldala valódi böngészőben, érintéssel (docs/specs/2026-11-18-adventi-naptar.md 6., 7., 16.5):
 * A1, A2, A6–A15, A18, A26–A32. Az idő a tesztben a `setAdventTime` szerinti (szerver: fejléc, böngésző: Playwright-óra).
 */
test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const DEC5 = "2026-12-05T10:00:00Z";
const DEC24 = "2026-12-24T10:00:00Z";
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

async function openCalendar(page: import("@playwright/test").Page, iso: string, grade?: number) {
  await setAdventTime(page, iso);
  await page.goto("/adventi-naptar");
  await expect(page.getByTestId("advent-page")).toBeVisible();
  if (grade !== undefined) {
    await page.getByTestId(`advent-grade-${grade}`).tap();
    await expect(page.getByTestId("advent-grid")).toBeVisible();
  }
}

test("évfolyamválasztás, 24 ablak, zárt és nyitható ablak, kérdés, jó válasz, megmarad újratöltés után (A1, A2, A6, A12, A18)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await openCalendar(page, DEC5);
  await expect(page.getByTestId("advent-grade-picker")).toBeVisible();
  await expect(page.locator('[data-testid^="advent-grade-"]:not([data-testid="advent-grade-picker"])')).toHaveCount(12);
  await shot(page, "01-evfolyam");
  await page.getByTestId("advent-grade-5").tap();
  await expect(page.locator(".advent-door")).toHaveCount(24);
  for (const day of range(1, 5)) await expect(page.getByTestId(`advent-door-${day}`)).toHaveAttribute("data-state", "open");
  for (const day of range(6, 24)) await expect(page.getByTestId(`advent-door-${day}`)).toHaveAttribute("data-state", "locked");
  await expect(page.getByTestId("advent-door-12")).toHaveAccessibleName("12. ablak — december 12-én nyílik");
  await expect(page.getByTestId("advent-door-5")).toHaveAccessibleName("5. ablak — nyitható");
  await shot(page, "02-naptar");
  // Zárt ablak: nem nyílik kérdés, a felület megmondja, mikor nyílik.
  // (aria-disabled gomb: a Playwright „engedélyezett” várakozása helyett valódi koppintás megy rá.)
  await page.getByTestId("advent-door-6").tap({ force: true });
  await expect(page.getByText("A 6. ablak december 6-án nyílik.")).toBeAttached();
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  // A mai ablak: kérdés négy válasszal.
  await page.getByTestId("advent-door-5").tap();
  await expect(page.getByTestId("advent-question")).toBeVisible();
  await expect(page.locator('[data-testid^="advent-option-"]')).toHaveCount(4);
  await shot(page, "03-kerdes");
  await pickOption(page, true);
  await expect(page.getByTestId("advent-feedback")).toContainText("ez az ablak már világít");
  await expect(page.getByTestId("advent-feedback")).toContainText("A helyes válasz:");
  await shot(page, "04-visszajelzes");
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-door-5")).toHaveAttribute("data-state", "solved");
  await expect(page.getByTestId("advent-progress")).toContainText("1 / 24 világít");
  await shot(page, "05-megoldva");
  await page.reload();
  await expect(page.getByTestId("advent-door-5")).toHaveAttribute("data-state", "solved");
  await expect(page.getByTestId("advent-grade-picker")).toHaveCount(0);
  expect(errors, "konzolhiba").toEqual([]);
});

test("hibás válasz → javítható → ÚJ kérdés → megoldva (A7)", async ({ page }) => {
  await openCalendar(page, DEC5, 7);
  await page.getByTestId("advent-door-3").tap();
  const first = await page.getByTestId("advent-question").innerText();
  await pickOption(page, false);
  await expect(page.getByTestId("advent-feedback")).toContainText("új kérdéssel kijavíthatod");
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-door-3")).toHaveAttribute("data-state", "repairable");
  await expect(page.getByTestId("advent-repair")).toBeVisible();
  await shot(page, "06-javithato");
  await page.getByTestId("advent-repair").tap();
  await expect(page.getByTestId("advent-question")).toBeVisible();
  expect(await page.getByTestId("advent-question").innerText()).not.toBe(first);
  await pickOption(page, true);
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-door-3")).toHaveAttribute("data-state", "solved");
});

test("a bankból eltűnt kérdés (S2b C5 szerződés): újranyitáskor `question: null` → nincs párbeszédablak, az eredmény marad; válasznál `correctIndex: -1` → nincs üres „helyes válasz” sor", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await openCalendar(page, DEC5, 5);
  // 1) A válasz valódi, de a szerver azt jelzi, hogy a kérdés szövege már nincs meg: correctIndex -1.
  await page.route("**/api/advent/doors/2/answer", async (route) => {
    const response = await route.fetch({ headers: proxyHeaders(route.request().headers()) });
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...body, correctIndex: -1, explanation: "" } });
  });
  await page.getByTestId("advent-door-2").tap();
  await pickOption(page, true);
  await expect(page.getByTestId("advent-feedback")).toContainText("ez az ablak már világít");
  await expect(page.getByTestId("advent-correct-answer")).toHaveCount(0);
  await expect(page.getByTestId("advent-feedback")).not.toContainText("A helyes válasz");
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-door-2")).toHaveAttribute("data-state", "solved");
  // 2) A megoldott ablak újranyitása kérdés nélkül: a naptár áll tovább, a felület megmondja, mi történt.
  await page.route("**/api/advent/doors/2/open", (route) => route.fulfill({ json: { day: 2, question: null, answered: null } }));
  await page.getByTestId("advent-door-2").tap();
  await expect(page.getByText("Ez a kérdés már nem érhető el, de az eredményed megmaradt.")).toBeAttached();
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  await expect(page.getByTestId("advent-door-2")).toHaveAttribute("data-state", "solved");
  // Más ablak tovább játszható.
  await playDoor(page, 3, true);
  expect(errors, "konzol- vagy laphiba").toEqual([]);
});

test("éjféli határ: 23:59:59-kor a holnapi ablak zárt, 00:00:00-kor nyitható (A13)", async ({ page }) => {
  await openCalendar(page, "2026-12-04T22:59:59Z", 5);
  await expect(page.getByTestId("advent-door-5")).toHaveAttribute("data-state", "locked");
  await setAdventTime(page, "2026-12-04T23:00:00Z");
  await page.reload();
  await expect(page.getByTestId("advent-door-5")).toHaveAttribute("data-state", "open");
});

test("végigjátszás: 24 / 24 → a szó szerinti üzenet az összesítésben (A8, A11)", async ({ page }) => {
  await openCalendar(page, DEC24);
  await seedProgress(page, DEC24, { grade: 5, days: range(1, 22) });
  await page.reload();
  await expect(page.getByTestId("advent-progress")).toContainText("22 / 24");
  await playDoor(page, 23, true);
  await page.getByTestId("advent-door-24").tap();
  await pickOption(page, true);
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-summary")).toBeVisible();
  await expect(page.getByTestId("advent-gift-message")).toHaveText(ADVENT_GIFT_MESSAGE);
  await expect(page.getByTestId("advent-summary")).toContainText("24 / 24");
  await expect(page.getByTestId("advent-summary")).toContainText("Elsőre jó: 24 / 24");
  await shot(page, "07-ajandek-uzenet");
});

test("22 / 24 → nincs ajándék-üzenet, bátorítás és javítás; javítás után 23 megoldott → megvan (A9, E1)", async ({ page }) => {
  await openCalendar(page, DEC24);
  await seedProgress(page, DEC24, { grade: 5, days: range(1, 24), wrong: [7, 12] });
  await page.reload();
  await page.getByTestId("advent-summary-open").tap();
  await expect(page.getByTestId("advent-encourage")).toContainText("2 ablak javításra vár");
  await expect(page.getByTestId("advent-gift-message")).toHaveCount(0);
  await shot(page, "08-batoritas");
  await page.getByTestId("advent-repair-from-summary").tap();
  await expect(page.getByTestId("advent-question")).toBeVisible();
  await pickOption(page, true);
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-gift-message")).toHaveText(ADVENT_GIFT_MESSAGE);
});

test("végleg sikertelen kör → „Új naptárat kérek” → új kör nyitható ablakokkal (A10)", async ({ page }) => {
  await openCalendar(page, DEC24);
  await seedProgress(page, DEC24, { grade: 5, days: range(1, 24), wrong: [1, 2], attempts: 3 });
  await page.reload();
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "failed");
  await page.getByTestId("advent-summary-open").tap();
  await expect(page.getByTestId("advent-gift-message")).toHaveCount(0);
  await page.getByTestId("advent-new-round").tap();
  await expect(page.getByTestId("advent-progress")).toContainText("2. kör");
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "open");
});

test("szezon: november 29. „Hamarosan”; január 7. lezárt; tesztidő nélkül a naptár nem érhető el (A14, A15, A51)", async ({ page }) => {
  await openCalendar(page, "2026-11-29T10:00:00Z");
  await expect(page.getByTestId("advent-teaser")).toContainText("Hamarosan");
  await expect(page.locator(".advent-door")).toHaveCount(0);
  await setAdventTime(page, DEC5);
  await page.goto("/adventi-naptar");
  await page.getByTestId("advent-grade-5").tap();
  await playDoor(page, 1, true);
  await setAdventTime(page, "2027-01-07T10:00:00Z");
  await page.reload();
  await expect(page.getByTestId("advent-closed")).toContainText("Az idei naptár bezárt");
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "solved");
  await page.getByTestId("advent-door-2").tap({ force: true });
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  await clearAdventTime(page);
  await page.reload();
  await expect(page.getByText("A naptár most nem érhető el.")).toBeVisible();
});

test("csökkentett mozgás: nincs hóesés és futó animáció; rendes módban a hó a kérdés alatt és rejtett lapon áll (A27, A29, M6, M9)", async ({ page }) => {
  await openCalendar(page, DEC5, 5);
  await expect(page.getByTestId("advent-snow")).toHaveAttribute("data-paused", "false");
  expect(await page.locator(".advent-snow__flake").count()).toBeLessThanOrEqual(24);
  await page.getByTestId("advent-door-1").tap();
  await expect(page.getByTestId("advent-question")).toBeVisible();
  await expect(page.getByTestId("advent-snow")).toHaveAttribute("data-paused", "true");
  await page.keyboard.press("Escape");
  const before = await page.locator(".advent-door").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
  await hideAndShowPage(page);
  expect(await page.locator(".advent-door").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).toEqual(before);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("advent-grid")).toBeVisible();
  await expect(page.getByTestId("advent-snow")).toHaveCount(0);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
});

test("billentyűzet: az ablak és a válaszok elérhetők, a párbeszédablak visszaadja a fókuszt (A30)", async ({ page }) => {
  await openCalendar(page, DEC5, 5);
  await page.getByTestId("advent-door-1").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("advent-question")).toBeVisible();
  await expect(page.getByTestId("advent-dialog")).toHaveAttribute("role", "dialog");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  await expect(page.getByTestId("advent-door-1")).toBeFocused();
});

for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`mobil mérés ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("naptár, kérdés, visszajelzés, összesítés: nincs oldalgörgetés, minden cél ≥ 48 px, betű ≥ 12 px, a válaszok nem fedik egymást (A26, A28)", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await openCalendar(page, DEC24);
      await seedProgress(page, DEC24, { grade: 5, days: range(1, 22), wrong: [4] });
      await page.reload();
      await expect(page.getByTestId("advent-grid")).toBeVisible();
      const measure = async (stateName: string) => {
        await settle(page);
        expect(await measureOverflow(page), `M1 ${stateName}`).toEqual({ x: 0, y: 0 });
        expect(await smallTargets(page), `M2 ${stateName}`).toEqual([]);
        expect(await smallFonts(page), `M3 ${stateName}`).toEqual([]);
        await shot(page, `m-${stateName}`);
      };
      await measure("naptar");
      // A teljes naptár a képernyőn belül van: mind a 24 ablak látszik, görgetés nélkül.
      const boxes = await page.locator(".advent-door").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
      for (const b of boxes) expect(b.top >= 0 && b.left >= 0 && b.bottom <= viewport.height && b.right <= viewport.width, `ablak a nézeten belül: ${JSON.stringify(b)}`).toBe(true);
      expect(await safeAreaViolations(page, { top: 0, right: 0, bottom: 0, left: 0 }), "M4").toEqual([]);
      await page.getByTestId("advent-door-23").tap();
      await expect(page.getByTestId("advent-question")).toBeVisible();
      expect(await overlappingTargets(page, '[data-testid^="advent-option-"]'), "egymást fedő válaszok").toEqual([]);
      await measure("kerdes");
      await pickOption(page, true);
      await measure("visszajelzes");
      await page.getByTestId("advent-next").tap();
      await page.getByTestId("advent-summary-open").tap();
      await expect(page.getByTestId("advent-summary")).toBeVisible();
      await measure("osszesites");
      expect(errors, "konzolhiba (A32)").toEqual([]);
    });
  });
}
