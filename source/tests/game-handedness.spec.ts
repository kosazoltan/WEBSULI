import { devices, expect, test, type Page } from "@playwright/test";

import { CASE as blockCraft } from "./game-mobile-cases/block-craft-quiz";
import { CASE as brainRot } from "./game-mobile-cases/brain-rot-steal";
import { CASE as spaceAsteroid } from "./game-mobile-cases/space-asteroid-quiz";
import { CASE as tornado } from "./game-mobile-cases/tornado-hunter-200";
import { CASE as tsunami } from "./game-mobile-cases/tsunami-english";
import type { GameMobileCase } from "./support/game-mobile-quality";

/**
 * JK (docs/specs/2026-11-26-jatek-kezesseg.md): mind az öt joystickos játékban a joystick ÉS minden akció- / segédgomb a választott
 * kézhez kerül. Jobbkezes (alap): a joystick a bal, a gombok a jobb képernyőfélen; balkezes: fordítva. A preferencia közös
 * (`websuli.game.hand`), a kezdőképernyő választója állítja.
 */
test.use({ serviceWorkers: "block" });
test.use({ ...devices["Pixel 7"] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
    localStorage.setItem("websuli.spaceQuiz.grade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p === "/api/games/score" && route.request().method() === "POST") data = { ok: true };
    await route.fulfill({ json: data });
  });
});

const startLocator = (page: Page, c: GameMobileCase) =>
  c.startTestId ? page.getByTestId(c.startTestId).first() : page.getByRole("button", { name: c.startName! }).first();

async function startGame(page: Page, c: GameMobileCase): Promise<void> {
  await page.goto(c.path);
  await expect(startLocator(page, c)).toBeVisible({ timeout: 20_000 });
  await startLocator(page, c).click();
  await c.playReady(page);
  await expect(page.getByTestId(c.touchControlsTestId!)).toBeVisible({ timeout: 15_000 });
}

type Sides = { width: number; joystick: number | null; buttons: Array<{ label: string; x: number }> };

/** A vezérlőréteg joystickjának és látható gombjainak vízszintes középpontja (CSS px). */
function measureSides(page: Page, controlsId: string): Promise<Sides> {
  return page.evaluate((id) => {
    const root = document.querySelector(`[data-testid="${id}"]`)!;
    const center = (el: Element) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
    const joy = root.querySelector('[data-testid="virtual-joystick"]');
    const buttons = Array.from(root.querySelectorAll('button, [role="button"]')).filter((b) => {
      if (joy?.contains(b)) return false;
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    });
    return {
      width: window.innerWidth,
      joystick: joy ? center(joy) : null,
      buttons: buttons.map((b) => ({ label: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().slice(0, 30), x: center(b) })),
    };
  }, controlsId);
}

async function expectSides(page: Page, c: GameMobileCase, hand: "left" | "right"): Promise<void> {
  // A vezérlők elrendezése (és a méretezés) egy-két képkocka alatt áll be.
  await expect.poll(async () => (await measureSides(page, c.touchControlsTestId!)).joystick !== null, { timeout: 10_000 }).toBe(true);
  const s = await measureSides(page, c.touchControlsTestId!);
  const mid = s.width / 2;
  const onStickSide = (x: number) => (hand === "right" ? x < mid : x > mid);
  expect(onStickSide(s.joystick!), `${c.id}: a joystick (${Math.round(s.joystick!)} px) a ${hand === "right" ? "bal" : "jobb"} oldalon`).toBe(true);
  // A Brainrot oldalsávjában kérdés nélkül nincs gomb (csak állapotjelző) — a többi játékban legalább egy akciógomb van.
  if (c.id !== brainRot.id) expect(s.buttons.length, `${c.id}: van akciógomb`).toBeGreaterThan(0);
  for (const b of s.buttons) {
    expect(onStickSide(b.x), `${c.id}: a(z) „${b.label}” gomb (${Math.round(b.x)} px) a joystickkal SZEMBEN`).toBe(false);
  }
}

const GAMES = [spaceAsteroid, tsunami, blockCraft, brainRot, tornado];
const VIEWS = [
  { name: "álló", width: 390, height: 844 },
  { name: "fekvő", width: 844, height: 390 },
];

for (const c of GAMES) {
  for (const v of VIEWS) {
    if (c.orientation === "landscape" && v.width < v.height) continue;
    test.describe(`${c.id} — ${v.name} ${v.width}×${v.height}`, () => {
      test.use({ viewport: { width: v.width, height: v.height } });

      test("jobbkezes (alap): joystick balra, minden akciógomb jobbra", async ({ page }) => {
        await startGame(page, c);
        await expectSides(page, c, "right");
      });

      test("balkezes (tárolt közös preferencia): joystick jobbra, minden akciógomb balra", async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem("websuli.game.hand", "left"));
        await startGame(page, c);
        await expectSides(page, c, "left");
      });
    });
  }
}

test.describe("közös preferencia a kezdőképernyő választójával", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("az Aszteroidában választott bal kéz a Cunami-futásban is érvényes", async ({ page }) => {
    await page.goto(spaceAsteroid.path);
    const left = page.getByTestId("game-hand-left");
    if (!(await left.isVisible())) await page.locator("[data-game-start] summary").first().tap();
    await left.tap();
    await expect(left).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("websuli.game.hand"))).toBe("left");
    await startLocator(page, spaceAsteroid).click();
    await spaceAsteroid.playReady(page);
    await expectSides(page, spaceAsteroid, "left");

    await startGame(page, tsunami);
    await expectSides(page, tsunami, "left");
  });
});
/** A kérdés-állapot célpontjai (kövek / kristályok) balkezes elrendezésben sem fedik a joystickot és a látható akciógombokat. */
function overlapsWithControls(page: Page, quizScope: string): Promise<string[]> {
  return page.evaluate((scope) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const targets = Array.from(document.querySelectorAll(`${scope} button`)).filter(visible);
    const controls = Array.from(document.querySelectorAll('[data-game-controls] button, [data-game-controls] [data-testid="virtual-joystick"]')).filter(visible);
    const out: string[] = [];
    for (const t of targets) for (const c of controls) {
      const a = t.getBoundingClientRect(), b = c.getBoundingClientRect();
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix >= 1 && iy >= 1) out.push(`${t.textContent?.trim().slice(0, 20)} × ${(c.getAttribute("aria-label") ?? c.getAttribute("data-testid") ?? "").slice(0, 20)}`);
    }
    return out;
  }, quizScope);
}

for (const c of [blockCraft, spaceAsteroid]) {
  for (const v of VIEWS) {
    test.describe(`${c.id} — balkezes kérdés-állapot ${v.width}×${v.height}`, () => {
      test.use({ viewport: { width: v.width, height: v.height } });

      test("a kérdés célpontjai nem fedik a tükrözött vezérlőket", async ({ page }, testInfo) => {
        await page.addInitScript(() => localStorage.setItem("websuli.game.hand", "left"));
        await startGame(page, c);
        await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: { forceState?: unknown } }).__websuliGame?.forceState === "function", undefined, { timeout: 15_000 });
        await page.evaluate((patch) => (window as unknown as { __websuliGame: { forceState: (p: unknown) => void } }).__websuliGame.forceState(patch), c.quizForce);
        await expect(page.locator(`${c.quizScope} button:visible`).first()).toBeVisible({ timeout: 10_000 });
        // A kérdés-sáv elrendezése (mért helyek) ~1 mp alatt áll be.
        await expect.poll(() => overlapsWithControls(page, c.quizScope!), { timeout: 5_000, intervals: [250] }).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`${c.id}-${v.width}x${v.height}-balkezes-kerdes.jpg`), type: "jpeg", quality: 70 });
      });
    });
  }
}
