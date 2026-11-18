import { expect, test, type Page } from "@playwright/test";

import { hideAndShowPage } from "./support/game-mobile-quality";

test.use({ serviceWorkers: "block" });

/**
 * S2 utójavítás (#433, Codex-komment 4581035479): a lejárt játékidő párbeszéde a közös mobilos keret
 * fedőrétegei (szünet menü, eredményképernyő; `.game-overlay`, z 80) FÖLÖTT van, és modális.
 * Brain Rot Lopás: már a mainen lévő, keretet használó, kupon-HUD-os játék. A lejáratot a szerver-szinkron adja
 * (remainingSeconds 0), a fókusz-esemény pedig azonnali szinkront kér — nincs időzítés-függés.
 */

const VIEWPORT = { width: 390, height: 844 };

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

async function openGameWithCoupon(page: Page) {
  await page.setViewportSize(VIEWPORT);
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
  await page.goto("/games/brain-rot-steal?seed=42");
  await expect(page.getByTestId("coupon-hud")).toBeVisible();
  await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function");
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

async function expireNow(page: Page, state: { remaining: number }) {
  state.remaining = 0;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("coupon-expired")).toBeVisible({ timeout: 10_000 });
  // belépő animáció nincs a lejárati rétegen, de a mérés a stabil elrendezésre épüljön
  await expect(page.getByTestId("coupon-expired-back")).toBeInViewport();
}

async function assertExpiredOnTop(page: Page, hiddenSelector: string) {
  expect(await topAt(page, '[data-testid="coupon-expired-back"]')).toBe(true);
  expect(await topAt(page, hiddenSelector), "az alatta lévő gomb nem érhető el").toBe(false);
  const box = (await page.getByTestId("coupon-expired-back").boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(48);
  const z = await page.getByTestId("coupon-expired").evaluate((el) => Number(getComputedStyle(el).zIndex));
  const overlayZ = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "game-overlay";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const v = Number(getComputedStyle(probe).zIndex);
    probe.remove();
    return v;
  });
  expect(z).toBeGreaterThan(overlayZ);
  await expect(page.getByTestId("coupon-expired-back")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("coupon-expired-layer.png") });
}

test("lejárat az eredményképernyő fölött: a Vissza a leckéhez gomb legfelül, kattintható", async ({ page }) => {
  const state = await openGameWithCoupon(page);
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ phase: "over", correctCount: 7 }));
  await expect(page.getByTestId("br-over")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-game-retry]").first()).toBeVisible();
  await page.waitForTimeout(500); // az eredménykártya belépő animációja
  await expireNow(page, state);
  await expect(page.getByTestId("coupon-expired").locator("xpath=..")).toHaveJSProperty("tagName", "BODY");
  // az „Újra” gombot a lejárati réteg takarja
  await assertExpiredOnTop(page, "[data-game-retry]");
  if (process.env.COUPON_SHOT) await page.screenshot({ path: process.env.COUPON_SHOT, type: "jpeg", quality: 60 });
  await page.getByTestId("coupon-expired-back").click();
  await expect(page).toHaveURL(/\/lesson\/older-lesson/);
});

test("lejárat a szünet menü fölött: a Folytatás nem érhető el, a visszaút igen", async ({ page }) => {
  const state = await openGameWithCoupon(page);
  await page.getByRole("button", { name: /indít|indul|start|vadász|rajta/i }).first().click();
  await expect(page.getByTestId("game-pause")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("game-pause").click();
  await expect(page.getByTestId("game-pause-menu")).toBeVisible();
  await expect(page.getByTestId("game-resume")).toBeFocused();
  await page.waitForTimeout(500);
  await expireNow(page, state);
  await assertExpiredOnTop(page, '[data-testid="game-resume"]');
  await page.getByTestId("coupon-expired-back").click();
  await expect(page).toHaveURL(/\/lesson\/older-lesson/);
});

test("lejárat nyitott kvíz-visszajelzés mellett: a billentyűk csak a párbeszédet érik, Enter a leckéhez visz", async ({ page }) => {
  const state = await openGameWithCoupon(page);
  await page.getByRole("button", { name: /indít|indul|start|vadász|rajta/i }).first().click();
  await expect(page.getByTestId("game-pause")).toBeVisible({ timeout: 15_000 });
  // SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny.md 9.; J5a „Lény-aréna”): a rossz válasz nem nyit
  // blokkoló kártyát — a rossz ketrecbe futás után a helyes ketrec zölden látszik, a kártyát a „Miért?” nyitja. A mért
  // követelmény változatlan: nyitott `quiz-feedback` mellett lejár a kupon, és a lejárati réteg van felül.
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame?.forceState({ phase: "quiz" }));
  const wrong = page.locator('[data-testid="br-cages"] [data-correct="false"]').first();
  await expect(wrong).toBeVisible({ timeout: 10_000 });
  await wrong.click();
  await expect(page.locator('[data-testid="br-cages"] [data-correct="true"]')).toHaveAttribute("data-state", "correct", { timeout: 10_000 });
  await expect(page.locator('[role="dialog"]'), "„Miért?” nélkül nincs dialógus").toHaveCount(0);
  await page.getByTestId("play-why").click();
  await expect(page.getByTestId("quiz-feedback")).toBeVisible();
  await expireNow(page, state);
  await assertExpiredOnTop(page, '[data-testid="quiz-feedback-dismiss"]');
  // Escape és szóköz nem jut le az alsó rétegekhez: a visszajelzés és a párbeszéd marad
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("quiz-feedback")).toBeAttached();
  await expect(page.getByTestId("coupon-expired")).toBeVisible();
  await expect(page.getByTestId("coupon-expired-back")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.dataset.gameCouponExpired)).toBe("true");
  // Enter a fókuszált gombot aktiválja: navigál, nem a takart kártyát zárja be
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/lesson\/older-lesson/);
});

test("lejárat után a lap háttérbe kerülése (automatikus szünet) nem veszi el a fókuszt, nincs megmaradó inert", async ({ page }) => {
  const state = await openGameWithCoupon(page);
  await page.getByRole("button", { name: /indít|indul|start|vadász|rajta/i }).first().click();
  await expect(page.getByTestId("game-pause")).toBeVisible({ timeout: 15_000 });
  await expireNow(page, state);
  await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
  await hideAndShowPage(page); // M6: a keret automatikus szünete
  await expect(page.getByTestId("game-pause-menu")).toBeAttached({ timeout: 5_000 });
  await expect(page.getByTestId("coupon-expired-back")).toBeFocused();
  expect(await page.getByTestId("game-resume").evaluate((el) => !!el.closest("[inert]"))).toBe(true);
  expect(await topAt(page, '[data-testid="coupon-expired-back"]')).toBe(true);
  expect(await topAt(page, '[data-testid="game-resume"]')).toBe(false);
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("coupon-expired-back")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/lesson\/older-lesson/);
  await expect(page.getByTestId("coupon-expired")).toHaveCount(0);
  expect(await page.locator("[inert]").count(), "bezárás / navigáció után nem marad inert").toBe(0);
  expect(await page.evaluate(() => document.documentElement.dataset.gameCouponExpired ?? null)).toBeNull();
});
