import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type CDPSession, type Page } from "@playwright/test";

/**
 * J5a — Brain Rot „Lény-aréna” a böngészőben (végrehajtás J5a; terv 5.5, J1, J4, J5, J16; K.4/14–18, 23–25).
 *
 * Az ELSŐ eset szándékosan KAMPÓ NÉLKÜLI (se `forceState`, se `probe`): a gyerek útja érintéssel — a táblára bökve fut a
 * vadász, elkapja a lényt, a ketrecekre bökve befut a jó / rossz ketrecbe, „Miért?”, és a 90 mp-es óra a végén az
 * eredménylapra visz (a valós óra a kérdések alatt is jár). A többi eset a teszt-kampóval mér (lassítás, óra, kijelzés,
 * joystick), a „≥ X ms” állítást a lapon belül, képkockánként (C-65).
 *
 * Képernyőkép: ha a `BR_SHOT_DIR` meg van adva, oda (JPEG 70).
 */

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  // CI-reprodukció (main CI 44095911311 utómunka; a Kockavadász mintája): `BR_CPU_THROTTLE=<n>` → n-szeres CPU-lassítás
  // (a CI szoftveres WebGL-jének lassú képkockái helyben). Alapból nincs lassítás.
  const throttle = Number(process.env.BR_CPU_THROTTLE ?? 0);
  if (throttle > 1) {
    test.setTimeout(300_000);
    await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  }
  // Évfolyam nélkül az osztály-választó (ClassroomGateModal) nyílna; az 5. évfolyam a tipikus Brain Rot-játékos.
  await page.addInitScript(() => localStorage.setItem("websuli.classroomGrade", "5"));
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

/**
 * CI-reprodukció: a CI-n egy Playwright-hívás 0,5–1,3 s, a lap órája közben a falióra szerint halad. `BR_CI_LAG_MS=<ms>`
 * ezt a késést teszi minden érintés-küldés után helyben (alapból 0).
 */
const CI_LAG_MS = Number(process.env.BR_CI_LAG_MS ?? 0);
const ciLag = () => (CI_LAG_MS > 0 ? new Promise<void>((r) => setTimeout(r, CI_LAG_MS)) : Promise.resolve());
/** Valódi érintés (CDP) + a CI-késés helyben. */
async function touch(cdp: CDPSession, params: { type: "touchStart" | "touchMove" | "touchEnd"; touchPoints: { x: number; y: number; id: number }[] }): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", params);
  await ciLag();
}

type Probe = Record<string, number | null>;
type GameWindow = { __websuliGame?: { probe: () => Probe; forceState: (p: Record<string, unknown>) => void } };

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.BR_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70 });
}

const cages = (page: Page) => page.locator('[data-testid="br-cages"] [data-correct]');

/** A tábla legközelebbi lényére bök (a vadász oda fut) — amíg a ketrecek ki nem nyílnak. */
async function chaseUntilCaught(page: Page): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ((await cages(page).count()) > 0) return;
    // Egyetlen evaluate: a vadász és a lények pillanatnyi helye (C-64).
    const target = await page.evaluate(() => {
      const player = document.querySelector('[data-testid="br-player"]')?.getBoundingClientRect();
      if (!player) return null;
      const px = player.x + player.width / 2;
      const py = player.y + player.height / 2;
      let best: { x: number; y: number; d: number } | null = null;
      for (const el of Array.from(document.querySelectorAll('[data-brainrot][data-carried="false"]'))) {
        const r = el.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        const d = Math.hypot(x - px, y - py);
        if (!best || d < best.d) best = { x, y, d };
      }
      return best;
    });
    if (target) await page.touchscreen.tap(target.x, target.y);
    await page.waitForTimeout(250);
  }
  throw new Error("30 mp alatt nem sikerült lényt elkapni");
}

test.describe("valódi érintés", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("kampó nélkül: futás böködéssel, elkapás, jó és rossz ketrec, „Miért?”, a 90 mp végén eredménylap", async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/games/brain-rot-steal");
    await page.getByRole("button", { name: /vadászat indítása/i }).tap();
    const board = page.getByTestId("br-board");
    await expect(board).toBeVisible();
    await expect(page.getByTestId("br-hint")).toBeVisible(); // tanító súgó (egy sor)
    await expect(page.getByTestId("br-touch-controls")).toBeVisible(); // érintős eszközön joystick
    await shot(page, "touch-play.jpg");

    // 1. elkapás → 4 ketrec, a kérdés a sávban; a JÓ ketrecre bökve a vadász befut és megáll → „Elkapva” nő.
    await chaseUntilCaught(page);
    await expect(cages(page)).toHaveCount(4);
    await expect(page.getByTestId("br-quiz")).toBeVisible();
    await expect(page.locator('[role="dialog"]'), "a kérdés nem modális").toHaveCount(0);
    await shot(page, "touch-question.jpg");
    const caughtBefore = Number(await page.locator('[data-hud-stat="caught"]').innerText().then((t) => t.replace(/\D/g, "")));
    const good = page.locator('[data-testid="br-cages"] [data-correct="true"]');
    const gb = (await good.boundingBox())!;
    await page.touchscreen.tap(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await expect(good).toHaveAttribute("data-state", "correct", { timeout: 8_000 });
    await expect
      .poll(async () => Number((await page.locator('[data-hud-stat="caught"]').innerText()).replace(/\D/g, "")), { timeout: 5_000 })
      .toBeGreaterThan(caughtBefore);

    // 2. elkapás → ROSSZ ketrec: a helyes zölden, nincs dialógus; „Miért?” → a magyarázókártya, bezárva folytatódik.
    await expect(cages(page)).toHaveCount(0, { timeout: 6_000 });
    await chaseUntilCaught(page);
    const bad = page.locator('[data-testid="br-cages"] [data-correct="false"]').first();
    const bb = (await bad.boundingBox())!;
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await expect(page.locator('[data-testid="br-cages"] [data-correct="true"]')).toHaveAttribute("data-state", "correct", { timeout: 8_000 });
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await shot(page, "touch-wrong.jpg");
    await page.getByTestId("play-why").tap();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);

    // A menet a 90 mp-es valós óra végén ér véget (a kérdések alatt is járt) — az eredménylap, „Gyakorold még”, csak koppintásra új menet.
    await expect(page.getByTestId("br-over")).toBeVisible({ timeout: 120_000 });
    await expect(page.locator(".play-review")).toBeVisible();
    await expect(page.getByTestId("br-next-goal")).toBeVisible();
    await shot(page, "touch-result.jpg");
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId("br-over"), "nincs automatikus újraindítás").toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("kampóval mért szabályok", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function startWithQuestion(page: Page): Promise<void> {
    await page.goto("/games/brain-rot-steal?seed=7");
    await page.getByRole("button", { name: /vadászat indítása/i }).tap();
    await expect(page.getByTestId("br-board")).toBeVisible();
    await page.waitForFunction(() => typeof (window as unknown as GameWindow).__websuliGame?.forceState === "function");
    await page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.forceState({ question: true }));
    await expect(cages(page)).toHaveCount(4, { timeout: 10_000 });
  }

  test("J1 + valós óra: nyitott kérdésnél a világ lassítva fut (≥ 0,35×, < 1×), és a 90 mp-es óra jár", async ({ page }) => {
    await startWithQuestion(page);
    // A lapon belül mérve: két minta 1 s különbséggel (a valós időt is a lap méri).
    const m = await page.evaluate(async () => {
      const g = (window as unknown as GameWindow).__websuliGame!;
      const a = g.probe();
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 1000));
      const b = g.probe();
      const real = performance.now() - t0;
      return { sim: (b.simTime! - a.simTime!) / real, clock: (a.timeLeft! - b.timeLeft!) * 1000 / real, open: a.questionOpen! + b.questionOpen! };
    });
    expect(m.open, "a kérdés végig nyitva volt").toBe(2);
    expect(m.sim, "a világ a kérdés alatt fut (≥ 0,35×)").toBeGreaterThanOrEqual(0.35);
    expect(m.sim, "a világ a kérdés alatt lassul (0,6×)").toBeLessThan(0.8);
    expect(m.clock, "a 90 mp-es óra a kérdés alatt is jár").toBeGreaterThan(0.8);
  });

  test("J4/J5: rossz ketrec → a helyes ketrec ≥ 1,8 mp-ig zöld (képkockánként), nincs dialógus; „Miért?” alatt a világ áll", async ({ page }) => {
    await startWithQuestion(page);
    // A kijelzés hossza a lapon belül, képkockánként (C-65): a zöld ketrec első és utolsó képkockája között.
    const measure = page.evaluate(
      () =>
        new Promise<{ ms: number; dialog: boolean }>((resolve) => {
          let start = -1;
          let dialog = false;
          const tick = (now: number) => {
            const on = document.querySelector('[data-testid="br-cages"] [data-state="correct"]') !== null;
            if (document.querySelector('[role="dialog"]')) dialog = true;
            if (on && start < 0) start = now;
            if (!on && start >= 0) return resolve({ ms: now - start, dialog });
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    const bad = page.locator('[data-testid="br-cages"] [data-correct="false"]').first();
    const bb = (await bad.boundingBox())!;
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    const r = await measure;
    expect(r.ms, "a helyes ketrec kijelzése").toBeGreaterThanOrEqual(1800);
    expect(r.dialog, "„Miért?” nélkül nincs dialógus").toBe(false);
    // A „Miért?” a kijelzés után még 4 mp-ig elérhető: kártya + a világ áll.
    await page.getByTestId("play-why").tap();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    const still = await page.evaluate(async () => {
      const g = (window as unknown as GameWindow).__websuliGame!;
      const a = g.probe();
      await new Promise((res) => setTimeout(res, 800));
      const b = g.probe();
      return { sim: b.simTime! - a.simTime!, clock: b.clock! - a.clock! };
    });
    expect(still.sim, "„Miért?” alatt a szimuláció áll").toBe(0);
    expect(still.clock, "„Miért?” alatt az óra áll").toBe(0);
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect.poll(() => page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.probe().simTime!), { timeout: 5_000 }).toBeGreaterThan(0);
  });

  test("önellenőrzés (f): „Miért?” + háttérbe tett lap — a szünet folytatása nem oldja fel a „Miért?”-et, csak mindkettő zárása", async ({ page }) => {
    await startWithQuestion(page);
    const bad = page.locator('[data-testid="br-cages"] [data-correct="false"]').first();
    const bb = (await bad.boundingBox())!;
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.getByTestId("play-why").tap({ timeout: 10_000 });
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    // A lap háttérbe kerül (a közös `useAutoPause` útja): a szünetmenü is nyílik.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    const frozen = () =>
      page.evaluate(async () => {
        const g = (window as unknown as GameWindow).__websuliGame!;
        const a = g.probe();
        await new Promise((res) => setTimeout(res, 600));
        const b = g.probe();
        return { sim: b.simTime! - a.simTime!, clock: b.clock! - a.clock! };
      });
    expect(await frozen(), "szünet + „Miért?”: áll").toEqual({ sim: 0, clock: 0 });
    // A szünet folytatása után a „Miért?” még nyitva — a világ és az óra továbbra is áll.
    await page.getByTestId("game-resume").tap();
    await expect(page.getByTestId("game-pause-menu")).toBeHidden();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    expect(await frozen(), "a szünet feloldása nem oldja fel a „Miért?”-et").toEqual({ sim: 0, clock: 0 });
    // Csak a „Miért?” zárása után indul újra.
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect
      .poll(async () => (await frozen()).clock, { timeout: 5_000, message: "mindkét ok zárása után az óra jár" })
      .toBeGreaterThan(0);
  });

  test("review #485: nyitott kérdésnél a nézet magasságának változása után a kirajzolt ketrecek a mag választerületein állnak", async ({ page }) => {
    await startWithQuestion(page);
    const coreRects = () => page.evaluate(() => String((window as unknown as GameWindow).__websuliGame!.probe().cageRects));
    const before = await coreRects();
    // Álló mobilon a böngésző eszköztára megjelenik / eltűnik: csak a magasság változik (a rövidebb oldal, az egység marad).
    await page.setViewportSize({ width: 390, height: 760 });
    // Előbb a mag tényleg átrendezze a ketreceket (különben a mérés a régi, még egyező állapotot látná).
    await expect.poll(coreRects, { timeout: 5_000, message: "a mag átrendezte a ketreceket" }).not.toBe(before);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const g = (window as unknown as { __websuliGame: { probe: () => Record<string, number | string | null> } }).__websuliGame;
            const core = JSON.parse(String(g.probe().cageRects)) as number[][];
            const board = document.querySelector('[data-testid="br-board"]')!.getBoundingClientRect();
            const drawn = Array.from(document.querySelectorAll('[data-testid^="br-cage-"]')).map((el) => {
              const r = el.getBoundingClientRect();
              return [r.x - board.x - 2, r.y - board.y - 2, r.width, r.height]; // a tábla 2 px-es kerete
            });
            if (core.length !== 4 || drawn.length !== 4) return Infinity;
            return Math.max(...core.flatMap((c, i) => c.map((v, k) => Math.abs(v - drawn[i]![k]!))));
          }),
        { timeout: 5_000, message: "a ketrecek kirajzolt helye = a mag választerülete (px)" },
      )
      .toBeLessThan(2);
  });

  test("K.4/16: balkezes tükrözés — a beállítás a joystickot a jobb oldalra teszi (és megmarad)", async ({ page }) => {
    await page.goto("/games/brain-rot-steal");
    const left = page.getByTestId("br-hand-left");
    // A beállítás a kezdőképernyő (összecsukható) beállításai között van.
    if (!(await left.isVisible())) await page.locator("[data-game-start] summary").first().tap();
    await left.tap();
    await expect(left).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /vadászat indítása/i }).tap();
    const stick = page.getByTestId("virtual-joystick");
    await expect(stick).toBeVisible();
    const box = (await stick.boundingBox())!;
    expect(box.x + box.width / 2, "a joystick a jobb hüvelykujjnál").toBeGreaterThan(390 / 2);
    expect(await page.evaluate(() => localStorage.getItem("websuli.brainrot.hand"))).toBe("left");
  });

  test("K.4/14–15: a joystick valódi érintéssel (CDP) mozgatja a vadászt; a táblára bökve oda fut", async ({ page }) => {
    await page.goto("/games/brain-rot-steal?seed=9");
    await page.getByRole("button", { name: /vadászat indítása/i }).tap();
    const stick = page.getByTestId("virtual-joystick");
    await expect(stick).toBeVisible();
    const probe = () => page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.probe());
    const cdp: CDPSession = await page.context().newCDPSession(page);
    const sb = (await stick.boundingBox())!;
    const cx = sb.x + sb.width / 2;
    const cy = sb.y + sb.height / 2;
    const before = await probe();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + sb.width * 0.45, y: cy, id: 1 }] });
    await expect.poll(async () => (await probe()).playerX! - before.playerX!, { timeout: 5_000, message: "a joystick jobbra viszi a vadászt" }).toBeGreaterThan(0.1);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    // Böködés a tábla bal felső részére: a vadász oda fut (egyujjas mód).
    const board = (await page.getByTestId("br-board").boundingBox())!;
    const mid = await probe();
    await page.touchscreen.tap(board.x + board.width * 0.15, board.y + board.height * 0.3);
    await expect.poll(async () => (await probe()).playerX! - mid.playerX!, { timeout: 5_000, message: "a böködés balra viszi" }).toBeLessThan(-0.1);
  });
});

/**
 * Review #485 B2 / K3 — a válasz teljes szövege mindig olvasható, és a ketrec soha nem kerül a kérdés-kártya alá: a
 * leghosszabb válaszú és a leghosszabb promptú tétellel (a kézi és az évfolyam-bankból programmal kikeresve), mindhárom
 * nézetben, lapon belül mérve. Képernyőkép: `BR_SHOT_DIR`.
 */
/** A ketrecek a kártya (és a jelmagyarázat) alatt, nincs levágott felirat, jelölt módban a jelmagyarázat teljes — "ok" vagy a hiba. */
function cageLayoutState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="br-quiz"] .play-question-card')?.getBoundingClientRect();
    const legend = document.querySelector('[data-testid="br-legend"]')?.getBoundingClientRect();
    const bottom = Math.max(card?.bottom ?? 0, legend?.bottom ?? 0);
    const cageEls = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="br-cage-"]'));
    const under = cageEls.length === 4 && cageEls.every((el) => el.getBoundingClientRect().top >= bottom - 1);
    const clipped = Array.from(document.querySelectorAll<HTMLElement>(".br-cage-label")).some(
      (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
    );
    const compact = cageEls.some((el) => el.dataset.compact === "true");
    const legendRows = Array.from(document.querySelectorAll<HTMLElement>(".br-legend-label"));
    const legendOk = !compact || (legendRows.length === 4 && legendRows.every((el) => el.getBoundingClientRect().bottom <= innerHeight + 1));
    return under && !clipped && legendOk ? "ok" : JSON.stringify({ under, clipped, compact, legendOk, bottom });
  });
}

for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
  test.describe(`leghosszabb tételek ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });
    // „quiz-longboth” (review #485 Ú2): a leghosszabb prompt ÉS a leghosszabb válaszok együtt.
    for (const kind of ["quiz-long", "quiz-longprompt", "quiz-longboth"] as const) {
      test(`${kind}: nincs levágott válasz, a ketrecek a kérdés-kártya (és a jelmagyarázat) alatt`, async ({ page }) => {
        await page.goto("/games/brain-rot-steal?seed=11");
        await page.getByRole("button", { name: /vadászat indítása/i }).tap();
        await expect(page.getByTestId("br-board")).toBeVisible();
        await page.waitForTimeout(1500); // az évfolyam-bank lusta betöltése
        await page.evaluate((phase) => (window as unknown as GameWindow).__websuliGame!.forceState({ phase }), kind);
        await expect(cages(page)).toHaveCount(4, { timeout: 10_000 });
        await expect
          .poll(() => cageLayoutState(page), { timeout: 5_000, message: "a ketrecek a kártya alatt, a felirat nem vágódik le (jelölt módban a jelmagyarázat teljes)" })
          .toBe("ok");
        // Ú5: a mérőkép a beúszás és az előjelzés (600 ms) után — élesített ketrecek, teljesen látszó kártya.
        await expect(page.locator('[data-testid^="br-cage-"][data-armed="true"]').first()).toBeVisible({ timeout: 5_000 });
        await page.waitForTimeout(400);
        await shot(page, `${kind}-${vp.width}x${vp.height}.jpg`);
      });
    }
  });
}

/** Review #485 Ú6 — elforgatás nyitott kérdés alatt: a jelölt mód és az elrendezés újraszámol (mindkét irányban). */
test.describe("elforgatás nyitott kérdés alatt", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  test("fekvő → álló → fekvő: a ketrecek a kártya alatt, nincs levágott felirat, a jelölt mód a nézethez igazodik", async ({ page }) => {
    await page.goto("/games/brain-rot-steal?seed=11");
    await page.getByRole("button", { name: /vadászat indítása/i }).tap();
    await expect(page.getByTestId("br-board")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.forceState({ phase: "quiz-long" }));
    await expect(cages(page)).toHaveCount(4, { timeout: 10_000 });
    await expect.poll(() => cageLayoutState(page), { timeout: 5_000, message: "fekvő" }).toBe("ok");
    const compactOf = () => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="br-cage-"]')).some((el) => el.dataset.compact === "true"));
    const landscapeCompact = await compactOf();
    for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(vp);
      await expect.poll(() => cageLayoutState(page), { timeout: 5_000, message: `${vp.width}x${vp.height} után` }).toBe("ok");
      expect(await page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.probe().questionOpen), "a kérdés nyitva marad").toBe(1);
    }
    // Vissza fekvőbe: ugyanaz a döntés, mint induláskor (nem ragad be az álló nézet döntése).
    expect(await compactOf()).toBe(landscapeCompact);
  });
});

test.describe("véletlen válasz valódi érintéssel", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  /**
   * Main CI 44095911311 utómunka: az időzített mozdulat a LAPON BELÜL, a meghajtó kérdés-órája szerint fut (egyetlen
   * `evaluate`), mert a CI-n egy Playwright-hívás 0,5–1,3 s, és a hívások közti valós időre épülő „400 ms-os tolás”
   * 750–1200 ms lett (helyi reprodukció: `BR_CPU_THROTTLE=20 BR_CI_LAG_MS=1300`; a lap-idővonal szerint a tolás az élesítés
   * UTÁN is tartott — ez a Ú3 elfogadott tartománya, nem az, amit a teszt mér). A valódi érintés (CDP) adja a joystick
   * lenyomását; a lenyomott ujj mozgását és felemelését a lap ugyanazzal a `pointerId`-vel kapja.
   */
  test("review #485 B1: a kérdés után még 400 ms-ig tolt, majd elengedett joystick nem ad választ", async ({ page }) => {
    await page.goto("/games/brain-rot-steal?seed=7");
    await page.getByRole("button", { name: /vadászat indítása/i }).tap();
    const stick = page.getByTestId("virtual-joystick");
    await expect(stick).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { __brPid?: number };
      window.addEventListener("pointerdown", (e) => (w.__brPid = e.pointerId), true);
    });
    const sb = (await stick.boundingBox())!;
    const cx = sb.x + sb.width / 2;
    const cy = sb.y + sb.height / 2;
    const cdp: CDPSession = await page.context().newCDPSession(page);
    await touch(cdp, { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] }); // valódi lenyomás (mozgás nélkül)
    const r = await page.evaluate(
      async ({ cx, cy, h }) => {
        const w = window as unknown as { __brPid?: number; __websuliGame: { probe: () => Record<string, number | string | null>; forceState: (p: Record<string, unknown>) => void } };
        const g = w.__websuliGame;
        const el = document.querySelector<HTMLElement>('[data-testid="virtual-joystick"]')!;
        const pid = w.__brPid!;
        const fire = (type: string, x: number, y: number) =>
          el.dispatchEvent(new PointerEvent(type, { pointerId: pid, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        const frame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
        const clock = () => Number(g.probe().clock);
        if (g.probe().questionOpen !== 0) return { error: "nyitott kérdés a mérés előtt" };
        // A gyerek lefelé tol (az alsó ketrecsor felé), és UGYANABBAN a feladatban elkapja a lényt: a kérdés megnyílik.
        fire("pointermove", cx, cy + h * 0.45);
        g.forceState({ question: true });
        while (g.probe().cagesOpen !== 1) await frame();
        const open = clock();
        // A nyitás utáni mozdulat a LEGKÖZELEBBI ketrec felé (a mag választerületei szerint): így a 400 ms-os tolás a
        // ketrecbe viszi a vadászt — az élesítés (600 ms) nélkül ez válasz lenne (mutációs ellenpróba), vele nem.
        const pr0 = g.probe();
        const boardEl = document.querySelector<HTMLElement>('[data-testid="br-board"]')!;
        const unit = Math.min(boardEl.clientWidth, boardEl.clientHeight);
        const px = Number(pr0.playerX) * unit;
        const py = Number(pr0.playerY) * unit;
        const rects = JSON.parse(String(pr0.cageRects)) as number[][];
        const near = rects
          .map(([x, y, rw, rh]) => ({ x: x! + rw! / 2, y: y! + rh! / 2 }))
          .reduce((a, b) => (Math.hypot(b.x - px, b.y - py) < Math.hypot(a.x - px, a.y - py) ? b : a));
        const len = Math.hypot(near.x - px, near.y - py) || 1;
        const mx = cx + ((near.x - px) / len) * h * 0.45;
        const my = cy + ((near.y - py) / len) * h * 0.45;
        fire("pointermove", mx, my);
        // 400 ms a mag játékidején (a ketrec-kor; az élesítés is ezen 600 ms) — egy képkocka legfeljebb ~140 ms-ot léptet
        // (a hurok-plafon), így a felengedés lassú gépen is az élesítés előtt van.
        while (Number(g.probe().cageAgeMs) < 400) await frame();
        fire("pointerup", mx, my);
        const released = clock();
        const atRelease = g.probe();
        const releaseAge = Number(atRelease.cageAgeMs);
        const armedAtRelease = String(atRelease.cageArmed);
        // Előfeltétel: a felengedéskor a vadász egy ketrec választerületén áll (a mag `playerInCage` pereme: a vadász
        // sugarának fele) — enélkül egy elrendezés-változás újra üressé tenné a mérést (a régi változat így volt üres).
        const margin = 0.075 * 0.5 * unit;
        const qx = Number(atRelease.playerX) * unit;
        const qy = Number(atRelease.playerY) * unit;
        const inCageAtRelease = (JSON.parse(String(atRelease.cageRects)) as number[][]).some(
          ([x, y, rw, rh]) => qx >= x! - margin && qx <= x! + rw! + margin && qy >= y! - margin && qy <= y! + rh! + margin,
        );
        while (clock() - released < 1500) await frame();
        const p = g.probe();
        return { pushMs: released - open, releaseAge, armedAtRelease, inCageAtRelease, answered: p.questionsAnswered, open: p.questionOpen };
      },
      { cx, cy, h: sb.height },
    );
    await touch(cdp, { type: "touchEnd", touchPoints: [] });
    expect(r, JSON.stringify(r)).not.toHaveProperty("error");
    expect(r.answered, `a döntés előtt nincs válasz (${JSON.stringify(r)})`).toBe(0);
    expect(r.open, "a kérdés még nyitva").toBe(1);
    // A mérés előfeltétele (különben nem azt mérte): a felengedés az élesítés előtt volt.
    expect(Number(r.releaseAge), "a tolás a játékidőn < az élesítés (600 ms)").toBeLessThan(600);
    expect(r.armedAtRelease, "a felengedéskor még egy ketrec sem éles").toMatch(/^0+$/);
    expect(r.inCageAtRelease, `a felengedéskor a vadász egy ketrec területén áll (${JSON.stringify(r)})`).toBe(true);
  });

  test("review #485 Ú1: húzás közben nyíló ketrecek — a lent tartott ujj egy ketrecre csúszva sem válaszol; felemelés + új bökés igen", async ({ page }) => {
    await page.goto("/games/brain-rot-steal?seed=7");
    await page.getByRole("button", { name: /vadászat indítása/i }).tap();
    const board = (await page.getByTestId("br-board").boundingBox())!;
    await page.evaluate(() => {
      const w = window as unknown as { __brPid?: number };
      window.addEventListener("pointerdown", (e) => (w.__brPid = e.pointerId), true);
    });
    const cdp: CDPSession = await page.context().newCDPSession(page);
    const sx = board.x + board.width * 0.5;
    const sy = board.y + board.height * 0.3;
    // A gyerek a táblára teszi az ujját (valódi érintés, egyujjas mód).
    await touch(cdp, { type: "touchStart", touchPoints: [{ x: sx, y: sy, id: 1 }] });
    const r = await page.evaluate(
      async ({ sx, sy }) => {
        const w = window as unknown as { __brPid?: number; __websuliGame: { probe: () => Record<string, number | string | null>; forceState: (p: Record<string, unknown>) => void } };
        const g = w.__websuliGame;
        const boardEl = document.querySelector<HTMLElement>('[data-testid="br-board"]')!;
        const pid = w.__brPid!;
        const fire = (type: string, x: number, y: number, id = pid) =>
          boardEl.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        const frame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
        const clock = () => Number(g.probe().clock);
        if (g.probe().questionOpen !== 0) return { error: "nyitott kérdés a mérés előtt" };
        // Húzás közben (ugyanabban a feladatban) elkap egy lényt: a ketrecek kinyílnak.
        fire("pointermove", sx + 4, sy + 4);
        g.forceState({ question: true });
        while (g.probe().cagesOpen !== 1) await frame();
        const open = clock();
        // A mag már nyitott; a ketrec-elem a következő React-rajzzal jelenik meg.
        while (!document.querySelector('[data-testid="br-cage-2"]')) await frame();
        const cage = document.querySelector<HTMLElement>('[data-testid="br-cage-2"]')!.getBoundingClientRect();
        const tx = cage.x + cage.width / 2;
        const ty = cage.y + cage.height / 2;
        // Az ujj lent marad, a ketrec közepére csúszik, és 100 ms-onként apró mozdulattal ott áll 2 mp-ig (az élesítésen túl).
        let lastMove = -Infinity;
        let i = 0;
        while (clock() - open < 2000) {
          if (clock() - lastMove >= 100) {
            fire("pointermove", tx + (i++ % 2), ty);
            lastMove = clock();
          }
          await frame();
        }
        const mid = g.probe();
        // Felemeli, és újra bök a ketrecre (friss lenyomás): a vadász odafut és megáll → válasz.
        fire("pointerup", tx, ty);
        const tapped = clock();
        fire("pointerdown", tx, ty, pid + 100);
        fire("pointerup", tx, ty, pid + 100);
        while (Number(g.probe().questionsAnswered) < 1 && clock() - tapped < 4000) await frame();
        const end = g.probe();
        return { midAnswered: mid.questionsAnswered, midOpen: mid.questionOpen, answered: end.questionsAnswered, tapToAnswerMs: clock() - tapped };
      },
      { sx, sy },
    );
    await touch(cdp, { type: "touchEnd", touchPoints: [] });
    expect(r, JSON.stringify(r)).not.toHaveProperty("error");
    expect(r.midAnswered, "a lent tartott ujj húzása nem válasz").toBe(0);
    expect(r.midOpen, "a kérdés nyitva").toBe(1);
    expect(r.answered, `a friss bökés válaszol (${JSON.stringify(r)})`).toBe(1);
  });
});

/**
 * J5a 23. (kanban #95): a kupon mód a lapon — 3 tételes lecke-kupon, a kimerülést és az ismétlést a közös director kezeli.
 * A menetben nincs közvetlen ismétlés, minden kérdés a lecke tétele (`coupon` forrás), és nincs kérdés nélküli ketrec.
 */
test.describe("kupon mód a lapon (3 tételes lecke)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("8 kérdés egymás után: nincs közvetlen ismétlés, csak a lecke tételei, nincs kérdés nélküli megtartás", async ({ page }) => {
    test.setTimeout(150_000);
    const lesson = [0, 1, 2].map((i) => ({
      id: `e2e-lecke-${i}`,
      prompt: `Melyik a ${i + 1}. lecke-kérdés helyes válasza?`,
      options: [`jó ${i}`, `rossz ${i}a`, `rossz ${i}b`, `rossz ${i}c`],
      correctIndex: 0,
      topic: "math",
    }));
    await page.route("**/api/**", async (route) => {
      const p = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (p === "/api/auth/user") data = null;
      if (p.includes("sync-eligibility")) data = { eligible: false };
      if (p.endsWith("/coupons/active")) {
        data = { coupon: { id: "coupon-e2e", lessonId: "lecke-e2e", sectionIdx: -1, minutes: 10, remainingSeconds: 600, started: true } };
      }
      if (p.includes("material-quizzes")) data = { classroom: 5, materials: [{ id: "lecke-e2e", title: "Lecke", createdAt: "2026-11-17T08:00:00.000Z" }], items: lesson };
      await route.fulfill({ json: data });
    });
    await page.goto("/games/brain-rot-steal?seed=5");
    await page.getByRole("button", { name: /vadászat indítása/i }).tap();
    await expect(page.getByTestId("br-board")).toBeVisible();
    await expect(page.getByTestId("coupon-hud")).toBeVisible({ timeout: 10_000 });
    type P = { questionId: number | null; questionKey: string | null; questionSource: string | null; direct: number; questionOpen: number };
    const probe = () => page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => unknown } }).__websuliGame.probe() as P);
    const keys: string[] = [];
    const sources: string[] = [];
    let lastId: number | null = null;
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.forceState({ question: true }));
      await expect
        .poll(async () => {
          const pr = await probe();
          return pr.questionOpen === 1 && pr.questionId !== null && pr.questionId !== lastId ? pr.questionKey : null;
        }, { timeout: 15_000, message: `${i + 1}. kérdés` })
        .not.toBeNull();
      const pr = await probe();
      lastId = pr.questionId;
      keys.push(pr.questionKey!);
      sources.push(pr.questionSource!);
      await page.keyboard.press(i % 2 === 0 ? "2" : "1"); // felváltva rossz és (a keveréstől függően) bármely válasz
      await expect.poll(async () => (await probe()).questionOpen, { timeout: 10_000 }).toBe(0);
    }
    const allowed = new Set(lesson.map((q) => `mat:${q.id}`));
    expect(keys.every((k) => allowed.has(k)), `csak a lecke tételei: ${keys.join(" | ")}`).toBe(true);
    expect(sources.every((s) => s === "coupon"), `kupon-forrás: ${sources.join(" | ")}`).toBe(true);
    for (let i = 1; i < keys.length; i++) expect(keys[i], `közvetlen ismétlés: ${keys.join(" | ")}`).not.toBe(keys[i - 1]);
    expect(new Set(keys).size, "mindhárom tétel sorra került").toBe(3);
    expect((await probe()).direct, "nincs kérdés nélküli megtartás").toBe(0);
  });
});
