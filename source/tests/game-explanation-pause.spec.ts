import { expect, test, type Page } from "@playwright/test";

/**
 * SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny.md 9.; végrehajtás J2a 6.)
 *
 * A régi teszt („A1 — Szólétra: a magyarázó kártya alatt a kérdés NEM cserélődhet”) a BLOKKOLÓ kártyát rögzítette: rossz
 * válaszra magától nyílt a kártya, és a bezárásáig állt a játék. A „Szikla-verseny” nem blokkol (terv 4.1/2, G3). Az új
 * követelmény nem lazább, ezt méri:
 *  (a) hibás fogás után a helyes kapaszkodó `data-state="correct"` legalább 1,8 mp-ig látszik a falon;
 *  (b) a „Miért?” megnyomása nélkül nincs `[role="dialog"]` (nincs kártya, a játék fut tovább: a sim-idő nő);
 *  (c) a „Miért?” → `quiz-feedback` látható, és alatta a `probe().simTime` NEM nő (a magyarázat olvasása közben áll a
 *      menet — a régi „a kártya alatt áll az óra” követelmény megmarad), a kérdés sem cserélődik;
 *  (d) bezárás után a kérdés-sor folytatódik (új kérdés jön, a sim-idő újra nő).
 */

test.use({ serviceWorkers: "block" });

type GameWindow = { __websuliGame?: { probe?: () => Record<string, number | string | null> } };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") {
      data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    }
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p.includes("leaderboard") || p.includes("/api/games/score")) data = { ok: true };
    await route.fulfill({ json: data });
  });
});

const probe = (page: Page) => page.evaluate(() => (window as unknown as GameWindow).__websuliGame?.probe?.() ?? null);
const simTime = async (page: Page) => Number((await probe(page))?.simTime ?? Number.NaN);

test("Szólétra: hibás fogás után a helyes kapaszkodó ≥ 1,8 mp-ig zöld, kártya csak a „Miért?”-re, alatta áll a menet", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games/word-ladder-hu-en");
  await page.getByTestId("wl-start").click();
  await expect(page.getByTestId("wl-prompt")).toBeVisible({ timeout: 15_000 });

  const wrong = page.locator('[data-testid^="wl-option-"][data-correct="false"]').first();
  await expect(wrong).toBeEnabled({ timeout: 15_000 });
  const correct = page.locator('[data-testid^="wl-option-"][data-correct="true"]').first();
  const correctId = await correct.getAttribute("data-testid");
  // (a) a helyes kapaszkodó zöld, és legalább 1,8 mp-ig az marad. A lapon belül, képkockánként mérve (a CI szoftveres
  // WebGL-lel és buildelt szerverrel lassú: a Playwright-oldali várakozás + oda-vissza út a mérést torzítaná).
  await page.evaluate((id) => {
    const w = window as unknown as { __wlReveal?: { start: number | null; end: number | null } };
    w.__wlReveal = { start: null, end: null };
    const tick = () => {
      const st = document.querySelector(`[data-testid="${id}"]`)?.getAttribute("data-state");
      const r = w.__wlReveal!;
      if (r.start === null && st === "correct") r.start = performance.now();
      if (r.start !== null && r.end === null && st !== "correct") r.end = performance.now();
      if (r.end === null) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, correctId!);
  await wrong.click();
  const reveal = () => page.evaluate(() => (window as unknown as { __wlReveal: { start: number | null; end: number | null } }).__wlReveal);
  await expect.poll(async () => (await reveal()).start !== null, { timeout: 5_000 }).toBe(true);
  await expect.poll(async () => (await reveal()).end !== null, { timeout: 20_000 }).toBe(true);
  const r = await reveal();
  expect(r.end! - r.start!, "a helyes kapaszkodó legalább 1,8 mp-ig zöld").toBeGreaterThanOrEqual(1_800);

  // (b) a „Miért?” nélkül nincs párbeszédablak, és a játék fut (a rivális mászik: a sim-idő nő)
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
  const s1 = await simTime(page);
  await page.waitForTimeout(400);
  expect(await simTime(page)).toBeGreaterThan(s1);

  // (c) „Miért?” → kártya, alatta áll a sim-idő és a kérdés (a „Miért?” a kijelzés után még 4 mp-ig elérhető)
  await page.getByTestId("play-why").click();
  await expect(page.getByTestId("quiz-feedback")).toBeVisible();
  const frozenSim = await simTime(page);
  const frozenPrompt = (await page.getByTestId("wl-prompt").innerText()).trim();
  await page.waitForTimeout(2_500);
  expect(await simTime(page)).toBe(frozenSim);
  expect((await page.getByTestId("wl-prompt").innerText()).trim()).toBe(frozenPrompt);

  // (d) bezárás után a kérdés-sor folytatódik: a sim-idő nő, és új kérdés jön
  await page.getByTestId("quiz-feedback-dismiss").click();
  await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
  const qid = Number((await probe(page))?.questionId ?? 0);
  await expect.poll(async () => simTime(page), { timeout: 5_000 }).toBeGreaterThan(frozenSim);
  // Az új kérdéshez a már nyitott kérdés ablaka (≤ 9 mp kérdés-óra) + kijelzés kellhet; a kérdés-óra a lassú CI-n a
  // falióránál lassabban jár (képkockánként ≤ 250 ms), ezért bőven mért várakozás — a feltétel ugyanaz.
  // SPEC-VÁLTOZÁS 2026-11-17 (szoletra-olvashatosag): a Nyugodt (alap) tempó ablaka olvasásalapú, legfeljebb 40 s + 0,6 s
  // előjelzés + 3 s kijelzés — a várakozás ehhez igazodik (a feltétel, hogy új kérdés jön, változatlan).
  await expect.poll(async () => Number((await probe(page))?.questionId ?? 0), { timeout: 60_000 }).toBeGreaterThan(qid);
});
