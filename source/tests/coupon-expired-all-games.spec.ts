import { expect, test, type Page } from "@playwright/test";

import { CASE as blockCraft } from "./game-mobile-cases/block-craft-quiz";
import { CASE as brainRot } from "./game-mobile-cases/brain-rot-steal";
import { CASE as spaceAsteroid } from "./game-mobile-cases/space-asteroid-quiz";
import { CASE as tornado } from "./game-mobile-cases/tornado-hunter-200";
import { CASE as tsunami } from "./game-mobile-cases/tsunami-english";
import type { GameMobileCase } from "./support/game-mobile-quality";

test.use({ serviceWorkers: "block" });

/**
 * S13 / E22 — a kupon-lejárati párbeszéd (#436) mind az 5 kuponos játékon (a Szólétra és a Matek sprint nem indul
 * leckéből kuponnal: nincs `useCouponSession`-jük). Játék közben lejár az idő:
 *  - a „Vissza a leckéhez” gomb legfelül van és fókuszban;
 *  - a játék saját `window` billentyűfigyelői (P / Esc szünet, nyilak, WASD, E / F) nem reagálnak: nem nyílik szünet menü,
 *    a párbeszéd marad, a fókusz a gombon;
 *  - Enter a leckéhez navigál, utána nem marad inert elem.
 * A lejáratot a szerver-szinkron adja (`remainingSeconds: 0`), a fókusz-esemény azonnali szinkront kér.
 */

const GAMES: GameMobileCase[] = [tsunami, blockCraft, brainRot, spaceAsteroid, tornado];

async function openWithCoupon(page: Page, c: GameMobileCase): Promise<{ remaining: number }> {
  const state = { remaining: 600 };
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
    localStorage.setItem("websuli.spaceQuiz.grade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = { id: "fixture", classroom: 4, classrooms: [4] };
    if (p.endsWith("/csrf-token")) data = { csrfToken: "fixture-token" };
    if (p.endsWith("/coupons/active")) {
      data = { coupon: { id: "coupon-fixture", lessonId: "older-lesson", sectionIdx: -1, minutes: 10, remainingSeconds: state.remaining, started: true } };
    }
    if (p.endsWith("/start")) data = { remainingSeconds: state.remaining };
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p.includes("leaderboard") || p.includes("/api/games/score")) data = p.includes("leaderboard") ? [] : { ok: true };
    await route.fulfill({ json: data });
  });
  await page.goto(c.path);
  const start = c.startTestId ? page.getByTestId(c.startTestId).first() : page.getByRole("button", { name: c.startName! }).first();
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click();
  await c.playReady(page);
  await expect(page.getByTestId("coupon-hud")).toBeVisible({ timeout: 10_000 });
  return state;
}

/** Az elem közepén a legfelső elem maga az elem vagy a gyereke. */
async function topAt(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && el.contains(hit);
  });
}

for (const c of GAMES) {
  test(`${c.id}: lejáratkor a Vissza a leckéhez legfelül, fókuszban; a játék billentyűi nem hatnak; Enter navigál`, async ({ page }) => {
    const state = await openWithCoupon(page, c);
    state.remaining = 0;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const back = page.getByTestId("coupon-expired-back");
    await expect(page.getByTestId("coupon-expired")).toBeVisible({ timeout: 10_000 });
    await expect(back).toBeInViewport();
    await expect(back).toBeFocused();
    expect(await topAt(page, '[data-testid="coupon-expired-back"]'), "a gomb nem a legfelső réteg").toBe(true);

    // a játékok saját billentyűi (szünet: P / Esc; mozgás: nyilak, WASD; bányászás / lövés: E, F) — semmi nem reagálhat.
    // A szóköz és az Enter a FÓKUSZÁLT gombot aktiválja (alapművelet, szándékosan megmarad) — azt lent az Enter méri.
    for (const key of ["p", "Escape", "ArrowLeft", "ArrowUp", "w", "e", "f", "Tab"]) await page.keyboard.press(key);
    await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
    await expect(page.getByTestId("coupon-expired")).toBeVisible();
    await expect(back).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.dataset.gameCouponExpired)).toBe("true");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/lesson\/older-lesson/);
    // A lusta lecke-oldal betöltése alatt a játék még fennállhat (a React a régi fát mutatja); a takarítás a
    // lecsatoláskor fut — mért: a buildelt szerveren az URL-váltás után a #root még egy pillanatig inert volt.
    await expect(page.getByTestId("coupon-expired")).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(() => page.locator("[inert]").count(), { message: "navigáció után nem marad inert" }).toBe(0);
  });
}
