import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { devices, expect, test, type Page } from "@playwright/test";

import { MOBILE_VIEWPORTS, measureOverflow, smallFonts, smallTargets, waitForStable } from "./support/game-mobile-quality";

test.use({ serviceWorkers: "block" });

/**
 * S11 — Kockavadász: kétujjas érintéses vezérlés valódi (CDP `Input.dispatchTouchEvent`) érintéssel, valamint a kvíz
 * és a szünet mobilos viselkedése (végrehajtás S11 / 4., 6. lépés és „Megírandó tesztek”).
 *
 * SPEC-VÁLTOZÁS 2026-11-18 (docs/specs/2026-11-18-joystick-jobb-kez.md D3): a joystick alapból a JOBB oldalon áll, ezért a
 * körbenéző zóna a vászon joystickkal ellentétes, BAL 60%-a lett. A körbenéző ujj a vászon 75%-áról a 25%-ára, a „nem forgat”
 * ujj a 20%-áról a 80%-ára került (tükrözés); a húzás hossza, iránya és a forgás küszöbei (> 0,2 rad, < 0,01 rad) változatlanok.
 *
 * A teszt-API (`window.__websuliGame`) csak `VITE_ENABLE_GAME_TEST_HOOKS=1` buildben él (build:e2e).
 * A `probe()` értékei számok / szövegek (a teszt-API típusa): `moveFwd` 1 / 0, `yaw` radián.
 */
test.use({ ...devices["Pixel 7"] });

type Probe = { yaw: number; moveFwd: number; phase: string; paused: number };
type GameTestWindow = {
  __websuliGame?: { forceState: (patch: Record<string, unknown>) => void; probe?: () => Probe };
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
    localStorage.setItem("websuli.spaceQuiz.grade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") {
      data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    }
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p === "/api/games/score" && route.request().method() === "POST") data = { ok: true };
    await route.fulfill({ json: data });
  });
});

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.probe!());
}

async function startGame(page: Page): Promise<void> {
  await page.goto("/games/block-craft-quiz");
  await page.getByTestId("bc-start").click();
  await expect(page.getByTestId("bc-touch-controls")).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.probe === "function", undefined, {
    timeout: 15_000,
  });
  // A spawn utáni esés / landolás lecsengése (a fizika a kvíz és a szünet alatt áll, itt fut).
  await page.waitForTimeout(600);
}

async function shot(page: Page, state: string): Promise<void> {
  const dir = process.env.GAME_MOBILE_SHOT_DIR;
  if (!dir) return;
  const vp = page.viewportSize();
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `block-craft-quiz-${vp?.width ?? 0}x${vp?.height ?? 0}-${state}.jpg`), type: "jpeg", quality: 70 });
}

test.describe("390x844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("két ujj egyszerre: jobb hüvelykujj a joystickon előre, bal a vásznon körbenéz", async ({ page }) => {
    await startGame(page);
    const joy = await page.getByTestId("virtual-joystick").boundingBox();
    const canvas = await page.locator("canvas").first().boundingBox();
    expect(joy, "joystick doboz").not.toBeNull();
    expect(canvas, "vászon doboz").not.toBeNull();

    const before = await probe(page);
    expect(before.moveFwd).toBe(0);

    // 1. ujj: a joystick közepe (alapból a jobb oldalon); 2. ujj: a vászon bal részén (25% szélesség, 45% magasság — HUD és gombok között).
    const j = { x: Math.round(joy!.x + joy!.width / 2), y: Math.round(joy!.y + joy!.height / 2) };
    expect(j.x, "a joystick alapból a képernyő jobb felén").toBeGreaterThan(390 / 2);
    const c = { x: Math.round(canvas!.x + canvas!.width * 0.25), y: Math.round(canvas!.y + canvas!.height * 0.45) };
    // A körbenézés csak a vászon joystickkal ellentétes (bal) 60%-án indulhat — a választott pont ott van.
    expect(c.x - canvas!.x).toBeLessThanOrEqual(canvas!.width * 0.6);

    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", points: Array<{ x: number; y: number; id: number }>) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })),
      });

    await touch("touchStart", [{ ...j, id: 1 }]);
    await touch("touchStart", [{ ...j, id: 1 }, { ...c, id: 2 }]);
    // Fokozatos mozgás: az 1. ujj 40 px-t felfelé, a 2. ujj 80 px-t jobbra, ugyanazokban az eseményekben.
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await touch("touchMove", [
        { x: j.x, y: j.y - Math.round((40 * i) / steps), id: 1 },
        { x: c.x + Math.round((80 * i) / steps), y: c.y, id: 2 },
      ]);
    }
    await page.waitForTimeout(300);
    const during = await probe(page);
    expect(during.moveFwd, "a joystick előre-jelzése a második ujj mellett is él").toBe(1);
    // Elvárt forgás a szabályból: 80 px × 0,006 rad/px = 0,48 rad (> 0,2 rad).
    expect(Math.abs(during.yaw - before.yaw), "a körbenézés az első ujj mellett is él").toBeGreaterThan(0.2);
    expect(during.phase, "a húzás nem koppintás — nem indult kvíz").toBe("play");

    await touch("touchEnd", []);
    await page.waitForTimeout(150);
    const after = await probe(page);
    expect(after.moveFwd, "felengedés után a mozgás leáll (nem ragad be)").toBe(0);
  });

  test("a vászon joystick felőli (jobb) 40%-án induló húzás nem forgat (az a joystick hüvelykujjáé)", async ({ page }) => {
    await startGame(page);
    const canvas = await page.locator("canvas").first().boundingBox();
    const before = await probe(page);
    const cdp = await page.context().newCDPSession(page);
    const p = { x: Math.round(canvas!.x + canvas!.width * 0.8), y: Math.round(canvas!.y + canvas!.height * 0.4) };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...p, id: 7 }] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p.x + i * 12, y: p.y, id: 7 }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(150);
    const after = await probe(page);
    expect(Math.abs(after.yaw - before.yaw)).toBeLessThan(0.01);
  });

  test("szünet a kvízrétegről: a kvíz alatt is elérhető, és szünetben áll az óra", async ({ page }) => {
    await startGame(page);
    const progress = page.getByTestId("game-progress");
    await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.forceState({ phase: "quiz" }));
    await expect(page.getByTestId("bc-quiz")).toBeVisible();
    await page.getByTestId("bc-quiz-pause").click();
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    expect((await probe(page)).paused).toBe(1);
    await page.getByTestId("game-resume").click();
    await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
    // Jó válasz → vissza a játékba; a HUD szünetgombjával megállítva az óra nem jár.
    await page.locator('[data-testid="bc-quiz"] [data-correct="true"]').first().click();
    await expect(page.getByTestId("bc-quiz")).toHaveCount(0);
    await page.getByTestId("game-pause").click();
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    const t0 = await progress.getAttribute("aria-valuenow");
    await page.waitForTimeout(2200);
    expect(await progress.getAttribute("aria-valuenow"), "szünetben a játékóra áll").toBe(t0);
    await page.getByTestId("game-resume").click();
    await page.waitForTimeout(2200);
    expect(Number(await progress.getAttribute("aria-valuenow")), "folytatás után az óra újra jár").toBeLessThan(Number(t0));
  });
});

/* Kvíz-állapot mérése és képernyőképe a három mobil nézetben (M1–M3 a kvízrétegen is). */
for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("kvíz: nincs oldalgörgetés, minden cél ≥ 48 px, minden szöveg ≥ 12 px", async ({ page }) => {
      await startGame(page);
      await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.forceState({ phase: "quiz" }));
      await expect(page.getByTestId("bc-quiz")).toBeVisible();
      await waitForStable(page, '[data-testid="bc-quiz"]');
      const o = await measureOverflow(page);
      expect(o.x).toBeLessThanOrEqual(2);
      expect(o.y).toBeLessThanOrEqual(2);
      expect(await smallTargets(page), "M2 kvíz").toEqual([]);
      expect(await smallFonts(page), "M3 kvíz").toEqual([]);
      // A kvízkártya teljesen a nézetben van (a válaszok nem lógnak ki).
      const box = await page.getByTestId("bc-quiz").boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(-1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      await shot(page, "quiz");
    });
  });
}
