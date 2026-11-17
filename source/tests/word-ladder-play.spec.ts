import { expect, test, type Page } from "@playwright/test";

/**
 * J2a — Szikla-verseny, TESZT-KAMPÓ NÉLKÜL, valódi érintéssel (végrehajtás J2a 7., K.4/14, terv J9, J16).
 *
 * A teszt úgy játszik, ahogy egy gyerek: koppint a falon lévő kapaszkodókra (`locator.tap()` — érintés-esemény, nem
 * egérkattintás), nem használja a `forceState` / `probe` kampót és a `data-correct` jelölést sem. Amit lát, az a kép:
 * a hibás fogás után a helyes kapaszkodó zölden (`data-state="correct"`) világít — ebből tanul (a rosszul tudott szó a
 * menetben 3–6 kérdésen belül visszatér, és akkor már tudja). Egy teljes menetet visz végig az eredményképernyőig
 * (győzelem vagy vereség — a rivális miatt mindkettő lehetséges), és ellenőrzi: menet közben nincs blokkoló párbeszédablak,
 * a mászás és a rivális látszik, a végén az eredmény a „Gyakorold még” listával és visszavágóval jön, automatikus
 * újraindítás nélkül.
 *
 * SPEC-VÁLTOZÁS 2026-11-17 (szoletra-olvashatosag, terv F — determinisztikussá tétel, a mérce változatlan):
 * - gyökérok 1: a menet aszinkron véget érhet (a rivális felér → azonnal eredményképernyő, `role="dialog"`) a ciklus eleji
 *   `result.isVisible()` és a ciklus végi párbeszédablak-számlálás között → hamis „blokkoló kártya” (main CI 44028107372,
 *   „Expected 0, Received 1”). Most egyetlen `page.evaluate` olvassa az állapotot (C-64): az eredményképernyőn
 *   (`[data-game-result]`) kívüli párbeszédablak száma 0, és ha az eredmény már látszik, a ciklus kilép.
 * - gyökérok 2: a menet falióra-hossza nem volt korlátos — a világ képkockánként ≤ 5 fix lépést tesz, így lassú CI-n
 *   (szoftveres WebGL) a rivális a falióránál lassabban halad, a 24–35 fokos menet 300 s fölé nyúlt („Test timeout of
 *   330000ms”). Most rögzített seeddel (`?seed=`) és rövid fallal (`?wall=4`, csak teszt-kampós buildben) fut: a menet
 *   játékidőben korlátos. A fogás az előjelzés (600 ms) után élesedik — a teszt az engedélyezett fogásra vár.
 * - helyi lassú-gép próba: `E2E_CPU_THROTTLE=6` (CDP CPU-lassítás) — a CI-ben nincs megadva.
 */

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function stubApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "5");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p.includes("leaderboard") || p.includes("/api/games/score")) data = { ok: true };
    await route.fulfill({ json: data });
  });
}

const rungText = async (page: Page) => (await page.getByTestId("wl-rung").innerText()).trim();

/** Egyetlen olvasás (C-64): látszik-e az eredmény, és hány párbeszédablak van az eredményképernyőn KÍVÜL. */
const screenState = (page: Page) =>
  page.evaluate(() => ({
    result: document.querySelector('[data-testid="wl-won"]') !== null,
    dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => !d.closest("[data-game-result]")).length,
  }));

test("Szikla-verseny: egy teljes menet valódi érintéssel, kampó nélkül — mászás, megcsúszás, eredmény, visszavágó", async ({ page }) => {
  test.setTimeout(330_000);
  const throttle = Number(process.env.E2E_CPU_THROTTLE ?? 0);
  if (throttle > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await stubApi(page);
  await page.goto("/games/word-ladder-hu-en?seed=7&wall=4");
  await page.getByTestId("wl-start").tap();

  // A verseny-jelenet, a HUD-ban a két versenyző és a tanító sor (K.4/25) látszik.
  await expect(page.getByTestId("wl-race")).toBeVisible();
  await expect(page.getByTestId("wl-teach")).toBeVisible();
  await expect(page.getByTestId("wl-rung")).toHaveText(/^0\/\d+$/);

  const known = new Map<string, string>();
  const holds = page.locator('[data-testid^="wl-option-"]');
  const result = page.getByTestId("wl-won");
  let climbed = false;
  let slipped = false;
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const s = await screenState(page);
    // Menet közben soha nincs blokkoló kártya (a „Miért?” nélkül); az eredményképernyő a menet vége.
    expect(s.dialogs, "menet közben nincs blokkoló párbeszédablak").toBe(0);
    if (s.result) break;
    const enabled = page.locator('[data-testid^="wl-option-"]:not([disabled])');
    if ((await enabled.count()) !== 4) {
      await page.waitForTimeout(120);
      continue;
    }
    const prompt = (await page.getByTestId("wl-prompt").innerText().catch(() => "")).trim();
    const labels = await holds.locator(".wl-hold-label").allInnerTexts();
    const want = known.get(prompt);
    let idx = want ? labels.findIndex((l) => l.trim() === want) : -1;
    if (idx < 0) idx = 0;
    const before = await rungText(page).catch(() => "");
    await holds.nth(idx).tap({ timeout: 2_000 }).catch(() => undefined);
    // A kép: a helyes kapaszkodó zöld (jó fogásnál a megfogott, rossznál a másik).
    const green = page.locator('[data-testid^="wl-option-"][data-state="correct"]');
    if (await green.first().isVisible({ timeout: 1_500 }).catch(() => false)) {
      const label = (await green.first().locator(".wl-hold-label").innerText({ timeout: 1_000 }).catch(() => "")).trim();
      if (prompt && label) known.set(prompt, label);
      const state = await holds.nth(idx).getAttribute("data-state", { timeout: 1_000 }).catch(() => null);
      if (state === "wrong") slipped = true;
      if (state === "correct") {
        // A HUD ≤ 10 Hz-cel frissül: a fok-szám a következő pillanatképben nő.
        await expect.poll(() => rungText(page).catch(() => before), { timeout: 1_000 }).not.toBe(before).catch(() => undefined);
        if ((await rungText(page).catch(() => before)) !== before) climbed = true;
      }
    }
  }

  await expect(result).toBeVisible();
  expect(climbed, "egy jó fogás feljebb vitt").toBe(true);
  expect(slipped, "egy rossz fogás megcsúszást mutatott").toBe(true);
  const title = (await result.locator("h2").first().innerText()).trim();
  expect(title).toMatch(/Elérted a csúcsot|Majdnem! \d+ fok hiányzott\./);
  // J16: a hibázott tételek a helyes válasszal („Gyakorold még”).
  await expect(page.getByTestId("result-review")).toBeVisible();
  await expect(page.getByTestId("result-review-item").first()).toBeVisible();
  // J9: az eredményképernyőn megáll — 5 mp-ig nincs új menet magától.
  await page.waitForTimeout(5_000);
  await expect(result).toBeVisible();
  // Visszavágó / új menet csak koppintásra.
  await page.getByTestId("wl-restart").tap();
  await expect(result).toBeHidden();
  await expect(page.getByTestId("wl-rung")).toHaveText(/^0\/\d+$/);
});
