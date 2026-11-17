import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type CDPSession, type Page } from "@playwright/test";

/**
 * J1a — „Hegyre fel!” valódi érintéssel (végrehajtás J1a 10.; terv 5.1 Q1, J1, J4, J5, J9, J16; K.4/13–18, 23–25).
 *
 * Az ELSŐ eset szándékosan KAMPÓ NÉLKÜLI: se `forceState`, se `probe` — csak a felhasználó útja érintéssel (a Kockavadásznál
 * a kampós teszt elfedte a valódi út hibáját). A kapu-táblák helyét a DOM adja (a `data-correct` a teszt-buildben a jó / rossz
 * kaput jelöli, a választás érintéssel történik); a sávváltás valódi húzás (CDP-érintés), és hatását a tábla „itt futsz”
 * jelölése mutatja (mutáció, C-34). Utána minden kapura rosszul felelünk és nem térünk ki: a tanító szakasz (30 mp) után a
 * hullám utoléri a futót — így a menet a valódi úton ér véget.
 *
 * Képernyőkép: ha a `TS_SHOT_DIR` meg van adva, oda (JPEG 70, CSS-pixel).
 */

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  // Az évfolyam-kapu (ClassroomGateModal) ne takarja a kezdőképernyőt: 4. osztály (a 3–4. évfolyam hosszabb ablakával).
  await page.addInitScript(() => localStorage.setItem("websuli.classroomGrade", "4"));
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

type Probe = { simTime: number; questionOpen: number; questionsAnswered: number; questionsCorrect: number; lane: number; x: number; jumps: number; reveal: number; waveGap: number };
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => Probe } }).__websuliGame.probe());
const gates = (page: Page) => page.locator('[data-testid="ts-quiz"] .ts-gate');

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.TS_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70, scale: "css" });
}

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", points: Array<{ x: number; y: number; id: number }>) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : points });
}

/** Valódi húzás a játéktéren (CDP-érintés, lépésenként). */
async function swipe(page: Page, cdp: CDPSession, dx: number, dy: number): Promise<void> {
  const box = (await page.getByTestId("tsunami-swipe").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.62;
  await touch(cdp, "touchStart", [{ x, y, id: 1 }]);
  for (let k = 1; k <= 5; k++) await touch(cdp, "touchMove", [{ x: x + (dx * k) / 5, y: y + (dy * k) / 5, id: 1 }]);
  await touch(cdp, "touchEnd", []);
}

/** Koppintás egy kapu-tábla közepére valódi érintéssel. */
async function tapGate(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible({ timeout: 25_000 });
  const box = await el.boundingBox();
  expect(box, `${selector} doboza`).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

test.describe("valódi érintés", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("kampó nélkül: indítás, húzás, jó és rossz kapu, „Miért?”, a hullám utolér, Gyakorold még, új futam", async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/games/tsunami-english?difficulty=easy");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
    await expect(page.getByTestId("ts-hint")).toBeVisible(); // tanító súgó (egy sor)
    await shot(page, "tsunami-390x844-play.jpg");
    const cdp = await page.context().newCDPSession(page);

    // 1. kérdés: a táblák a pályán; a futó a középső sávban („itt futsz”), húzás jobbra → a jobb sávba vált.
    await expect(gates(page)).toHaveCount(3, { timeout: 25_000 });
    await expect(page.getByTestId("play-question-more"), "a kérdés koppintás nélkül olvasható").toHaveCount(0);
    await expect(page.locator('[data-testid="ts-quiz"] .ts-gate[data-here="true"]')).toHaveAttribute("data-testid", "ts-gate-1");
    await swipe(page, cdp, 120, 0);
    await expect(page.locator('[data-testid="ts-quiz"] .ts-gate[data-here="true"]'), "a húzás sávot váltott").toHaveAttribute("data-testid", "ts-gate-2", { timeout: 3_000 });
    await shot(page, "tsunami-390x844-question.jpg");
    // A JÓ kapu érintéssel: a tábla zöld, a pont nő.
    const score0 = Number((await page.getByTestId("ts-score").innerText()).replace(/\D/g, ""));
    await tapGate(page, '[data-testid="ts-quiz"] .ts-gate[data-correct="true"]');
    await expect(page.locator('[data-testid="ts-quiz"] .ts-gate[data-correct="true"]')).toHaveAttribute("data-state", "correct");
    await expect.poll(async () => Number((await page.getByTestId("ts-score").innerText()).replace(/\D/g, "")), { timeout: 5_000 }).toBeGreaterThan(score0);

    // 2. kérdés: ROSSZ kapu → nincs dialógus, a helyes kapu zölden látszik, „Miért?” (a kijelzés ALATT, álló gombon) → kártya.
    await expect(gates(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(gates(page)).toHaveCount(3, { timeout: 30_000 });
    await tapGate(page, '[data-testid="ts-quiz"] .ts-gate[data-correct="false"]');
    await expect(page.locator('[data-testid="ts-quiz"] .ts-gate[data-correct="true"]')).toHaveAttribute("data-state", "correct");
    await expect(page.locator('[data-testid="ts-quiz"] .ts-gate[data-state="wrong"]')).toHaveCount(1);
    expect(await page.locator('[role="dialog"]').count(), "a hibás válasz nem nyit blokkoló kártyát").toBe(0);
    await shot(page, "tsunami-390x844-wrong.jpg");
    await page.getByTestId("play-why").first().tap();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await expect(page.getByTestId("quiz-feedback")).toHaveAttribute("data-outcome", "wrong");
    await expect(page.getByTestId("quiz-feedback-retry")).toHaveCount(0);
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);

    // 3. kérdés: ROSSZ kapu, „Miért?” nélkül → a helyes kapu ≥ 1,8 mp-ig zölden látszik — a LAPON BELÜL, képkockánként mérve (C-65).
    await expect(page.locator('[data-testid="ts-quiz"] .ts-gate[data-state="correct"]')).toHaveCount(0, { timeout: 15_000 });
    await expect(gates(page)).toHaveCount(3, { timeout: 30_000 });
    await page.evaluate(() => {
      const w = window as unknown as { __tsReveal?: { start: number | null; end: number | null } };
      w.__tsReveal = { start: null, end: null };
      const tick = () => {
        const on = document.querySelector('[data-testid="ts-quiz"] .ts-gate[data-correct="true"][data-state="correct"]') !== null;
        const r = w.__tsReveal!;
        if (r.start === null && on) r.start = performance.now();
        if (r.start !== null && r.end === null && !on) r.end = performance.now();
        if (r.end === null) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const reveal = () => page.evaluate(() => (window as unknown as { __tsReveal: { start: number | null; end: number | null } }).__tsReveal);
    await tapGate(page, '[data-testid="ts-quiz"] .ts-gate[data-correct="false"]');
    await expect.poll(async () => (await reveal()).start !== null, { timeout: 5_000 }).toBe(true);
    await expect.poll(async () => (await reveal()).end !== null, { timeout: 20_000 }).toBe(true);
    const r = await reveal();
    expect(r.end! - r.start!, "a megoldás ≥ 1,8 mp-ig látszik").toBeGreaterThanOrEqual(1_800);

    // Innen minden kapura rossz válasz, kitérés nincs: a tanító szakasz után a hullám utoléri a futót.
    const over = page.getByTestId("ts-over");
    for (let i = 0; i < 90 && !(await over.isVisible()); i++) {
      const wrong = page.locator('[data-testid="ts-quiz"] .ts-gate[data-correct="false"]').first();
      const state = await page.evaluate(() => ({
        open: document.querySelector('[data-testid="ts-quiz"]')?.getAttribute("data-state") === "open",
      }));
      if (state.open) {
        const box = await wrong.boundingBox().catch(() => null);
        if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      }
      await page.waitForTimeout(1_500);
    }
    await expect(over).toBeVisible({ timeout: 90_000 });
    await shot(page, "tsunami-390x844-result.jpg");
    // Eredmény: a hibázott tételek a helyes válasszal („Gyakorold még”), következő cél, automatikus újraindítás nincs.
    await expect(page.getByTestId("result-review")).toBeVisible();
    expect(await page.getByTestId("result-review-item").count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("ts-next-goal")).toBeVisible();
    await page.waitForTimeout(2_000);
    await expect(over, "a menet vége után nincs automatikus újraindítás").toBeVisible();
    await page.getByTestId("button-tsunami-retry").tap();
    await expect(page.getByTestId("ts-distance")).toContainText("0 m");
    // Az új menet valóban fut (a távolság nő).
    await expect.poll(async () => Number((await page.getByTestId("ts-distance").innerText()).replace(/\D/g, "")), { timeout: 10_000 }).toBeGreaterThan(5);
    expect(errors.filter((e) => !/401|Failed to fetch/i.test(e))).toEqual([]);
  });

  test("review #483: szünet → Újrakezdés (érintéssel) után az új menet fut: a távolság nő és kérdés érkezik", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/games/tsunami-english?difficulty=easy");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
    const dist = async () => Number((await page.getByTestId("ts-distance").innerText()).replace(/\D/g, ""));
    await expect.poll(dist, { timeout: 10_000 }).toBeGreaterThan(5);
    await page.getByTestId("game-pause").tap();
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    await page.getByTestId("game-restart").tap();
    await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
    await expect(page.getByTestId("ts-distance")).toContainText("0 m");
    await expect.poll(dist, { timeout: 10_000, message: "az újrakezdett menetben a távolság nő" }).toBeGreaterThan(5);
    await expect(gates(page), "az újrakezdett menetben kérdés érkezik").toHaveCount(3, { timeout: 30_000 });
  });

  test("két ujj egyszerre (K.4/15): a tárcsa jobbra kormányoz, miközben az Ugrás gomb ugrik — mindkét hatás mérve", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=5");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("virtual-joystick")).toBeVisible();
    await page.waitForTimeout(500);
    const joy = (await page.getByTestId("virtual-joystick").boundingBox())!;
    const jump = (await page.getByRole("button", { name: "Ugrás" }).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const jx = joy.x + joy.width / 2;
    const jy = joy.y + joy.height / 2;
    const p0 = await probe(page);
    await touch(cdp, "touchStart", [{ x: jx, y: jy, id: 1 }]);
    await touch(cdp, "touchMove", [{ x: jx + joy.width * 0.45, y: jy, id: 1 }]);
    await touch(cdp, "touchStart", [{ x: jx + joy.width * 0.45, y: jy, id: 1 }, { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 2 }]);
    await page.waitForTimeout(350);
    const p1 = await probe(page);
    await touch(cdp, "touchEnd", []);
    expect(p1.x, "a tárcsa jobbra vitte a futót").toBeGreaterThan(p0.x + 0.1);
    expect(p1.jumps, "a második ujj ugrott").toBeGreaterThan(p0.jumps);
  });
});

test.describe("J1 / J5: a játék a kérdés alatt fut (lassítva, ≥ 0,35×), szünetben áll; hibás kapu után teljes sebesség", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("nyitott kérdésnél a sim-idő / valós idő ≥ 0,35 és < 1; hibás válasz után ≤ 2,5 mp-en belül teljes sebesség, kártya nélkül; szünetben 0", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=9");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: { forceState?: unknown } }).__websuliGame?.forceState === "function");
    await page.evaluate(() => (window as unknown as { __websuliGame: { forceState: (p: Record<string, unknown>) => void } }).__websuliGame.forceState({ question: true }));
    await expect(gates(page)).toHaveCount(3, { timeout: 10_000 });
    const rate = (ms: number) =>
      page.evaluate(async (wait) => {
        const api = (window as unknown as { __websuliGame: { probe: () => { simTime: number; questionOpen: number } } }).__websuliGame;
        const s0 = api.probe().simTime;
        const t0 = performance.now();
        await new Promise((res) => setTimeout(res, wait));
        return { r: (api.probe().simTime - s0) / (performance.now() - t0), open: api.probe().questionOpen };
      }, ms);
    const during = await rate(1000);
    expect(during.open, "a mérés végén is nyitott a kérdés").toBe(1);
    expect(during.r).toBeGreaterThanOrEqual(0.35 * 0.9);
    expect(during.r).toBeLessThan(0.9);
    // Hibás válasz a billentyűzettel (1–3): a kijelzés alatt teljes sebesség, nincs dialógus.
    const wrongIdx = await page.locator('[data-testid="ts-quiz"] .ts-gate[data-correct="false"]').first().getAttribute("data-testid");
    await page.keyboard.press(String(Number(wrongIdx!.replace("ts-gate-", "")) + 1));
    await expect(page.locator('[data-testid="ts-quiz"] .ts-gate[data-state="wrong"]')).toHaveCount(1);
    const after = await rate(1000);
    expect(after.open).toBe(0);
    expect(after.r, "hibás válasz után teljes sebesség").toBeGreaterThanOrEqual(0.9);
    expect(await page.locator('[role="dialog"]').count(), "nincs blokkoló kártya").toBe(0);
    await page.getByTestId("game-pause").click();
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    expect((await rate(600)).r, "szünetben a szimuláció áll").toBe(0);
    // Review #483: a szünetmenü „Újrakezdés”-e után az új menet fut (a fázis „play” marad, a hurok mégis újraindul).
    await page.getByTestId("game-restart").click();
    await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
    await expect.poll(async () => (await probe(page)).simTime, { timeout: 5_000, message: "az újrakezdett menet szimulációja fut" }).toBeGreaterThan(500);
    expect((await rate(800)).r, "az újrakezdett menet teljes sebességgel fut").toBeGreaterThan(0.5);
  });

  test("billentyűzet: ←/→ sávot vált, ↑ ugrik (egy sáv / lenyomás)", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=3");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    await page.waitForTimeout(300);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await probe(page)).lane).toBe(0);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await probe(page)).lane).toBe(2);
    const j0 = (await probe(page)).jumps;
    await page.keyboard.press("ArrowUp");
    await expect.poll(async () => (await probe(page)).jumps).toBeGreaterThan(j0);
  });
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`${viewport.width}x${viewport.height}: kapu-táblák a kérdés-kártya alatt, egymást nem fedik, ≥ 48 px, a képen belül`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("kérdés-állapot és képernyőképek", async ({ page }) => {
      await page.goto("/games/tsunami-english?seed=11&difficulty=easy");
      await expect(page.getByTestId("button-tsunami-start")).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(500);
      await shot(page, `tsunami-${viewport.width}x${viewport.height}-start.jpg`);
      await page.getByTestId("button-tsunami-start").tap();
      await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
      if (process.env.TS_SHOT_DIR) {
        await page.waitForTimeout(5_000);
        await shot(page, `tsunami-${viewport.width}x${viewport.height}-play.jpg`);
      }
      await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: { forceState?: unknown } }).__websuliGame?.forceState === "function");
      await page.evaluate(() => (window as unknown as { __websuliGame: { forceState: (p: Record<string, unknown>) => void } }).__websuliGame.forceState({ question: true }));
      await expect(gates(page)).toHaveCount(3, { timeout: 10_000 });
      await page.waitForTimeout(1_200);
      const boxes = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="ts-quiz"] .play-question-card')!.getBoundingClientRect();
        // A vezérlők (tárcsa, Ugrás gomb) dobozai — a tábla egyikkel sem fedhet át.
        const rect = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
        };
        const controls = Array.from(document.querySelectorAll('[data-testid="tsunami-touch-controls"] > *')).map(rect);
        const g = Array.from(document.querySelectorAll('[data-testid="ts-quiz"] .ts-gate')).map(rect);
        return { card: { b: card.bottom }, controls, g, vw: innerWidth, vh: innerHeight };
      });
      expect(boxes.controls.length, "a tárcsa és az Ugrás gomb látszik").toBe(2);
      for (const b of boxes.g) {
        expect(b.w).toBeGreaterThanOrEqual(48);
        expect(b.h).toBeGreaterThanOrEqual(48);
        expect(b.l).toBeGreaterThanOrEqual(0);
        expect(b.r).toBeLessThanOrEqual(boxes.vw);
        expect(b.t, "a tábla a kérdés-kártya alatt").toBeGreaterThanOrEqual(boxes.card.b);
        for (const c of boxes.controls) {
          const overlap = Math.min(b.r, c.r) - Math.max(b.l, c.l) > 0 && Math.min(b.b, c.b) - Math.max(b.t, c.t) > 0;
          expect(overlap, "a tábla nem takarja a vezérlőt").toBe(false);
        }
      }
      const sorted = boxes.g.slice().sort((a, b) => a.l - b.l);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.l - sorted[i - 1]!.r, "a táblák között ≥ 12 px").toBeGreaterThanOrEqual(12);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await shot(page, `tsunami-${viewport.width}x${viewport.height}-question.jpg`);
      if (viewport.width !== 390) {
        await page.locator('[data-testid="ts-quiz"] .ts-gate[data-correct="false"]').first().click();
        await page.waitForTimeout(200);
        await shot(page, `tsunami-${viewport.width}x${viewport.height}-wrong.jpg`);
      }
    });
  });
}
