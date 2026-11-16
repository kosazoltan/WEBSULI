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

test("Szikla-verseny: egy teljes menet valódi érintéssel, kampó nélkül — mászás, megcsúszás, eredmény, visszavágó", async ({ page }) => {
  test.setTimeout(330_000);
  await stubApi(page);
  await page.goto("/games/word-ladder-hu-en");
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
  while (Date.now() < deadline && !(await result.isVisible().catch(() => false))) {
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
    const before = await rungText(page);
    await holds.nth(idx).tap().catch(() => undefined);
    // A kép: a helyes kapaszkodó zöld (jó fogásnál a megfogott, rossznál a másik).
    const green = page.locator('[data-testid^="wl-option-"][data-state="correct"]');
    if (await green.first().isVisible({ timeout: 1_500 }).catch(() => false)) {
      const label = (await green.first().locator(".wl-hold-label").innerText()).trim();
      if (prompt && label) known.set(prompt, label);
      const state = await holds.nth(idx).getAttribute("data-state");
      if (state === "wrong") slipped = true;
      if (state === "correct") {
        // A HUD ≤ 10 Hz-cel frissül: a fok-szám a következő pillanatképben nő.
        await expect.poll(() => rungText(page), { timeout: 1_000 }).not.toBe(before).catch(() => undefined);
        if ((await rungText(page)) !== before) climbed = true;
      }
    }
    // Menet közben soha nincs blokkoló kártya (a „Miért?” nélkül).
    expect(await page.locator('[role="dialog"]').count()).toBe(0);
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
