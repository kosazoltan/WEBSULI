import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { devices, expect, test, type CDPSession, type Page } from "@playwright/test";

import { measureOverflow, smallFonts, smallTargets } from "./support/game-mobile-quality";

/**
 * JM1 — egyeszközös Párbaj aréna (végrehajtás JM1 5. lépés; elfogadás JM-A3, K.4/15, C-34).
 *
 * - Két térfél egyidejű érintése valódi CDP-érintéssel (`Input.dispatchTouchEvent`, két különböző `id` → két `pointerId`);
 *   a hatást MUTÁCIÓVAL igazoljuk (C-34): mindkét térfél rögzül a teszt-API `probe()`-jában ÉS a DOM-ban (ítélet-sáv).
 * - Végigjátszott meccs: az 1. játékos mindig jól, a 2. rosszul → győzteshirdetés az 1. játékosnak.
 * - Holtverseny: mindketten egyszerre jól → „Döntő kérdés!” felvezetés → 2 döntő után közös győzelem.
 * - M1–M3: nincs oldalgörgetés, minden koppintási cél ≥ 48 px, minden szöveg ≥ 12 px (kezdő, beállítás, kérdés, eredmény).
 * A teszt-API (`window.__websuliGame`) és a `?duelSpeed=fast` csak `VITE_ENABLE_GAME_TEST_HOOKS=1` buildben él (build:e2e).
 */
test.use({ ...devices["Pixel 7"], serviceWorkers: "block" });

type Probe = {
  screen: string;
  phase: string;
  round: number;
  roundNo: number;
  tiebreak: number;
  tiebreaks: number;
  hpP1: number;
  hpP2: number;
  lockedP1: number;
  lockedP2: number;
  correctP1: number;
  correctP2: number;
  winners: string;
  coWin: number;
};
type GameTestWindow = { __websuliGame?: { probe?: () => Probe } };

const probe = (page: Page) => page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.probe!());

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "5");
    localStorage.removeItem("websuli.duelSetup.v1");
    localStorage.removeItem("websuli.duelRecord.v1");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    await route.fulfill({ json: p === "/api/auth/user" ? null : [] });
  });
});

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.GAME_MOBILE_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70, scale: "css" });
}

async function openSetup(page: Page, opts: { g1: number; g2: number; fast?: boolean; seed?: number }): Promise<void> {
  const q = new URLSearchParams({ seed: String(opts.seed ?? 7) });
  if (opts.fast !== false) q.set("duelSpeed", "fast");
  await page.goto(`/games/parbaj?${q}`);
  await page.getByTestId("duel-start").click();
  await expect(page.getByTestId("duel-setup")).toBeVisible();
  await page.getByTestId(`duel-grade-p1-${opts.g1}`).click();
  await page.getByTestId(`duel-grade-p2-${opts.g2}`).click();
}

/** Megvárja a következő kör nyitott kérdését (mindkét térfél még nem válaszolt). */
async function nextQuestion(page: Page, afterRound: number): Promise<Probe | null> {
  let last: Probe | null = null;
  await expect
    .poll(
      async () => {
        last = await probe(page);
        return last.phase === "finished" || (last.phase === "question" && last.roundNo > afterRound && !last.lockedP1 && !last.lockedP2);
      },
      { timeout: 20_000, intervals: [50] },
    )
    .toBe(true);
  return last!.phase === "finished" ? null : last;
}

async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`nincs doboz: ${selector}`);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

const option = (seat: "p1" | "p2", correct: boolean) => `[data-testid^="duel-option-${seat}-"][data-correct="${correct}"]`;

async function touch(cdp: CDPSession, type: "touchStart" | "touchEnd", points: Array<{ x: number; y: number; id: number }>) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p) => ({ ...p, radiusX: 4, radiusY: 4, force: 1 })) });
}

/** Két ujj EGYSZERRE: egy touchStart két ponttal, majd elengedés. */
async function tapTogether(cdp: CDPSession, a: { x: number; y: number }, b: { x: number; y: number }) {
  await touch(cdp, "touchStart", [{ ...a, id: 1 }, { ...b, id: 2 }]);
  await touch(cdp, "touchEnd", []);
}

/** Átfedő érintés: 1. ujj le, 2. ujj le, 1. ujj fel, 2. ujj fel (a két térfél egymástól független). */
async function tapOverlapping(cdp: CDPSession, a: { x: number; y: number }, b: { x: number; y: number }) {
  await touch(cdp, "touchStart", [{ ...a, id: 3 }]);
  await touch(cdp, "touchStart", [{ ...a, id: 3 }, { ...b, id: 4 }]);
  await touch(cdp, "touchEnd", [{ ...b, id: 4 }]);
  await touch(cdp, "touchEnd", []);
}

/** A meccs végigjátszása kétujjas érintéssel (az 1. játékos `p1Correct`, a 2. `p2Correct` szerint). */
async function playOut(page: Page, cdp: CDPSession, p1Correct: boolean, p2Correct: boolean): Promise<void> {
  let round = 0;
  for (let i = 0; i < 12; i++) {
    const p = await nextQuestion(page, round);
    if (!p) return;
    round = p.roundNo;
    await tapTogether(cdp, await center(page, option("p1", p1Correct)), await center(page, option("p2", p2Correct)));
    await expect.poll(async () => (await probe(page)).round, { timeout: 5_000, intervals: [30] }).toBe(round);
  }
}

for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("kétujjas valódi érintés: mindkét térfél rögzül (mutáció), az 1. játékos nyer, győzteshirdetés", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openSetup(page, { g1: 4, g2: 7 });
      await page.getByTestId("duel-go").click();
      await expect(page.getByTestId("duel-arena")).toBeVisible();
      const cdp = await page.context().newCDPSession(page);
      let round = 0;
      for (let i = 0; i < 12; i++) {
        const p = await nextQuestion(page, round);
        if (!p) break;
        round = p.roundNo;
        const before = p;
        // emberi tempó: a 200 ms alatti válasz „gyanús” (bónusz és leggyorsabb-idő nélkül) — itt valós koppintást utánzunk
        await page.waitForTimeout(450);
        const a = await center(page, option("p1", true));
        const b = await center(page, option("p2", false));
        if (i % 2 === 0) await tapTogether(cdp, a, b);
        else await tapOverlapping(cdp, a, b);
        // C-34: a gesztus HATÁSA — mindkét térfél válasza rögzült (nem csak az esemény ment el).
        await expect.poll(async () => {
          const s = await probe(page);
          return s.lockedP1 === 1 && s.lockedP2 === 1 && s.correctP1 === before.correctP1 + 1 && s.correctP2 === before.correctP2;
        }, { timeout: 5_000, intervals: [30] }).toBe(true);
        await expect(page.getByTestId("duel-verdict-p1")).toContainText("Helyes!");
        await expect(page.getByTestId("duel-verdict-p2")).toContainText("A helyes:");
      }
      await expect(page.getByTestId("duel-result")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("duel-winner")).toContainText("1. játékos nyerte a párbajt");
      const end = await probe(page);
      expect(end.winners).toBe("p1");
      expect(end.round).toBe(7);
      expect(end.hpP1).toBe(100);
      await expect(page.getByTestId("duel-acc-p1")).toHaveText("100%");
      await expect(page.getByTestId("duel-acc-p2")).toHaveText("0%");
      await expect(page.getByTestId("duel-stats-p2")).toContainText("Jó próbálkozás");
      await expect(page.getByTestId("duel-fast-p1")).toContainText("mp");
      // Visszavágó: új meccs, a mérleg 1 – 0
      await page.getByTestId("duel-rematch").click();
      await expect(page.getByTestId("duel-arena")).toBeVisible();
      expect((await probe(page)).round).toBe(0);
      expect(errors, "pageerror").toEqual([]);
    });

    test("holtverseny: 7 kör után „Döntő kérdés!”, 2 döntő után közös győzelem", async ({ page }) => {
      await openSetup(page, { g1: 6, g2: 6 });
      await page.getByTestId("duel-go").click();
      const cdp = await page.context().newCDPSession(page);
      let round = 0;
      let sawTiebreakIntro = false;
      for (let i = 0; i < 12; i++) {
        const p = await nextQuestion(page, round);
        if (!p) break;
        round = p.roundNo;
        // azonos évfolyam → azonos kérdés; egyszerre koppintva azonos idő → azonos csapás
        await tapTogether(cdp, await center(page, option("p1", true)), await center(page, option("p2", true)));
        await expect.poll(async () => (await probe(page)).round, { timeout: 5_000, intervals: [30] }).toBe(round);
        if (round === 7) {
          await expect.poll(async () => {
            const s = await probe(page);
            return s.phase === "intro" && s.tiebreak === 1;
          }, { timeout: 5_000, intervals: [20] }).toBe(true);
          await expect(page.getByTestId("duel-intro-p1")).toContainText("Döntő kérdés");
          await expect(page.getByTestId("duel-intro-p2")).toContainText("Döntő kérdés");
          sawTiebreakIntro = true;
        }
      }
      expect(sawTiebreakIntro).toBe(true);
      await expect(page.getByTestId("duel-result")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("duel-winner")).toContainText("Közös győzelem");
      const end = await probe(page);
      expect(end.coWin).toBe(1);
      expect(end.round).toBe(9);
      expect(end.tiebreaks).toBe(2);
      expect(end.hpP1).toBe(end.hpP2);
    });

    test("M1 M2 M3: kezdő, beállítás, kérdés és eredmény — nincs oldalgörgetés, célok ≥ 48 px, szöveg ≥ 12 px", async ({ page }) => {
      await page.goto("/games/parbaj?seed=11&duelSpeed=fast");
      await expect(page.getByTestId("duel-start")).toBeVisible();
      await page.waitForFunction(() => document.querySelectorAll("[data-game-start] *").length > 0 && !document.getAnimations().some((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity));
      const check = async (label: string) => {
        expect((await measureOverflow(page)).x, `M1 ${label}`).toBeLessThanOrEqual(2);
        expect(await smallTargets(page), `M2 ${label}`).toEqual([]);
        expect(await smallFonts(page), `M3 ${label}`).toEqual([]);
      };
      await check("kezdő");
      await page.getByTestId("duel-start").click();
      await expect(page.getByTestId("duel-setup")).toBeVisible();
      await check("beállítás");
      await page.getByTestId("duel-go").click();
      await nextQuestion(page, 0);
      await check("kérdés");
      await playOut(page, await page.context().newCDPSession(page), false, true);
      await expect(page.getByTestId("duel-result")).toBeVisible({ timeout: 15_000 });
      await check("eredmény");
    });
  });
}

/** A csapás rázása (feel.addTrauma) a sebzett térfélen: normál módban mozdul, csökkentett mozgásnál nem (K.4/19, M9). */
async function sampleShake(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const out: string[] = [];
        const el = document.querySelector<HTMLElement>('[data-testid="duel-pane-p2"] .duel-pane-inner');
        let n = 0;
        const step = () => {
          out.push(el?.style.transform ?? "");
          if (++n < 20) requestAnimationFrame(step);
          else resolve(out);
        };
        requestAnimationFrame(step);
      }),
  );
}

for (const reduced of [false, true]) {
  test.describe(`390x844 rázás ${reduced ? "csökkentett mozgással" : "normál"}`, () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test(`csapás után a sebzett térfél ${reduced ? "NEM rázkódik" : "rázkódik"}`, async ({ page }) => {
      if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
      await openSetup(page, { g1: 5, g2: 5 });
      await page.getByTestId("duel-go").click();
      const p = await nextQuestion(page, 0);
      expect(p).not.toBeNull();
      await page.waitForTimeout(400);
      const cdp = await page.context().newCDPSession(page);
      await tapTogether(cdp, await center(page, option("p1", true)), await center(page, option("p2", false)));
      await expect.poll(async () => (await probe(page)).hpP2, { timeout: 5_000 }).toBeLessThan(100);
      const frames = await sampleShake(page);
      const moved = frames.filter((t) => t !== "" && t !== "none");
      if (reduced) expect(moved, "csökkentett mozgásnál nincs rázás").toEqual([]);
      else expect(moved.length, "normál módban a sebzett térfél megmozdul").toBeGreaterThan(0);
    });
  });
}

/**
 * Képernyőképek (csak `GAME_MOBILE_SHOT_DIR` mellett): kezdő / beállítás / meccs közben / csapás / döntő kérdés / eredmény,
 * normál tempóban (a valódi animációkkal), 360×640, 390×844, 844×390.
 */
for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`képek ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test.skip(!process.env.GAME_MOBILE_SHOT_DIR, "csak képernyőkép-futásban");
    test.setTimeout(150_000);

    test("képernyőképek", async ({ page }) => {
      const tag = `${viewport.width}x${viewport.height}`;
      await page.goto("/games/parbaj?seed=21");
      await expect(page.getByTestId("duel-start")).toBeVisible();
      await page.waitForTimeout(700);
      await shot(page, `duel-${tag}-start.jpg`);
      await page.getByTestId("duel-start").click();
      await page.getByTestId("duel-grade-p1-4").click();
      await page.getByTestId("duel-grade-p2-4").click();
      await page.getByTestId("duel-roll-p2").click();
      await shot(page, `duel-${tag}-setup.jpg`);
      await page.getByTestId("duel-go").click();
      const cdp = await page.context().newCDPSession(page);
      let round = 0;
      for (let i = 0; i < 12; i++) {
        const p = await nextQuestion(page, round);
        if (!p) break;
        round = p.roundNo;
        if (round === 1) {
          await page.waitForTimeout(900);
          await shot(page, `duel-${tag}-play.jpg`);
        }
        // 2. kör: a 2. játékos hibázik (csapás-kép); 4. kör: az 1. hibázik → újra egyenlő → holtverseny a 7. kör után.
        await tapTogether(cdp, await center(page, option("p1", round !== 4)), await center(page, option("p2", round !== 2)));
        if (round === 2) {
          await page.waitForTimeout(350);
          await shot(page, `duel-${tag}-hit.jpg`);
        }
        if (round === 7) {
          await expect.poll(async () => (await probe(page)).tiebreak, { timeout: 15_000, intervals: [50] }).toBe(1);
          await page.waitForTimeout(700);
          await shot(page, `duel-${tag}-tiebreak.jpg`);
        }
      }
      await expect(page.getByTestId("duel-result")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(900);
      await shot(page, `duel-${tag}-result.jpg`);
    });
  });
}
