import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank/index";
import { learnerLinkSecret, signLearnerToken } from "../server/lib/learner-token";
import { ADVENT_ART_SPECS } from "../shared/advent/art";
import { CHRISTMAS_ITEMS } from "../shared/advent/christmasBank/index";
import { chooseGrade, pickOption, playDoor, proxyHeaders, seedProgress, setAdventTime, settle, shot } from "./support/advent-e2e";
import { measureOverflow, overlappingTargets } from "./support/game-mobile-quality";

/**
 * Adventi naptár — a vak, hibakereső ellenőr 1. körének leletei böngészőben (docs/specs/2026-11-18-adventi-naptar.md 6., 7., 14.,
 * 16.5): nyers hibaszöveg (K1), évfolyam megerősítése és módosítása (K3), ablakképek helye (K4), lassú hálózat (K5), stabil
 * sorrend (S1), fekvő telefon (S2), két lap (S3), dupla „Tovább” (S4), fókusz (S5), bezárt naptár (S6), eszközazonosító (S8),
 * leghosszabb szövegek, érvényes párosított tanuló.
 */
test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const DEC5 = "2026-12-05T10:00:00Z";
const DEC24 = "2026-12-24T10:00:00Z";
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const order = (page: Page) => page.locator(".advent-door").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));

async function openCalendar(page: Page, iso: string, grade?: number) {
  await setAdventTime(page, iso);
  await page.goto("/adventi-naptar");
  await expect(page.getByTestId("advent-page")).toBeVisible();
  if (grade !== undefined) {
    await chooseGrade(page, grade);
    await expect(page.getByTestId("advent-grid")).toBeVisible();
  }
}

/** A lapon látható szöveg sehol nem tartalmaz nyers szerverválaszt (HTML-t, JSON-t, angol hibanevet). */
async function expectNoRawError(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text, "nyers HTML / JSON a lapon").not.toMatch(/<\/?[a-z][^>]*>|\{"|Bad Gateway|Internal Server Error|Forbidden|EBADTOKEN|cloudflare/i);
}

test("5xx, HTML-törzs, üres és nem a naptártól jövő válasz: a gyerek SOHA nem lát nyers szerverhibát; nyitott kérdésnél a hiba egyszer jelenik meg (K1)", async ({ page }) => {
  await openCalendar(page, DEC5, 5);
  // 1) 502 a proxytól, HTML-oldallal, az ablak megnyitásakor.
  await page.route("**/api/advent/doors/1/open", (route) => route.fulfill({ status: 502, contentType: "text/html", body: "<html> <head><title>502 Bad Gateway</title></head> <body> <center><h1>502 Bad Gateway</h1></center> <hr><center>cloudflare</center> </body> </html>" }));
  await page.getByTestId("advent-door-1").tap();
  await expect(page.getByTestId("advent-error")).toContainText("Most nem sikerült kinyitni az ablakot");
  await expectNoRawError(page);
  await shot(page, "r-k1-502");
  await page.unroute("**/api/advent/doors/1/open");
  // 2) 403 JSON `message` nélkül (pl. lejárt CSRF-token) a megnyitásnál: alapszöveg, nem a nyers JSON.
  await page.route("**/api/advent/doors/2/open", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Forbidden", code: "EBADTOKEN" }) }));
  await page.getByTestId("advent-error-retry").tap();
  await page.getByTestId("advent-door-2").tap();
  await expect(page.getByTestId("advent-error")).toContainText("Most nem sikerült kinyitni az ablakot");
  await expectNoRawError(page);
  await page.unroute("**/api/advent/doors/2/open");
  await page.getByTestId("advent-error-retry").tap();
  // 3) 500 angol szöveggel a VÁLASZNÁL (nyitott kérdés): a hiba a párbeszédablakban van, és csak EGYSZER.
  await page.getByTestId("advent-door-1").tap();
  await expect(page.locator('.advent-options[data-armed="true"]')).toBeVisible();
  await page.route("**/api/advent/doors/1/answer", (route) => route.fulfill({ status: 500, contentType: "text/plain", body: "Internal Server Error" }));
  await page.getByTestId("advent-option-0").tap();
  await expect(page.getByTestId("advent-dialog").getByTestId("advent-error")).toContainText("Most nem sikerült elküldeni a válaszodat", { timeout: 20_000 });
  await expect(page.getByTestId("advent-error")).toHaveCount(1);
  await expectNoRawError(page);
  await shot(page, "r-k1-500-valasz");
  // 4) Üres törzsű 500 után a hiba elmúlik: a válasz újraküldhető, a naptár játszható.
  await page.unroute("**/api/advent/doors/1/answer");
  await pickOption(page, true);
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "solved");
  await page.route("**/api/advent/round", (route) => route.fulfill({ status: 500, body: "" }));
  await expectNoRawError(page);
});

test("évfolyam: megerősítés koppintás után, „Másik évfolyam”, az első válaszig módosítható, utána magyarázat (K3)", async ({ page }) => {
  let gradePosts = 0;
  await openCalendar(page, DEC5);
  page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/advent/grade")) gradePosts++; });
  // Félrekoppintás: a 12. — megerősítés nélkül semmi nem rögzül.
  await page.getByTestId("advent-grade-12").tap();
  await expect(page.getByTestId("advent-grade-confirm")).toContainText("12. osztály — jó így?");
  await shot(page, "r-k3-megerosites");
  expect(gradePosts, "megerősítés előtt nincs mentés").toBe(0);
  await page.getByTestId("advent-grade-no").tap();
  await expect(page.getByTestId("advent-grade-12")).toBeVisible();
  await chooseGrade(page, 2);
  await expect(page.getByTestId("advent-grid")).toBeVisible();
  expect(gradePosts).toBe(1);
  // Az első válaszig látható a módosítás lehetősége.
  await expect(page.getByTestId("advent-grade-info")).toContainText("2. osztályos kérdéseket kapsz");
  await shot(page, "r-k3-modosithato");
  await page.getByTestId("advent-grade-change").tap();
  await expect(page.getByTestId("advent-grade-cancel")).toBeVisible();
  await chooseGrade(page, 3);
  await expect(page.getByTestId("advent-grade-info")).toContainText("3. osztályos kérdéseket kapsz");
  // Az első válasz után: nincs módosítás, az összesítés megmondja, miért.
  await playDoor(page, 1, true);
  await expect(page.getByTestId("advent-grade-change")).toHaveCount(0);
  await page.getByTestId("advent-summary-open").tap();
  await expect(page.getByTestId("advent-summary")).toContainText("3. osztály");
  await expect(page.getByTestId("advent-grade-locked")).toContainText("már nem lehet módosítani");
});

test("ablakképek helye: a négyzetes kép teljes egészében látszik, a szám sarokjelvény — telefonon és asztalon; a girland helye = a jegyzék aránya (K4)", async ({ page }) => {
  await openCalendar(page, DEC5, 5);
  await playDoor(page, 1, true);
  for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 768 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await settle(page);
    const geo = await page.getByTestId("advent-door-1").evaluate((door) => {
      const art = door.querySelector<HTMLElement>(".advent-door__art")!;
      const num = door.querySelector<HTMLElement>(".advent-door__num")!;
      const d = door.getBoundingClientRect(); const a = art.getBoundingClientRect(); const n = num.getBoundingClientRect();
      return { fit: getComputedStyle(art).objectFit, door: { w: d.width, h: d.height }, artInside: a.left >= d.left && a.right <= d.right && a.top >= d.top && a.bottom <= d.bottom,
        numRight: n.right - d.left, numBottom: n.bottom - d.top, numFont: parseFloat(getComputedStyle(num).fontSize) };
    });
    expect(geo.fit, "a kép nem vágódik: object-fit").toBe("contain");
    expect(geo.artInside, "a kép doboza az ablakon belül").toBe(true);
    // A jelvény a bal felső sarokban ül: nem ér be az ablak közepére (a motívum helyére).
    expect(geo.numRight, `jelvény jobb széle (${size.width}×${size.height}, ablak ${Math.round(geo.door.w)}×${Math.round(geo.door.h)})`).toBeLessThanOrEqual(geo.door.w * 0.5);
    expect(geo.numBottom).toBeLessThanOrEqual(geo.door.h * 0.4);
    expect(geo.numFont).toBeGreaterThanOrEqual(12);
    const garland = (await page.locator(".advent-garland").boundingBox())!;
    const spec = ADVENT_ART_SPECS["advent-garland"]!;
    expect(Math.abs(garland.width / garland.height - spec.width / spec.height), `girland: ${garland.width} × ${garland.height}`).toBeLessThan(0.2);
    await shot(page, "r-k4-ablakkep");
  }
});

test("lassú hálózat (3 mp): az ablak azonnal jelez, a többi láthatóan vár, ~1 mp után szöveg is; a rács közben nem ugrik (K5)", async ({ page }) => {
  await openCalendar(page, DEC5, 5);
  const gridBefore = (await page.getByTestId("advent-grid").boundingBox())!;
  await page.route("**/api/advent/doors/3/open", async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.fallback(); });
  await page.getByTestId("advent-door-3").tap();
  // Azonnal (jóval a válasz előtt): töltésjelzés az ablakon és a rácson.
  await expect(page.getByTestId("advent-door-3")).toHaveAttribute("aria-busy", "true", { timeout: 500 });
  await expect(page.getByTestId("advent-door-3")).toHaveAttribute("data-opening", "true");
  await expect(page.getByTestId("advent-door-3")).toHaveAccessibleName("3. ablak — nyílik…");
  await expect(page.getByTestId("advent-grid")).toHaveAttribute("data-busy", "true");
  // Másik ablakra koppintva nem „halott”: megmondja, hogy várni kell.
  await page.getByTestId("advent-door-2").tap({ force: true });
  await expect(page.getByTestId("advent-notice")).toContainText("még nyílik az előző ablak");
  await expect(page.getByTestId("advent-opening")).toContainText("Nyitjuk a 3. ablakot");
  await shot(page, "r-k5-lassu-nyitas");
  const gridDuring = (await page.getByTestId("advent-grid").boundingBox())!;
  expect(gridDuring, "a rács helye és mérete nem változik az üzenetektől").toEqual(gridBefore);
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  await expect(page.getByTestId("advent-question")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("advent-opening")).toHaveCount(0);
});

test("időkorlát: ha a megnyitás ~15 mp-ig nem felel, barátságos üzenet és újrapróba jön — nem végtelen várakozás (K5)", async ({ page }) => {
  test.setTimeout(60_000);
  await openCalendar(page, DEC5, 5);
  let held = 0;
  await page.route("**/api/advent/doors/1/open", async (route) => { held++; await new Promise((r) => setTimeout(r, 25_000)); await route.abort().catch(() => undefined); });
  const started = Date.now();
  await page.getByTestId("advent-door-1").tap();
  await expect(page.getByTestId("advent-error")).toContainText("Most nem sikerült kinyitni az ablakot", { timeout: 22_000 });
  const waited = Date.now() - started;
  expect(waited, `várakozás: ${waited} ms`).toBeGreaterThan(13_000);
  expect(waited).toBeLessThan(20_000);
  expect(held).toBe(1);
  await expectNoRawError(page);
  await page.unroute("**/api/advent/doors/1/open");
  await page.getByTestId("advent-error-retry").tap();
  await playDoor(page, 1, true);
});

test("az ablakok sorrendje stabil: az évfolyam megadása után, az első válasz után és újratöltés után ugyanaz (S1)", async ({ page }) => {
  await openCalendar(page, DEC5, 5);
  const first = await order(page);
  expect(first).toHaveLength(24);
  expect(first, "a sorrend kevert (nem 1…24)").not.toEqual(range(1, 24).map((d) => `advent-door-${d}`));
  await playDoor(page, 1, true);
  expect(await order(page), "az első válasz után").toEqual(first);
  await page.reload();
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "solved");
  expect(await order(page), "újratöltés után").toEqual(first);
});

for (const size of [{ width: 844, height: 390 }, { width: 640, height: 360 }]) {
  test(`fekvő telefon ${size.width}×${size.height}: ajándék-sáv + javítható ablak + hibasáv mellett sem lóg ablak a „Javítom” gombra, és semmi nem vágódik le (S2)`, async ({ page }) => {
    await page.setViewportSize(size);
    await openCalendar(page, DEC24);
    await seedProgress(page, DEC24, { grade: 5, days: range(1, 24), wrong: [4] });
    await page.reload();
    await expect(page.getByTestId("advent-gift-banner")).toBeVisible();
    await page.route("**/api/advent/doors/4/open", (route) => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ message: "Túl sok kérés.", limit: "ip" }) }));
    await page.getByTestId("advent-repair").tap();
    await expect(page.getByTestId("advent-error")).toBeVisible({ timeout: 15_000 });
    await settle(page);
    const layout = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>(".advent-content")!;
      const repair = document.querySelector<HTMLElement>('[data-testid="advent-repair"]')!.getBoundingClientRect();
      const doors = [...document.querySelectorAll<HTMLElement>(".advent-door")].map((d) => d.getBoundingClientRect());
      const hidden = content.scrollHeight - content.clientHeight;
      return {
        overRepair: doors.filter((d) => d.bottom > repair.top + 1 && d.top < repair.bottom - 1).length,
        minDoor: Math.min(...doors.map((d) => Math.min(d.width, d.height))),
        hidden, scrollable: hidden <= 1 || getComputedStyle(content).overflowY === "auto",
      };
    });
    expect(layout.overRepair, "ablak a „Javítom” gombon").toBe(0);
    expect(layout.minDoor, "az ablak nem zsugorodik 48 px alá").toBeGreaterThanOrEqual(48);
    expect(layout.scrollable, `ami nem fér ki (${layout.hidden} px), az görgetéssel elérhető`).toBe(true);
    expect(await measureOverflow(page)).toEqual({ x: 0, y: 0 });
    // A „Javítom” gomb görgetéssel a nézetbe hozható és koppintható.
    await page.getByTestId("advent-repair").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("advent-repair")).toBeInViewport({ ratio: 1 });
    await shot(page, "r-s2-fekvo");
  });
}

test("két lap ugyanazon a kérdésen: a második lap a TÁROLT eredményt kapja, és ezt ki is mondja — nem a saját koppintását minősíti (S3)", async ({ page, context }) => {
  await openCalendar(page, DEC5, 5);
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date(DEC5));
  await other.goto("/adventi-naptar");
  await expect(other.getByTestId("advent-grid")).toBeVisible();
  // Egyszerre csak egy lap van előtérben (a háttérlapon a böngésző megállítja az animációkat): a gyerek is váltogat.
  await page.bringToFront();
  await page.getByTestId("advent-door-2").tap();
  await expect(page.getByTestId("advent-question")).toBeVisible();
  await other.bringToFront();
  await other.getByTestId("advent-door-2").tap();
  await expect(other.getByTestId("advent-question")).toHaveText(await page.getByTestId("advent-question").innerText());
  // Az első lap hibásan válaszol; a második a HELYES válaszra koppint.
  await page.bringToFront();
  await pickOption(page, false);
  await other.bringToFront();
  await pickOption(other, true);
  await expect(other.getByTestId("advent-already-answered")).toContainText("Ezt a kérdést már megválaszoltad");
  await expect(other.getByTestId("advent-feedback")).not.toContainText("Most nem sikerült");
  await expect(other.locator('.advent-option[data-mark="wrong"]')).toHaveCount(1);
  await expect(other.locator('.advent-option[data-mark="correct"]')).toHaveCount(1);
  await shot(other, "r-s3-ket-lap");
  await other.close();
});

test("dupla koppintás a „Tovább” gombon: a második koppintás nem éri a mögöttes ablakot; a fókusz oda megy vissza, ahonnan a kérdés nyílt (S4, S5)", async ({ page }) => {
  await openCalendar(page, DEC5, 5);
  let opens = 0;
  page.on("request", (r) => { if (r.method() === "POST" && /\/doors\/\d+\/open$/.test(r.url())) opens++; });
  await page.getByTestId("advent-door-3").tap();
  await pickOption(page, false);
  const next = (await page.getByTestId("advent-next").boundingBox())!;
  const x = next.x + next.width / 2; const y = next.y + next.height / 2;
  await page.touchscreen.tap(x, y);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("advent-dialog")).toHaveCount(0);
  await expect(page.getByTestId("advent-notice")).toHaveCount(0);
  expect(opens, "a második koppintás nem nyitott ablakot").toBe(1);
  // Fókusz: a „Javítom …” gombbal nyitott kérdés bezárása után a gombra megy vissza.
  await page.getByTestId("advent-repair").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("advent-question")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("advent-repair")).toBeFocused();
  // Az összesítés bezárása után a fókusz a megnyitó gombon van, nem vész el.
  await page.getByTestId("advent-summary-open").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("advent-summary")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("advent-summary-open")).toBeFocused();
});

test("magától megnyílt összesítés bezárása után a fókusz nem vész el (S5)", async ({ page }) => {
  await openCalendar(page, DEC24);
  await seedProgress(page, DEC24, { grade: 5, days: range(1, 23) });
  await page.reload();
  await page.getByTestId("advent-door-24").focus();
  await page.keyboard.press("Enter");
  await pickOption(page, true);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("advent-summary")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("advent-summary")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.tagName), "a fókusz nem a BODY-n van").not.toBe("BODY");
});

test("bezárt naptár (január): nincs „javítható” ablak és „december N-én nyílik” felirat; semmi nem koppintható (S6)", async ({ page }) => {
  await openCalendar(page, DEC5, 5);
  await page.getByTestId("advent-door-1").tap();
  await pickOption(page, false);
  await page.getByTestId("advent-next").tap();
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "repairable");
  await setAdventTime(page, "2027-01-07T10:00:00Z");
  await page.reload();
  await expect(page.getByTestId("advent-closed")).toBeVisible();
  await expect(page.getByTestId("advent-door-1")).toHaveAttribute("data-state", "failed");
  await expect(page.locator('.advent-door[data-state="repairable"]')).toHaveCount(0);
  await expect(page.getByTestId("advent-repair")).toHaveCount(0);
  await expect(page.getByTestId("advent-door-1")).toHaveAccessibleName(/az idei naptár bezárt/);
  await expect(page.getByTestId("advent-door-12")).toHaveAccessibleName("12. ablak — az idei naptár bezárt");
  const names = await page.locator(".advent-door").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(names.filter((n) => /nyílik|nyitható|javítható$/.test(n)), "decemberi feliratok januárban").toEqual([]);
  await shot(page, "r-s6-bezart");
});

test("adatvédelem: a főoldal nem hoz létre és nem küld eszközazonosítót annak, aki nem játszik; a naptároldal megnyitásakor jön létre (S8)", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/advent/")) sent.push(`${r.method()} ${new URL(r.url()).pathname} ${r.headers()["x-advent-device"] ? "device" : "-"}`); });
  await setAdventTime(page, "2026-12-03T10:00:00Z");
  await page.goto("/");
  await expect(page.getByTestId("advent-home-card")).toBeVisible();
  await expect(page.getByTestId("advent-home-status")).toHaveText("Nyisd ki a mai ablakot!");
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.localStorage.getItem("websuli.advent.device")), "eszközazonosító a főoldal után").toBeNull();
  expect(sent.filter((s) => s.includes("/state")), "személyes állapot-lekérdezés a főoldalról").toEqual([]);
  expect(sent.filter((s) => s.endsWith("device")), "azonosítót vivő kérés a főoldalról").toEqual([]);
  // Aki a naptárra megy, annál létrejön — és utána a főoldali kártya már a saját állapotát mutatja.
  await page.getByTestId("advent-home-cta").tap();
  await expect(page.getByTestId("advent-grade-picker")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("websuli.advent.device"))).toMatch(/^[0-9a-f-]{36}$/);
});

const ALL = [...CHRISTMAS_ITEMS, ...GRADE_QUIZ_ITEMS];
const longest = <T,>(items: readonly T[], size: (item: T) => number): T => items.reduce((best, item) => (size(item) > size(best) ? item : best));
const LONG_PROMPT = longest(ALL, (q) => q.prompt.length).prompt;
const LONG_OPTIONS = [...ALL.flatMap((q) => q.options)].sort((a, b) => b.length - a.length).slice(0, 4);
const LONG_EXPLANATION = longest(ALL, (q) => q.explanation.length).explanation;

for (const size of [{ width: 360, height: 640 }, { width: 844, height: 390 }]) {
  test(`a bank leghosszabb kérdése, válaszai és magyarázata ${size.width}×${size.height}-on: nincs kilógás, a válaszok nem fedik egymást, a „Tovább” elérhető`, async ({ page }) => {
    await page.setViewportSize(size);
    await openCalendar(page, DEC5, 5);
    // A valódi válaszba a bank LEGHOSSZABB szövegei kerülnek (a pontozás valódi marad) — a felület elrendezését mérjük.
    await page.route("**/api/advent/doors/1/open", async (route) => {
      const response = await route.fetch({ headers: proxyHeaders(route.request().headers()) });
      const body = (await response.json()) as { question: Record<string, unknown> };
      await route.fulfill({ response, json: { ...body, question: { ...body.question, prompt: LONG_PROMPT, options: LONG_OPTIONS } } });
    });
    await page.route("**/api/advent/doors/1/answer", async (route) => {
      const response = await route.fetch({ headers: proxyHeaders(route.request().headers()) });
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({ response, json: { ...body, explanation: LONG_EXPLANATION } });
    });
    await page.getByTestId("advent-door-1").tap();
    await expect(page.getByTestId("advent-question")).toHaveText(LONG_PROMPT);
    await expect(page.locator('.advent-options[data-armed="true"]')).toBeVisible();
    await settle(page);
    expect(await measureOverflow(page), "kérdés").toEqual({ x: 0, y: 0 });
    expect(await overlappingTargets(page, '[data-testid^="advent-option-"]')).toEqual([]);
    const clipped = await page.locator(".advent-option").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    expect(clipped, "levágott válasz").toBe(0);
    await shot(page, "r-hosszu-kerdes");
    await page.getByTestId("advent-option-0").tap();
    await expect(page.getByTestId("advent-next")).toBeVisible();
    await expect(page.getByTestId("advent-feedback")).toContainText(LONG_EXPLANATION.slice(0, 40));
    await expect(page.getByTestId("advent-next")).toBeInViewport({ ratio: 1 });
    expect(await measureOverflow(page), "visszajelzés").toEqual({ x: 0, y: 0 });
    await shot(page, "r-hosszu-visszajelzes");
  });
}

test.describe("érvényes párosított tanuló", () => {
  const DATABASE_URL = process.env.DATABASE_URL ?? "";
  let pool: pg.Pool;
  let learner: { id: string; token: string };

  test.beforeAll(async () => {
    const secret = learnerLinkSecret();
    expect(DATABASE_URL && secret, "a teszt az e2e-harness adatbázisát és titkát használja").toBeTruthy();
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
    const { rows } = await pool.query<{ id: string; token_version: number }>(`INSERT INTO learners (name, grade) VALUES ($1, 4) RETURNING id, token_version`, ["Próba Panni"]);
    learner = { id: rows[0]!.id, token: signLearnerToken(rows[0]!.id, rows[0]!.token_version, secret!) };
  });
  test.afterAll(async () => {
    await pool.query(`DELETE FROM learners WHERE id = $1`, [learner.id]);
    await pool.end();
  });

  test("a tanuló évfolyama a profiljából jön (nincs választó és nincs módosítás), a haladás a tanulóhoz kötött — másik böngészőben is megvan (A17)", async ({ page, browser }) => {
    const useToken = (p: Page) => p.addInitScript((t) => { window.localStorage.setItem("websuli.learnerToken", t); }, learner.token);
    await useToken(page);
    await openCalendar(page, DEC5);
    await expect(page.getByTestId("advent-grid")).toBeVisible();
    await expect(page.getByTestId("advent-grade-picker")).toHaveCount(0);
    await expect(page.getByTestId("advent-grade-change")).toHaveCount(0);
    await expect(page.getByTestId("advent-pairing-invalid")).toHaveCount(0);
    await playDoor(page, 2, true);
    await page.getByTestId("advent-summary-open").tap();
    await expect(page.getByTestId("advent-summary-date")).toContainText("Panni");
    await expect(page.getByTestId("advent-summary-date")).toContainText("4. osztály");
    await expect(page.getByTestId("advent-grade-locked")).toHaveCount(0);
    await shot(page, "r-tanulo-osszesites");
    // Másik eszköz (új böngésző-környezet, más eszközazonosító) ugyanazzal a linkkel: ugyanaz a naptár.
    const elsewhere = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
    const second = await elsewhere.newPage();
    await useToken(second);
    await openCalendar(second, DEC5);
    await expect(second.getByTestId("advent-door-2")).toHaveAttribute("data-state", "solved");
    await expect(second.getByTestId("advent-progress")).toContainText("1 / 24 világít");
    const row = await pool.query<{ subject_kind: string; n: number }>(`SELECT subject_kind, count(*)::int AS n FROM advent_progress WHERE learner_id = $1 GROUP BY subject_kind`, [learner.id]);
    expect(row.rows, "egyetlen, a tanulóhoz kötött sor").toEqual([{ subject_kind: "learner", n: 1 }]);
    await elsewhere.close();
  });
});
