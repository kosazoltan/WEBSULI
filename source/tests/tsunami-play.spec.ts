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

type Probe = { distance: number; simTime: number; questionOpen: number; questionsAnswered: number; questionsCorrect: number; lane: number; x: number; jumps: number; reveal: number; waveGap: number };
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
    // Az új menet a táv elejéről indul (a HUD 10 Hz-cel frissül, ezért szám-összevetés, nem „0 m” szövegegyezés).
    await expect.poll(async () => Number((await page.getByTestId("ts-distance").innerText()).replace(/\D/g, "")), { timeout: 5_000 }).toBeLessThan(60);
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
    const simDist = async () => (await probe(page)).distance;
    await expect.poll(simDist, { timeout: 15_000 }).toBeGreaterThan(30);
    await page.getByTestId("game-pause").tap();
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    await page.getByTestId("game-restart").tap();
    await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
    await expect.poll(simDist, { timeout: 5_000, message: "az újrakezdés új menetet indított (a táv visszaállt)" }).toBeLessThan(25);
    await expect.poll(simDist, { timeout: 10_000, message: "az újrakezdett menetben a távolság nő" }).toBeGreaterThan(30);
    await expect.poll(dist, { message: "a HUD is az új menetet mutatja" }).toBeGreaterThan(5);
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

  test("átmeneti kapu 3f: a megállítási okok nem oldják fel egymást („Miért?” + háttérbe tett lap → folytatás után is áll, amíg a kártya nyitva)", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=31");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    await openQuestion(page);
    await expect(gates(page)).toHaveCount(3, { timeout: 10_000 });
    const wrong = page.locator('[data-testid="ts-quiz"] .ts-gate[data-correct="false"]').first();
    await expect(wrong).toBeVisible();
    await wrong.click();
    await page.getByTestId("play-why").first().click();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    const sim = async () => (await probe(page)).simTime;
    const s0 = await sim();
    // A lap háttérbe kerül → szünet menü; folytatás: a kártya még nyitva → a játék tovább áll.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    await page.getByTestId("game-resume").click();
    await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
    await page.waitForTimeout(800);
    expect(await sim(), "a szünet feloldása nem oldja fel a „Miért?” megállítását").toBe(s0);
    await page.getByTestId("quiz-feedback-dismiss").click();
    await expect.poll(sim, { message: "a kártya bezárása után fut tovább" }).toBeGreaterThan(s0);
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

/** Kérdés nyitása a teszt-kampóval, és a kérdés-állapot `probe`-ja. */
/** D-J1a-18: egysoros (minden nézetben egy sorba férő) és fekvő nézetben kétsoros, de szélességben beférő válaszok. */
const SHORT_ANSWERS = ["cat", "dog", "sun"];
const TWO_LINE_ANSWERS = ["zöld körte a tálban", "sárga banán a polcon", "kék szilva a kosárban"];
/** Újra-review #483: álló nézetben 2–3 sorra törő, de a táblába levágás nélkül beférő válaszok. */
const PORTRAIT_MULTI_LINE_ANSWERS = ["piros alma a fán", "zöld körte a tálon", "kék szilva a fán"];

async function openQuestion(page: Page, patch: Record<string, unknown> = { question: true }): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: { forceState?: unknown } }).__websuliGame?.forceState === "function");
  await page.evaluate((p) => (window as unknown as { __websuliGame: { forceState: (p: Record<string, unknown>) => void } }).__websuliGame.forceState(p), patch);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`${viewport.width}x${viewport.height}: a kapu-táblán INDÍTOTT húzás sávot vált, nem válaszol (review #483 M1, D-J1a-9)`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("táblán indított 50 px-es húzás → sávváltás, válasz nincs; rövid, mozdulatlan koppintás → válasz", async ({ page }) => {
      await page.goto("/games/tsunami-english?seed=17&difficulty=easy");
      await page.getByTestId("button-tsunami-start").tap();
      await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
      // D-J1a-18: táblás eset kényszerített egysoros válaszokkal (fekvőben a kétsoros véletlen tétel jogosan lista mód).
      await openQuestion(page, { question: true, answers: SHORT_ANSWERS });
      await expect(gates(page)).toHaveCount(3, { timeout: 10_000 });
      await page.waitForTimeout(500);
      const cdp = await page.context().newCDPSession(page);
      // A középső (az „itt futsz”) tábláról 50 px-et húz jobbra, a felengedés még a tábla dobozán belül van.
      const box = (await page.getByTestId("ts-gate-1").boundingBox())!;
      const x = box.x + box.width / 2 - 25;
      const y = box.y + box.height / 2;
      const before = await probe(page);
      await touch(cdp, "touchStart", [{ x, y, id: 1 }]);
      for (let k = 1; k <= 5; k++) await touch(cdp, "touchMove", [{ x: x + 10 * k, y, id: 1 }]);
      await touch(cdp, "touchEnd", []);
      await expect.poll(async () => (await probe(page)).lane, { message: "a táblán indított húzás sávot váltott" }).toBe(before.lane + 1);
      const after = await probe(page);
      expect(after.questionsAnswered, "a húzás nem rögzített választ").toBe(0);
      expect(await page.locator('[data-testid="ts-quiz"] .ts-gate[data-state="correct"]').count(), "nincs megoldás-kijelzés").toBe(0);
      // Rövid, mozdulatlan koppintás a jó táblán → válasz.
      const good = (await page.locator('[data-testid="ts-quiz"] .ts-gate[data-correct="true"]').boundingBox())!;
      await page.touchscreen.tap(good.x + good.width / 2, good.y + good.height / 2);
      await expect.poll(async () => (await probe(page)).questionsAnswered).toBe(1);
      expect((await probe(page)).questionsCorrect).toBe(1);
    });
  });
}

test.describe("időtúllépés (D-J1a-13): a tétlen átfutás lejárt válasz — „Miért?” → data-outcome=timeout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("bemenet nélkül a kapun átfutva: „Lejárt az idő”, a nyilvántartásban nincs válasz, a magyarázat timeout", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/games/tsunami-english?seed=23&difficulty=easy");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    await expect(gates(page)).toHaveCount(3, { timeout: 30_000 });
    await expect(page.getByTestId("play-question-status")).toContainText("Lejárt az idő", { timeout: 15_000 });
    const p = await probe(page);
    expect(p.questionsAnswered, "a tétlen átfutás nem válasz").toBe(0);
    await page.getByTestId("play-why").first().click();
    await expect(page.getByTestId("quiz-feedback")).toHaveAttribute("data-outcome", "timeout");
  });

  test("ÚK2 (D-J1a-17): bemenet nélkül a JÓ kapun átfutva „Jó kapu!” (nem „Lejárt az idő”), rossz kapun „Lejárt az idő”; válasz egyiknél sincs", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/games/tsunami-english?seed=23&difficulty=easy");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    const quiz = page.getByTestId("ts-quiz");
    const visibleStatus = quiz.locator(".play-question-status:visible");
    const seen = { good: 0, bad: 0 };
    // Semmilyen bemenet nincs (se billentyű, se érintés): a futó a középső sávban marad, a kérdéseket a teszt-kampó nyitja.
    for (let round = 0; round < 10 && seen.good === 0; round++) {
      if ((await gates(page).count()) === 0) await openQuestion(page, { question: true, answers: SHORT_ANSWERS });
      await expect(gates(page)).toHaveCount(3, { timeout: 15_000 });
      const lane = (await probe(page)).lane;
      const correctIndex = Number((await quiz.locator('.ts-gate[data-correct="true"]').getAttribute("data-testid"))!.replace("ts-gate-", ""));
      await expect(quiz).toHaveAttribute("data-state", "reveal", { timeout: 15_000 });
      if (correctIndex === lane) {
        seen.good += 1;
        await expect(visibleStatus).toHaveCount(1);
        await expect(visibleStatus).toContainText("Jó kapu!");
        await expect(visibleStatus).not.toContainText("Lejárt");
        await expect(page.getByTestId("ts-idle-status")).toBeVisible();
        await shot(page, "tsunami-390x844-idle-good.jpg");
      } else {
        seen.bad += 1;
        await expect(visibleStatus).toHaveCount(1);
        await expect(visibleStatus).toContainText("Lejárt az idő");
        await expect(page.getByTestId("ts-idle-status")).toHaveCount(0);
      }
      expect((await probe(page)).questionsAnswered, "a tétlen átfutás a nyilvántartásban nem válasz (D-J1a-13)").toBe(0);
      await expect(gates(page)).toHaveCount(0, { timeout: 15_000 });
    }
    expect(seen.good, `volt jó kapus tétlen átfutás (${JSON.stringify(seen)})`).toBeGreaterThan(0);
  });
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`${viewport.width}x${viewport.height}: hosszú válaszok — „lista mód”, teljes szöveg (review #483 M3, D-J1a-11)`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("a forrásokban talált leghosszabb válaszok levágás nélkül olvashatók, a kapu színével / szimbólumával párban", async ({ page }) => {
      await page.goto("/games/tsunami-english?seed=29&difficulty=easy");
      await page.getByTestId("button-tsunami-start").tap();
      await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
      await openQuestion(page, { question: true, longAnswers: true });
      const quiz = page.getByTestId("ts-quiz");
      await expect(quiz).toBeAttached({ timeout: 10_000 });
      await page.waitForTimeout(600);
      // A tábla valódi szélessége dönt: ahol nem fér (360 / 390 px), ott „lista mód” (a kérdés-sáv gombjai teljes szöveggel);
      // ahol befér (a fekvő nézet 160 px-es táblája), ott a tábla. Mindkét esetben a teljes szöveg olvasható.
      const long = (await quiz.getAttribute("data-long")) === "true";
      // D-J1a-18: a leghosszabb válaszok álló nézetben szélességben, fekvőben magasságban nem férnek a táblába → mindhárom
      // nézetben lista mód (a „0 tábla” ág itt elvárt, nem véletlen).
      expect(long, "a leghosszabb válaszok → lista mód").toBe(true);
      if (long) {
        await expect(page.locator('[data-testid="ts-question"]')).toHaveAttribute("data-mode", "buttons");
        await expect(gates(page), "lista módban nincs levágott tábla").toHaveCount(0);
      } else await expect(gates(page)).toHaveCount(3);
      const sel = long ? '[data-testid="ts-question"] .play-question-label' : '[data-testid="ts-quiz"] .ts-gate-label';
      const labels = await page.evaluate((s) =>
        Array.from(document.querySelectorAll(s)).map((el) => ({
          text: (el as HTMLElement).innerText,
          clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
          inView: el.getBoundingClientRect().bottom <= innerHeight + 1 && el.getBoundingClientRect().top >= 0,
        })),
        sel,
      );
      expect(labels.length).toBe(3);
      for (const l of labels) {
        expect(l.text.length, "a leghosszabb válaszok egyike").toBeGreaterThan(20);
        expect(l.clipped, `levágott: ${l.text}`).toBe(false);
        expect(l.inView, `a képen kívül: ${l.text}`).toBe(true);
      }
      await shot(page, `tsunami-${viewport.width}x${viewport.height}-long.jpg`);
      // A gomb érintése a táblával azonos: azonnali válasz.
      await page.locator(long ? '[data-testid="ts-question"] [data-correct="true"]' : '[data-testid="ts-quiz"] .ts-gate[data-correct="true"]').first().tap();
      await expect.poll(async () => (await probe(page)).questionsAnswered).toBe(1);
    });
  });
}

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
      // D-J1a-18 (orkesztrátori döntés): a táblás eset KÉNYSZERÍTETT egysoros válaszokkal — a véletlen kérdésforrás
      // (kétsoros felirat fekvőben, hosszú válasz → lista mód) nem dönthet a mérésről; a küszöbök változatlanok. A kétsoros
      // és a hosszú esetet külön teszt méri. (A „play” képernyőkép a teszt végén készül: az előtte töltött 5 mp alatt nyíló és
      // lejáró természetes kérdés ismétlésként megelőzte volna a kényszerített kérdést.)
      await openQuestion(page, { question: true, answers: SHORT_ANSWERS });
      await expect(gates(page)).toHaveCount(3, { timeout: 10_000 });
      await expect(page.getByTestId("ts-quiz")).toHaveAttribute("data-long", "false");
      // Az élesítés (450 ms) és a belépő animáció (180 ms) után EGY lap-hívásban mérünk, és utána azonnal választunk: a CI
      // szoftveres WebGL-jén minden hívás képkockákat vár, így a külön mérések alatt a futó a kapuhoz érhetett (a kérdés
      // lezárult, mielőtt a teszt a rossz táblát megérintette volna). A küszöbök változatlanok.
      await page.waitForTimeout(600);
      const gatesAboveRunnerScript = () => {
        const api = (window as unknown as { __websuliGame: { probe: () => { runnerTopY: number } } }).__websuliGame;
        const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
        const head = stage.top + api.probe().runnerTopY * stage.height;
        return Array.from(document.querySelectorAll('[data-testid="ts-quiz"] .ts-gate')).map((el) => el.getBoundingClientRect().bottom - head);
      };
      const boxes = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="ts-quiz"] .play-question-card')!.getBoundingClientRect();
        // A vezérlők (tárcsa, Ugrás gomb) dobozai — a tábla egyikkel sem fedhet át.
        const rect = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
        };
        const controls = Array.from(document.querySelectorAll('[data-testid="tsunami-touch-controls"] > *')).map(rect);
        const g = Array.from(document.querySelectorAll('[data-testid="ts-quiz"] .ts-gate')).map(rect);
        const api = (window as unknown as { __websuliGame: { probe: () => { runnerTopY: number } } }).__websuliGame;
        const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
        const head = stage.top + api.probe().runnerTopY * stage.height;
        return {
          card: { b: card.bottom },
          controls,
          g,
          vw: innerWidth,
          vh: innerHeight,
          overflowX: document.documentElement.scrollWidth - innerWidth,
          above: g.map((b) => b.b - head),
          open: document.querySelector('[data-testid="ts-quiz"]')?.getAttribute("data-state") ?? null,
        };
      });
      await page.locator('[data-testid="ts-quiz"] .ts-gate[data-correct="false"]').first().click();
      expect(boxes.open, "a mérés nyitott kérdésnél történt").toBe("open");
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
      expect(boxes.overflowX).toBeLessThanOrEqual(1);
      // D-J1a-15 (review #483, K4): a táblák nem lógnak a futó feje alá — nyitott kérdésnél és a megoldás-kijelzés alatt sem.
      expect(boxes.above.length).toBe(3);
      for (const d of boxes.above) expect(d, "nyitott kérdés: a tábla a futó feje fölött").toBeLessThanOrEqual(1);
      await expect(page.locator('[data-testid="ts-quiz"] .ts-gate[data-state="wrong"]')).toHaveCount(1);
      await page.waitForTimeout(400);
      const aboveReveal = await page.evaluate(gatesAboveRunnerScript);
      expect(aboveReveal.length).toBe(3);
      for (const d of aboveReveal) expect(d, "megoldás-kijelzés: a tábla a futó feje fölött").toBeLessThanOrEqual(1);
      if (viewport.width !== 390) await shot(page, `tsunami-${viewport.width}x${viewport.height}-wrong.jpg`);
      if (process.env.TS_SHOT_DIR) {
        await expect(page.getByTestId("ts-quiz")).toHaveCount(0, { timeout: 15_000 });
        await page.waitForTimeout(1_000);
        await shot(page, `tsunami-${viewport.width}x${viewport.height}-play.jpg`);
      }
    });
  });
}

test.describe("844x390: kétsoros válaszok fekvőben — a táblák magasságban nem férnek, lista mód (D-J1a-18)", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("kényszerített kétsoros válaszok: lista mód, a teljes válaszok a sávban, a futó feje szabad; egysorosnál táblák", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=11&difficulty=easy");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
    const quiz = page.getByTestId("ts-quiz");
    await openQuestion(page, { question: true, answers: TWO_LINE_ANSWERS });
    await expect(quiz).toBeAttached({ timeout: 10_000 });
    await page.waitForTimeout(800);
    await expect(quiz, "kétsoros felirat fekvőben → lista mód").toHaveAttribute("data-long", "true");
    await expect(page.locator('[data-testid="ts-question"]')).toHaveAttribute("data-mode", "buttons");
    await expect(gates(page), "lista módban nincs tábla, ami a futóra lóghatna").toHaveCount(0);
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="ts-question"] .play-question-label')).map((el) => ({
        text: (el as HTMLElement).innerText,
        clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
        inView: el.getBoundingClientRect().bottom <= innerHeight + 1 && el.getBoundingClientRect().top >= 0,
      })),
    );
    expect(labels.map((l) => l.text).sort()).toEqual([...TWO_LINE_ANSWERS].sort());
    for (const l of labels) {
      expect(l.clipped, `levágott: ${l.text}`).toBe(false);
      expect(l.inView, `a képen kívül: ${l.text}`).toBe(true);
    }
    // A futó feje szabad: a fej és a mellkas pontján (középső sáv, bemenet nélkül) nincs kérdés-felület.
    const covered = await page.evaluate(() => {
      const api = (window as unknown as { __websuliGame: { probe: () => { runnerTopY: number } } }).__websuliGame;
      const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
      const x = stage.left + stage.width / 2;
      const head = stage.top + api.probe().runnerTopY * stage.height;
      return [head + 4, head + 30].map((y) => document.elementsFromPoint(x, y).some((el) => !!el.closest('[data-testid="ts-quiz"], [data-testid="ts-question"]')));
    });
    expect(covered, "a kérdés-felület nem takarja a futó fejét / mellkasát").toEqual([false, false]);
    await shot(page, "tsunami-844x390-two-line.jpg");
    await page.locator('[data-testid="ts-question"] [data-correct="true"]').first().tap();
    await expect.poll(async () => (await probe(page)).questionsAnswered).toBe(1);
    // Ugyanebben a nézetben egysoros válaszokkal táblák (a döntés kérdésenként újraszámolódik).
    await expect(quiz).toHaveCount(0, { timeout: 15_000 });
    await openQuestion(page, { question: true, answers: SHORT_ANSWERS });
    await expect(gates(page)).toHaveCount(3, { timeout: 10_000 });
    await expect(quiz).toHaveAttribute("data-long", "false");
  });
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}x${viewport.height}: álló lista mód — nem takarja a futót, nem fedi a tárcsát (újra-review #483 ÚK3)`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("leghosszabb kérdés + leghosszabb válaszok: a lista és a tárcsa nem metszi egymást, a futó szabad, nincs vízszintes görgetés, gomb ≥ 44 px, a tárcsa ívén koppintás nem válasz", async ({ page }) => {
      await page.goto("/games/tsunami-english?seed=29&difficulty=easy");
      await page.getByTestId("button-tsunami-start").tap();
      await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
      await openQuestion(page, { question: true, longAnswers: true, longPrompt: true });
      const quiz = page.getByTestId("ts-quiz");
      await expect(quiz).toHaveAttribute("data-long", "true", { timeout: 10_000 });
      await expect(quiz).toHaveAttribute("data-armed", "true", { timeout: 5_000 });
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const r = (el: Element) => {
          const b = el.getBoundingClientRect();
          return { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height };
        };
        const options = Array.from(document.querySelectorAll('[data-testid="ts-question"] .play-question-option')).map(r);
        const joy = r(document.querySelector('[data-testid="virtual-joystick"]')!);
        const api = (window as unknown as { __websuliGame: { probe: () => { runnerTopY: number } } }).__websuliGame;
        const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
        const x = stage.left + stage.width / 2;
        const head = stage.top + api.probe().runnerTopY * stage.height;
        const covered = [head + 4, head + 30].map((y) => document.elementsFromPoint(x, y).some((el) => !!el.closest('[data-testid="ts-quiz"], [data-testid="ts-question"]')));
        return { options, joy, covered, overflowX: document.documentElement.scrollWidth - innerWidth, state: document.querySelector('[data-testid="ts-quiz"]')?.getAttribute("data-state") };
      });
      expect(m.state, "a mérés nyitott kérdésnél").toBe("open");
      expect(m.options.length).toBe(3);
      for (const o of m.options) {
        const hit = Math.min(o.r, m.joy.r) - Math.max(o.l, m.joy.l) > 0 && Math.min(o.b, m.joy.b) - Math.max(o.t, m.joy.t) > 0;
        expect(hit, `(a) a válaszgomb (${Math.round(o.t)}–${Math.round(o.b)}) és a tárcsa (${Math.round(m.joy.t)}–${Math.round(m.joy.b)}) téglalapja nem metszi egymást`).toBe(false);
        expect(o.h, "(d) a válaszgomb mért magassága ≥ 44 px").toBeGreaterThanOrEqual(44);
      }
      expect(m.covered, "(b) a futó feje / mellkasa nincs takarva").toEqual([false, false]);
      expect(m.overflowX, "(c) nincs vízszintes görgetés lista módban").toBeLessThanOrEqual(1);
      await shot(page, `tsunami-${viewport.width}x${viewport.height}-long.jpg`);
      // (e) Koppintás a tárcsa felső ívén kérdés közben nem ad választ.
      await page.touchscreen.tap(m.joy.l + (m.joy.r - m.joy.l) / 2, m.joy.t + 6);
      await page.waitForTimeout(300);
      expect((await probe(page)).questionsAnswered, "(e) a tárcsa ívén koppintás nem válasz").toBe(0);
      await expect(quiz).toHaveAttribute("data-state", "open");
    });

    test("2–3 soros, szélességben beférő válaszok álló nézetben: táblák, levágás nélkül, a kártya alatt és a futó feje fölött (D-J1a-18)", async ({ page }) => {
      await page.goto("/games/tsunami-english?seed=11&difficulty=easy");
      await page.getByTestId("button-tsunami-start").tap();
      await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
      await openQuestion(page, { question: true, answers: PORTRAIT_MULTI_LINE_ANSWERS });
      await expect(gates(page)).toHaveCount(3, { timeout: 10_000 });
      await expect(page.getByTestId("ts-quiz")).toHaveAttribute("data-long", "false");
      await page.waitForTimeout(600);
      await expect(page.getByTestId("ts-quiz"), "a valódi kirajzolásban sincs levágás (nem váltott lista módra)").toHaveAttribute("data-long", "false");
      const m = await page.evaluate(() => {
        const api = (window as unknown as { __websuliGame: { probe: () => { runnerTopY: number } } }).__websuliGame;
        const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
        const head = stage.top + api.probe().runnerTopY * stage.height;
        const card = document.querySelector('[data-testid="ts-quiz"] .play-question-card')!.getBoundingClientRect();
        return Array.from(document.querySelectorAll('[data-testid="ts-quiz"] .ts-gate')).map((el) => {
          const b = el.getBoundingClientRect();
          const label = el.querySelector(".ts-gate-label")!;
          return {
            text: (label as HTMLElement).innerText,
            lines: Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight)),
            // Mérve (a bank leghosszabb válaszai és előtagjaik, 3 nézet): levágás nélkül a túlcsordulás 1–2 px (tört
            // sormagasság), egy levágott sor ~15–16 px — a > 4 px küszöb a kettő között van.
            clipped: label.scrollHeight - label.clientHeight > 4,
            belowCard: b.top - card.bottom,
            aboveHead: b.bottom - head,
          };
        });
      });
      expect(m.length).toBe(3);
      expect(Math.max(...m.map((g) => g.lines)), "legalább egy felirat két- / háromsoros").toBeGreaterThanOrEqual(2);
      for (const g of m) {
        expect(g.clipped, `levágott: ${g.text}`).toBe(false);
        expect(g.belowCard, "a tábla a kérdés-kártya alatt").toBeGreaterThanOrEqual(0);
        expect(g.aboveHead, "a tábla a futó feje fölött").toBeLessThanOrEqual(1);
      }
    });
  });
}

/*
 * D-J1a-19: az élesítés lap-szinten, léptetett órával (Playwright-óra). Minden lépés EGY képkocka 500 ms-mal (2 fps; a
 * meghajtó a képkocka-plafon miatt 250 ms-ot lép). Elvárás: a táblák látható élessége (`data-armed`) és a meghajtó
 * elfogadása (`probe().armed`) minden lépésben egyezik — a látható-éles, de el nem fogadott állapot ideje 0. A régi, valós
 * idős (450 ms-os `setTimeout`) élesítéssel az első lépés után a tábla éles, a meghajtó még nem fogad el → bukik.
 */
test.describe("390x844: élesítés = elfogadás léptetett órával, 2 fps-es képkockákkal (D-J1a-19)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("minden lépésben: a tábla akkor és csak akkor éles, amikor a meghajtó elfogadja az érintést", async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await page.goto("/games/tsunami-english?seed=11&difficulty=easy");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: { forceState?: unknown } }).__websuliGame?.forceState === "function");
    // Az óra innentől csak léptetésre halad.
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    await openQuestion(page, { question: true, answers: SHORT_ANSWERS });
    const seen: string[] = [];
    let armedSeen = false;
    for (let step = 0; step < 12 && !armedSeen; step++) {
      await page.clock.fastForward(500);
      await page.waitForTimeout(150); // a React-render (MessageChannel, nem a hamis óra) lefusson
      const s = await page.evaluate(() => {
        const api = (window as unknown as { __websuliGame: { probe: () => { armed: number } } }).__websuliGame;
        const quiz = document.querySelector('[data-testid="ts-quiz"]');
        return { dom: quiz ? quiz.getAttribute("data-armed") : null, armed: api.probe().armed };
      });
      seen.push(`${step}: dom=${s.dom} meghajtó=${s.armed}`);
      if (s.dom === null) continue;
      expect(s.dom === "true", `a látható élesség és az elfogadás egyezik (${seen.join(" | ")})`).toBe(s.armed === 1);
      if (s.armed === 1) armedSeen = true;
    }
    expect(armedSeen, `a táblák élessé váltak (${seen.join(" | ")})`).toBe(true);
  });
});

const RISKY_BANK_ANSWERS = [
  // A reviewer szigorú (vastagbetűs) modellje szerint 4 sorra törhető, a becslő szerint beférő valódi banki válaszok (7010-ből 12).
  "A laptopom folyton túlmelegszik.",
  "Jedlik Ányos és Puskás Tivadar",
  "más állatokat zsákmányolnak",
  "az oldalfelező merőlegesek",
  "Lengyelország megtámadása",
  "Egy gondolat bánt engemet",
  "folyékonyból légneművé",
  "a nagynénje szidta meg",
  "a Jelenések könyvéből",
  "Most megyek Londonba.",
  "Nem néznek egymásra.",
  "egy mérés eredménye",
];

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`${viewport.width}x${viewport.height}: a 12 kockázatos valódi banki válasz — levágott tábla soha (D-J1a-19)`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("mért túlcsordulás tételenként; a lapon egyik sem jelenik meg levágott táblán (lista mód elfogadható)", async ({ page }) => {
      test.setTimeout(150_000);
      await page.goto("/games/tsunami-english?seed=11&difficulty=easy");
      await page.getByTestId("button-tsunami-start").tap();
      await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
      const quiz = page.getByTestId("ts-quiz");
      for (let i = 0; i < RISKY_BANK_ANSWERS.length; i += 3) {
        const group = RISKY_BANK_ANSWERS.slice(i, i + 3);
        await expect(quiz).toHaveCount(0, { timeout: 20_000 });
        await openQuestion(page, { question: true, answers: group });
        await expect(quiz).toHaveAttribute("data-armed", "true", { timeout: 15_000 });
        const m = await page.evaluate(() => ({
          long: document.querySelector('[data-testid="ts-quiz"]')?.getAttribute("data-long"),
          font: `${getComputedStyle(document.querySelector('[data-testid="ts-quiz"] .ts-gate-label') ?? document.body).fontFamily}; betöltve: ${document.fonts.check('900 16px "Source Sans 3"') ? "Source Sans 3" : "nem — tartalék betű"}`,
          gates: Array.from(document.querySelectorAll('[data-testid="ts-quiz"] .ts-gate-label')).map((el) => ({
            text: el.textContent ?? "",
            over: el.scrollHeight - el.clientHeight,
          })),
        }));
        for (const g of m.gates) console.log(`RISKY12 ${viewport.width}x${viewport.height} over=${g.over}px "${g.text}" (betű: ${m.font})`);
        if (m.long === "true") console.log(`RISKY12 ${viewport.width}x${viewport.height} lista mód: ${group.join(" | ")}`);
        // Mérve: levágás nélkül 1–2 px, egy levágott sor ~15–16 px.
        for (const g of m.gates) expect(g.over, `levágott tábla: „${g.text}” (${g.over} px)`).toBeLessThanOrEqual(4);
        // Gyors zárás: a jó válasz (tábla vagy lista-gomb).
        await page.locator('[data-testid="ts-quiz"] [data-correct="true"], [data-testid="ts-question"] [data-correct="true"]').first().tap();
      }
    });
  });
}

/*
 * D-J1a-19: a futásidejű háló önállóan — kényszerített nagyobb betűméret (más betűkészlet / nagyítás szimulációja): a becslő
 * szerint beférő felirat a valódi kirajzolásban levágódna → a háló lista módra vált. A háló nélkül a tábla levágva maradna.
 */
test.describe("390x844: a futásidejű háló a becslőtől függetlenül megfogja a levágást (D-J1a-19)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("nagyított tábla-felirat: nincs levágott tábla, a kérdés lista módban, teljes szöveggel", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=11&difficulty=easy");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
    // 32 px: a 94 px-es belső szélességen a több szavas felirat ≥ 4 sorra törik (24 px-en még 3 sorba fért — mérve).
    await page.addStyleTag({ content: ".ts-gate-label, .ts-gate[data-long] .ts-gate-label { font-size: 32px !important; }" });
    await openQuestion(page, { question: true, answers: PORTRAIT_MULTI_LINE_ANSWERS });
    const quiz = page.getByTestId("ts-quiz");
    await expect(quiz).toBeAttached({ timeout: 10_000 });
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => ({
      long: document.querySelector('[data-testid="ts-quiz"]')?.getAttribute("data-long"),
      clipped: Array.from(document.querySelectorAll('[data-testid="ts-quiz"] .ts-gate-label')).filter((el) => el.scrollHeight - el.clientHeight > 4).map((el) => el.textContent),
      list: Array.from(document.querySelectorAll('[data-testid="ts-question"] .play-question-label')).map((el) => el.textContent),
    }));
    expect(m.clipped, "nincs levágott tábla-felirat").toEqual([]);
    expect(m.long, "a levágódó felirat lista módot ad").toBe("true");
    expect(m.list.slice().sort()).toEqual([...PORTRAIT_MULTI_LINE_ANSWERS].sort());
  });
});

test.describe("360x640: ékezetes nagybetű és alsó szár a táblán (D-J1a-19, 2 px ráhagyás)", () => {
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });

  test("Á / Ő / Ű és g / j / p / y: a felirat dobozán 2 px ráhagyás (kép)", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=11&difficulty=easy");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
    await openQuestion(page, { question: true, answers: ["Ágyú Őr", "Űr gyógy", "jég pipa"] });
    await expect(gates(page)).toHaveCount(3, { timeout: 10_000 });
    await expect(page.getByTestId("ts-quiz")).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
    const pad = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="ts-quiz"] .ts-gate-label')).map((el) => `${getComputedStyle(el).paddingTop}/${getComputedStyle(el).paddingBottom}`),
    );
    for (const p of pad) expect(p).toBe("2px/2px");
    await shot(page, "tsunami-360x640-accents.jpg");
  });
});
