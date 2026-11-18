import { expect, test } from "@playwright/test";

import { ADVENT_GIFT_MESSAGE } from "../shared/advent/rules";
import { chooseGrade, clearAdventTime, contrastOf, pickOption, playDoor, proxyHeaders, seedProgress, setAdventTime, settle, shot, tapDoor } from "./support/advent-e2e";
import { MOBILE_VIEWPORTS, emulateSafeArea, hideAndShowPage, measureOverflow, overlappingTargets, safeAreaViolations, smallFonts, smallTargets } from "./support/game-mobile-quality";

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
    await chooseGrade(page, grade);
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
  await chooseGrade(page, 5);
  await expect(page.locator(".advent-door")).toHaveCount(24);
  for (const day of range(1, 5)) await expect(page.getByTestId(`advent-door-${day}`)).toHaveAttribute("data-state", "open");
  for (const day of range(6, 24)) await expect(page.getByTestId(`advent-door-${day}`)).toHaveAttribute("data-state", "locked");
  await expect(page.getByTestId("advent-door-12")).toHaveAccessibleName("12. ablak — december 12-én nyílik");
  await expect(page.getByTestId("advent-door-5")).toHaveAccessibleName("5. ablak — nyitható");
  const lockedNumber = await contrastOf(page, '[data-testid="advent-door-24"] .advent-door__num');
  expect(lockedNumber.ratio, "zárt ablak száma: " + lockedNumber.fg + " / " + lockedNumber.bg).toBeGreaterThanOrEqual(4.5);
  await shot(page, "02-naptar");
  // Zárt ablak: nem nyílik kérdés, a felület megmondja, mikor nyílik.
  // (aria-disabled gomb: a Playwright „engedélyezett” várakozása helyett valódi koppintás megy rá.)
  await tapDoor(page, 6, { force: true });
  await expect(page.getByTestId("advent-notice")).toBeVisible();
  await expect(page.getByTestId("advent-notice")).toHaveText("A 6. ablak december 6-án nyílik.");
  await shot(page, "02b-zart-ablak-uzenet");
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  // A mai ablak: kérdés négy válasszal.
  await tapDoor(page, 5);
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
  await tapDoor(page, 3);
  const first = await page.getByTestId("advent-question").innerText();
  await pickOption(page, false);
  await expect(page.getByTestId("advent-feedback")).toContainText("új kérdéssel kijavíthatod");
  await expect(page.locator('.advent-option[data-mark="wrong"]')).toHaveCount(1);
  await expect(page.locator('.advent-option[data-mark="correct"]')).toHaveCount(1);
  await shot(page, "05b-hibas-valasz-jelolve");
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
  await tapDoor(page, 2);
  await pickOption(page, true);
  await expect(page.getByTestId("advent-feedback")).toContainText("ez az ablak már világít");
  await expect(page.getByTestId("advent-correct-answer")).toHaveCount(0);
  await expect(page.getByTestId("advent-feedback")).not.toContainText("A helyes válasz");
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-door-2")).toHaveAttribute("data-state", "solved");
  // 2) A megoldott ablak újranyitása kérdés nélkül: a naptár áll tovább, a felület megmondja, mi történt.
  await page.route("**/api/advent/doors/2/open", (route) => route.fulfill({ json: { day: 2, question: null, answered: null } }));
  await tapDoor(page, 2);
  await expect(page.getByText("Ez a kérdés már nem érhető el, de az eredményed megmaradt.")).toBeAttached();
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  await expect(page.getByTestId("advent-door-2")).toHaveAttribute("data-state", "solved");
  // Más ablak tovább játszható.
  await playDoor(page, 3, true);
  expect(errors, "konzol- vagy laphiba").toEqual([]);
});

test("betelt új-sor keret (429, limit: new-row): barátságos várakozó üzenet, majd automatikus újrapróba; tartós 429-nél barátságos hiba és „Újra” (S2b M1)", async ({ page }) => {
  await openCalendar(page, DEC5);
  const busy = { status: 429, json: { message: "Túl sok új naptár erről a hálózatról — próbáld újra később.", limit: "new-row" } };
  // 1) Az első évfolyam-kérés 429, a második már a valódi szerverhez megy.
  let calls = 0;
  await page.route("**/api/advent/grade", (route) => (++calls === 1 ? route.fulfill(busy) : route.fallback()));
  await chooseGrade(page, 5);
  await expect(page.getByTestId("advent-busy")).toContainText("mindjárt újra megpróbáljuk");
  await shot(page, "09-sokan-vagyunk");
  await expect(page.getByTestId("advent-grid")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("advent-busy")).toHaveCount(0);
  await expect(page.getByTestId("advent-error")).toHaveCount(0);
  expect(calls).toBe(2);
  // 2) Tartós 429 a megnyitásnál: egy újrapróba után barátságos hiba (nem a nyers üzenet), a naptár használható marad.
  let opens = 0;
  await page.route("**/api/advent/doors/1/open", (route) => { opens++; return route.fulfill(busy); });
  await tapDoor(page, 1);
  await expect(page.getByTestId("advent-error")).toContainText("a naptárad megvár", { timeout: 15_000 });
  await expect(page.getByTestId("advent-error")).not.toContainText("hálózatról");
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  expect(opens).toBe(2);
  await page.unroute("**/api/advent/doors/1/open");
  await page.getByTestId("advent-error-retry").tap();
  await playDoor(page, 1, true);
});

test("párbeszédablakok színei SZÁMÍTOTT értékből: a fő gombok és az ajándék-üzenet kontrasztja ≥ 4,5:1, arany keret, látható fókuszkeret (S3 B1)", async ({ page }) => {
  await openCalendar(page, DEC24);
  await seedProgress(page, DEC24, { grade: 5, days: range(1, 23), wrong: [7, 12] });
  await page.reload();
  // 1) Kérdés → visszajelzés: a „Tovább” gomb.
  await tapDoor(page, 24);
  await pickOption(page, true);
  await settle(page);
  const next = await contrastOf(page, '[data-testid="advent-next"]');
  expect(next.ratio, "„Tovább”: " + next.fg + " / " + next.bg).toBeGreaterThanOrEqual(4.5);
  expect(next.bg, "a fő gomb háttere arany, nem a sötét lap").toBe("rgb(246, 196, 83)");
  const border = await page.getByTestId("advent-dialog").evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(border, "a párbeszédablak arany kerete").toBe("rgb(246, 196, 83)");
  const title = await contrastOf(page, ".advent-dialog__title");
  expect(title.fg, "arany cím").toBe("rgb(255, 233, 168)");
  expect(title.ratio).toBeGreaterThanOrEqual(4.5);
  // Fókuszkeret a párbeszédablakban, billentyűzettel: látható stílus, legalább 2 px, a lap fölött ≥ 3:1.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const ring = await contrastOf(page, ".advent-dialog :focus-visible", "outline");
  expect(ring.outlineStyle, "fókuszkeret stílusa").toBe("solid");
  expect(ring.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(ring.ratio, "fókuszkeret: " + ring.fg + " / " + ring.bg).toBeGreaterThanOrEqual(3);
  await shot(page, "04-visszajelzes");
  await page.getByTestId("advent-next").tap();
  // 2) Minden ablak megválaszolva → az összesítés magától megnyílik; javítható ablakkal a „Javítom” gomb.
  await expect(page.getByTestId("advent-summary")).toBeVisible();
  await settle(page);
  const repair = await contrastOf(page, '[data-testid="advent-repair-from-summary"]');
  expect(repair.ratio, "„Javítom”: " + repair.fg + " / " + repair.bg).toBeGreaterThanOrEqual(4.5);
  await shot(page, "08-batoritas");
  // 3) Javítás után megfelelt: az ajándék-üzenet arany a sötét lapon.
  await page.getByTestId("advent-repair-from-summary").tap();
  await pickOption(page, true);
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-gift-message")).toBeVisible();
  await settle(page);
  const gift = await contrastOf(page, '[data-testid="advent-gift-message"]');
  expect(gift.fg, "az üzenet arany").toBe("rgb(255, 233, 168)");
  expect(gift.ratio, "ajándék-üzenet: " + gift.fg + " / " + gift.bg).toBeGreaterThanOrEqual(4.5);
  await shot(page, "07-ajandek-uzenet");
});

test("élesítés: a kérdés megjelenése utáni ~400 ms-ban a koppintás és az Enter NEM rögzít választ; a fókusz a kérdésen áll (S3 K1)", async ({ page }) => {
  let answers = 0;
  await openCalendar(page, DEC5, 5);
  page.on("request", (r) => { if (r.method() === "POST" && /\/doors\/\d+\/answer$/.test(r.url())) answers++; });
  // Billentyűzet: Enter az ablakon, majd azonnal még egy Enter — a második nem válaszol (a fókusz a kérdésen van, nem egy válaszon).
  await page.getByTestId("advent-door-1").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("advent-question")).toBeVisible();
  await expect(page.getByTestId("advent-question")).toBeFocused();
  await expect(page.getByTestId("advent-dialog")).toHaveAttribute("aria-describedby", "advent-question-text");
  await page.keyboard.press("Enter");
  // Érintés: koppintás egy válaszra még az élesítés előtt (a gomb látszik, de nem fogad bemenetet).
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  await tapDoor(page, 1);
  await expect(page.locator('.advent-options[data-armed="false"]')).toBeVisible();
  await page.getByTestId("advent-option-0").tap({ force: true });
  await page.waitForTimeout(700);
  expect(answers, "az élesítés előtti bemenet nem rögzített választ").toBe(0);
  await expect(page.getByTestId("advent-next")).toHaveCount(0);
  // Élesítés után a válasz rendesen megy.
  await pickOption(page, true);
  expect(answers).toBe(1);
});

test("lejárt tanulói link: a gyerek látja a választást, addig a naptár nem ír; „Folytatom vendégként” után játszható (A53, S3 K2)", async ({ page }) => {
  let writes = 0;
  await setAdventTime(page, DEC5);
  // Érvénytelen token a böngészőben — csak az első betöltéskor tesszük be (az alkalmazás utána törölheti).
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("advent-test-token-set")) return;
    // Tokenszerű, de a szerver számára érvénytelen érték (kitalált tesztadat).
    window.localStorage.setItem("websuli.learnerToken", "00000000-0000-4000-8000-000000000000.1.AAAAAAAAAAAAAAAAAAAAAA");
    window.sessionStorage.setItem("advent-test-token-set", "1");
  });
  page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/api/advent/")) writes++; });
  await page.goto("/adventi-naptar");
  await expect(page.getByTestId("advent-pairing-invalid")).toBeVisible();
  await expect(page.getByTestId("advent-pairing-invalid")).toContainText("A személyes linked lejárt");
  await shot(page, "10-lejart-link");
  // Az alkalmazás profil-lekérdezése közben törölheti a tokent — a választás ettől még a gyereké marad (újratöltés után is).
  await page.reload();
  await expect(page.getByTestId("advent-pairing-invalid")).toBeVisible();
  await chooseGrade(page, 5);
  await expect(page.getByTestId("advent-notice")).toContainText("Előbb válassz");
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  expect(writes, "választás előtt nincs írás").toBe(0);
  await page.getByTestId("advent-continue-guest").tap();
  await expect(page.getByTestId("advent-pairing-invalid")).toHaveCount(0);
  await page.getByTestId("advent-grade-yes").tap();
  await expect(page.getByTestId("advent-grid")).toBeVisible();
  await playDoor(page, 1, true);
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "solved");
});

test("átmeneti hiba és 429 az állapot-lekérdezésnél: a naptár megmarad, a hiba sávként jelenik meg; a válasz után nincs külön olvasás; 409 a szerver üzenetével (S3 K4)", async ({ page }) => {
  let reads = 0;
  await openCalendar(page, DEC5, 5);
  page.on("request", (r) => { if (r.method() === "GET" && r.url().endsWith("/api/advent/state")) reads++; });
  // 1) Egy teljes ablak megnyitása és megválaszolása nem indít állapot-olvasást (az eredmény helyben frissíti az állapotot).
  await playDoor(page, 1, true);
  await expect(page.getByTestId("advent-progress")).toContainText("1 / 24 világít");
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "solved");
  expect(reads, "válasz utáni olvasások száma").toBe(0);
  // 2) 409 a megnyitásnál: a szerver magyar üzenete jelenik meg; az utána induló állapot-olvasás 429 → a rács a helyén marad.
  await page.route("**/api/advent/state", (route) => route.fulfill({ status: 429, json: { message: "Túl sok kérés.", limit: "ip" } }));
  await page.route("**/api/advent/doors/2/open", (route) => route.fulfill({ status: 409, json: { message: "Ez az ablak most nem nyitható." } }));
  await tapDoor(page, 2);
  await expect(page.getByTestId("advent-error")).toContainText("Ez az ablak most nem nyitható.");
  await expect(page.getByTestId("advent-stale")).toBeVisible();
  await expect(page.getByTestId("advent-load-error")).toHaveCount(0);
  await expect(page.getByTestId("advent-grid")).toBeVisible();
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "solved");
  await shot(page, "11-megtartott-allapot");
  // 3) A hiba elmúltával az „Újra” visszahozza a friss állapotot, a sáv eltűnik, a naptár játszható.
  await page.unroute("**/api/advent/state");
  await page.unroute("**/api/advent/doors/2/open");
  await page.getByTestId("advent-stale-retry").tap();
  await expect(page.getByTestId("advent-stale")).toHaveCount(0);
  await page.getByTestId("advent-error-retry").tap();
  await playDoor(page, 2, true);
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
  await tapDoor(page, 24);
  await pickOption(page, true);
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-summary")).toBeVisible();
  await expect(page.getByTestId("advent-gift-message")).toHaveText(ADVENT_GIFT_MESSAGE);
  await expect(page.getByTestId("advent-summary")).toContainText("24 / 24");
  await expect(page.getByTestId("advent-summary")).toContainText("Elsőre jó: 24 / 24");
  await expect(page.getByTestId("advent-summary-date")).toContainText("2026. december 24.");
  // Visszatérő gyerek (újratöltés): az ajándék-üzenet a rács fölött azonnal látszik, keresés nélkül (S3 K3).
  await page.reload();
  await expect(page.getByTestId("advent-gift-banner")).toBeVisible();
  await expect(page.getByTestId("advent-gift-banner")).toHaveText(ADVENT_GIFT_MESSAGE);
  await shot(page, "07b-visszatero-uzenet");
  await page.getByTestId("advent-gift-banner").tap();
  await expect(page.getByTestId("advent-gift-message")).toHaveText(ADVENT_GIFT_MESSAGE);
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
  await expect(page.getByTestId("advent-back-home")).toBeVisible();
  await expect(page.locator(".advent-door")).toHaveCount(0);
  await setAdventTime(page, DEC5);
  await page.goto("/adventi-naptar");
  await chooseGrade(page, 5);
  await playDoor(page, 1, true);
  await setAdventTime(page, "2027-01-07T10:00:00Z");
  await page.reload();
  await expect(page.getByTestId("advent-closed")).toContainText("Az idei naptár bezárt");
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "solved");
  await tapDoor(page, 2, { force: true });
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  await clearAdventTime(page);
  await page.reload();
  await expect(page.getByText("A naptár most nem érhető el.")).toBeVisible();
});

test("csökkentett mozgás: nincs hóesés és futó animáció; rendes módban a hó a kérdés alatt és rejtett lapon áll (A27, A29, M6, M9)", async ({ page }) => {
  await openCalendar(page, DEC5, 5);
  await expect(page.getByTestId("advent-snow")).toHaveAttribute("data-paused", "false");
  expect(await page.locator(".advent-snow__flake").count()).toBeLessThanOrEqual(24);
  await tapDoor(page, 1);
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
      // M4 valódi peremmel (a végrehajtási utasítás 47 / 34 px-e; fekvőben a perem oldalt van).
      const insets = viewport.width > viewport.height ? { top: 0, right: 47, bottom: 21, left: 47 } : { top: 47, right: 0, bottom: 34, left: 0 };
      await emulateSafeArea(page, insets);
      await page.waitForTimeout(100);
      expect(await safeAreaViolations(page, insets), "M4").toEqual([]);
      expect(await measureOverflow(page), "M1 peremmel").toEqual({ x: 0, y: 0 });
      await tapDoor(page, 23);
      await expect(page.getByTestId("advent-question")).toBeVisible();
      expect(await overlappingTargets(page, '[data-testid^="advent-option-"]'), "egymást fedő válaszok").toEqual([]);
      await measure("kerdes");
      await pickOption(page, true);
      await expect(page.getByTestId("advent-next"), "a „Tovább” a nézeten belül van (fekvő telefonon is)").toBeInViewport({ ratio: 1 });
      await measure("visszajelzes");
      await page.getByTestId("advent-next").tap();
      await page.getByTestId("advent-summary-open").tap();
      await expect(page.getByTestId("advent-summary")).toBeVisible();
      await measure("osszesites");
      expect(errors, "konzolhiba (A32)").toEqual([]);
    });

    test("az ajándék-összesítés ezen a méreten: a szó szerinti üzenet teljes egészében látszik, nincs oldalgörgetés, a záró kép aránya megmarad (A26, S3 K5)", async ({ page }) => {
      await openCalendar(page, DEC24);
      await seedProgress(page, DEC24, { grade: 5, days: range(1, 24) });
      await page.reload();
      await page.getByTestId("advent-summary-open").tap();
      await expect(page.getByTestId("advent-gift-message")).toHaveText(ADVENT_GIFT_MESSAGE);
      await settle(page);
      expect(await measureOverflow(page), "M1").toEqual({ x: 0, y: 0 });
      expect(await smallTargets(page), "M2").toEqual([]);
      expect(await smallFonts(page), "M3").toEqual([]);
      await expect(page.getByTestId("advent-gift-message")).toBeInViewport({ ratio: 1 });
      const art = (await page.locator(".advent-summary__art").boundingBox())!;
      expect(Math.abs(art.width / art.height - 4 / 3), "a záró kép aránya: " + art.width + " × " + art.height).toBeLessThan(0.05);
      await shot(page, "m-ajandek");
    });
  });
}

test.describe("asztali nézet 1366×768", () => {
  test.use({ viewport: { width: 1366, height: 768 }, isMobile: false });

  test("a naptár, a kérdés és az összesítés asztali méretben: mind a 24 ablak a nézeten belül, nincs oldalgörgetés (A26)", async ({ page }) => {
    await openCalendar(page, DEC24);
    await seedProgress(page, DEC24, { grade: 5, days: range(1, 22), wrong: [4] });
    await page.reload();
    await expect(page.getByTestId("advent-grid")).toBeVisible();
    await settle(page);
    expect(await measureOverflow(page)).toEqual({ x: 0, y: 0 });
    const boxes = await page.locator(".advent-door").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
    expect(boxes).toHaveLength(24);
    for (const b of boxes) expect(b.top >= 0 && b.left >= 0 && b.bottom <= 768 && b.right <= 1366, `ablak a nézeten belül: ${JSON.stringify(b)}`).toBe(true);
    await shot(page, "d-naptar");
    await page.getByTestId("advent-door-23").click();
    await expect(page.getByTestId("advent-question")).toBeVisible();
    await shot(page, "d-kerdes");
    await pickOption(page, true, "click");
    await shot(page, "d-visszajelzes");
    await page.getByTestId("advent-next").click();
    await page.getByTestId("advent-summary-open").click();
    await expect(page.getByTestId("advent-summary")).toBeVisible();
    await shot(page, "d-osszesites");
    // Egérrel végig (M5): javítás az összesítésből, az utolsó ablak, majd az ajándék-üzenet — koppintás nélkül.
    await page.getByTestId("advent-repair-from-summary").click();
    await pickOption(page, true, "click");
    await page.getByTestId("advent-next").click();
    await page.getByTestId("advent-door-24").click();
    await pickOption(page, true, "click");
    await page.getByTestId("advent-next").click();
    await expect(page.getByTestId("advent-gift-message")).toHaveText(ADVENT_GIFT_MESSAGE);
    await settle(page);
    await shot(page, "d-ajandek-uzenet");
  });
});
