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
for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
  test.describe(`leghosszabb tételek ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });
    for (const kind of ["quiz-long", "quiz-longprompt"] as const) {
      test(`${kind}: nincs levágott válasz, a ketrecek a kérdés-kártya (és a jelmagyarázat) alatt`, async ({ page }) => {
        await page.goto("/games/brain-rot-steal?seed=11");
        await page.getByRole("button", { name: /vadászat indítása/i }).tap();
        await expect(page.getByTestId("br-board")).toBeVisible();
        await page.waitForTimeout(1500); // az évfolyam-bank lusta betöltése
        await page.evaluate((phase) => (window as unknown as GameWindow).__websuliGame!.forceState({ phase }), kind);
        await expect(cages(page)).toHaveCount(4, { timeout: 10_000 });
        await expect
          .poll(
            () =>
              page.evaluate(() => {
                const card = document.querySelector('[data-testid="br-quiz"] .play-question-card')?.getBoundingClientRect();
                const legend = document.querySelector('[data-testid="br-legend"]')?.getBoundingClientRect();
                const bottom = Math.max(card?.bottom ?? 0, legend?.bottom ?? 0);
                const cageEls = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="br-cage-"]'));
                const under = cageEls.every((el) => el.getBoundingClientRect().top >= bottom - 1);
                const clipped = Array.from(document.querySelectorAll<HTMLElement>(".br-cage-label")).some(
                  (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
                );
                const compact = cageEls.some((el) => el.dataset.compact === "true");
                const legendRows = Array.from(document.querySelectorAll<HTMLElement>(".br-legend-label"));
                const legendOk = !compact || (legendRows.length === 4 && legendRows.every((el) => el.getBoundingClientRect().bottom <= innerHeight + 1));
                return under && !clipped && legendOk ? "ok" : JSON.stringify({ under, clipped, compact, legendOk, bottom });
              }),
            { timeout: 5_000, message: "a ketrecek a kártya alatt, a felirat nem vágódik le (jelölt módban a jelmagyarázat teljes)" },
          )
          .toBe("ok");
        await shot(page, `${kind}-${vp.width}x${vp.height}.jpg`);
      });
    }
  });
}

test.describe("véletlen válasz valódi érintéssel", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("review #485 B1: a kérdés után még 400 ms-ig tolt, majd elengedett joystick nem ad választ", async ({ page }) => {
    await page.goto("/games/brain-rot-steal?seed=7");
    await page.getByRole("button", { name: /vadászat indítása/i }).tap();
    const stick = page.getByTestId("virtual-joystick");
    await expect(stick).toBeVisible();
    const sb = (await stick.boundingBox())!;
    const cx = sb.x + sb.width / 2;
    const cy = sb.y + sb.height / 2;
    const cdp: CDPSession = await page.context().newCDPSession(page);
    // A gyerek lefelé fut (az alsó ketrecsor felé), és közben elkapja a lényt: a kérdés megnyílik, ő még tolja.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx, y: cy + sb.height * 0.45, id: 1 }] });
    await page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.forceState({ question: true }));
    await expect(cages(page)).toHaveCount(4);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + 2, y: cy + sb.height * 0.46, id: 1 }] });
    await page.waitForTimeout(400);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(1500);
    const pr = await page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.probe());
    expect(pr.questionsAnswered, "a döntés előtt nincs válasz").toBe(0);
    expect(pr.questionOpen, "a kérdés még nyitva").toBe(1);
  });
});
