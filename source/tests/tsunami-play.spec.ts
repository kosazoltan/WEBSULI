import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type CDPSession, type Page } from "@playwright/test";

/**
 * Szökőár szökés — az emelkedő víz valódi érintéssel (docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md, végrehajtás 6.).
 *
 * SPEC-VÁLTOZÁS 2026-11-18 (tulajdonosi döntés D1: „Vissza a régi, emelkedő vízhez”; D2: autó nincs; D4: „Igen, látványosan”):
 * a háromsávos futás, a kapu-táblák, az ugrás és a húzás megszűnt. A régi esetek mércéje megmarad, a mechanika helyett a
 * vízre mérve (a terv 0.3 táblája tételesen):
 *  - kampó nélküli út (indítás → jó / rossz válasz → „Miért?” → a víz utolér → Gyakorold még → új futam);
 *  - szünet → Újrakezdés: új menet fut, kérdés érkezik;
 *  - két ujj egyszerre: a tárcsa mozgat, miközben a Sprint gomb gyorsít — mindkét hatás mérve;
 *  - a kérdés alatt a világ lassítva fut (≥ 0,35×), hibás válasz után teljes sebesség, szünetben áll;
 *  - a megállítási okok nem oldják fel egymást;
 *  - billentyűzet: ← / → mozgat, Shift gyorsít;
 *  - tétlen játékos: „Lejárt az idő”, a nyilvántartásban nincs válasz, és a víz megugrik;
 *  - elrendezés 3 nézetben: a leghosszabb válaszok levágás nélkül, ≥ 48 px, a vezérlőt és a figurát nem takarják;
 *  - élesítés = elfogadás léptetett órával;
 *  - D4: jó válasz → a víz 0,5 s-on belül apad, rossz → nő; a menedék mindig a képen; autó / kapu / sáv nincs.
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

type Probe = {
  simTime: number;
  questionOpen: number;
  questionsAnswered: number;
  questionsCorrect: number;
  reveal: number;
  water: number;
  waterLose: number;
  x: number;
  zoneX: number;
  correct: number;
  target: number;
  figureX: number;
  figureY: number;
  quizPlace: "top" | "bottom";
  sprint: number;
  armed: number;
  phase: string;
};
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => Probe } }).__websuliGame.probe());
const options = (page: Page) => page.locator('[data-testid="ts-quiz"] .play-question-option');
const num = async (page: Page, testId: string) => Number((await page.getByTestId(testId).innerText()).replace(/[^\d]/g, ""));

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.TS_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70, scale: "css" });
}

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", points: Array<{ x: number; y: number; id: number }>) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : points });
}

/** Koppintás egy elem közepére valódi érintéssel. */
async function tap(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible({ timeout: 25_000 });
  const box = await el.boundingBox();
  expect(box, `${selector} doboza`).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function openQuestion(page: Page, patch: Record<string, unknown> = { question: true }): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: { forceState?: unknown } }).__websuliGame?.forceState === "function");
  await page.evaluate((p) => (window as unknown as { __websuliGame: { forceState: (p: Record<string, unknown>) => void } }).__websuliGame.forceState(p), patch);
}

const SHORT_ANSWERS = ["cat", "dog", "sun", "map"];

const QUIZ_SEL = '[data-testid="ts-quiz"], [data-testid="ts-question"]';
const CONTROLS_SEL = '[data-testid="tsunami-touch-controls"] > *';
const HUD_SEL = "[data-game-hud]";

/**
 * Vak ellenőr B1 (2026-11-19): a figura TELJES teste — a jelenet által ténylegesen kirajzolt képernyő-doboz (fej teteje, deszka
 * alja, karok), 5 oszlop × 7 sor rácson, `elementsFromPoint`-tal. Visszaad: a doboz (játéktér-relatív px) és a takart pontok
 * („sor,oszlop:mi takarja”). A régi két középvonali pont (8 és 36 px) a fejet sosem mérte.
 */
async function bodyCover(page: Page, selector: string): Promise<{ box: { left: number; top: number; right: number; bottom: number } | null; hits: string[] }> {
  return page.evaluate((sel) => {
    const pr = (window as unknown as { __websuliGame: { probe: () => { figureBox: { left: number; top: number; right: number; bottom: number } | null } } }).__websuliGame.probe();
    const box = pr.figureBox;
    if (!box) return { box: null, hits: [] };
    const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
    const hits: string[] = [];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        const x = stage.left + box.left + 3 + ((box.right - box.left - 6) * c) / 4;
        const y = stage.top + box.top + 3 + ((box.bottom - box.top - 6) * r) / 6;
        const hit = document.elementsFromPoint(x, y).find((el) => !!el.closest(sel));
        if (hit) hits.push(`${r},${c}:${(hit.closest(sel) as HTMLElement).dataset.testid ?? hit.className.toString().slice(0, 24)}`);
      }
    }
    return { box, hits };
  }, selector);
}

/**
 * B2 (független ellenőr): a menedék VALÓDI láthatósága — takarás-mérés `elementsFromPoint`-tal. Álló nézetben a 3D-ház pontja
 * (a felső deszka fölött, `SHELTER_X`; a deszka álló nézetben 24 %, fekvőben 30 %) és a címke; fekvőben a ház a közös felső sáv mögé esik, ott a címke (dokumentált
 * tartalék: a felső sáv „Még N jó válasz a menedékig” felirata).
 */
async function shelterCovered(page: Page): Promise<{ house: string | null; tag: string | null; portrait: boolean }> {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
    const portrait = innerHeight > innerWidth;
    const coverOf = (x: number, y: number, own?: Element | null) => {
      const top = document.elementsFromPoint(x, y)[0];
      if (!top || top.tagName === "CANVAS" || (own && own.contains(top))) return null;
      const q = top.closest('[data-testid="ts-quiz"], [data-testid="ts-question"], [data-game-hud], .game-hud, header');
      return q ? (q.getAttribute("data-testid") ?? q.className.toString().slice(0, 40)) : null;
    };
    const tag = document.querySelector('[data-testid="ts-shelter"]')!;
    const tr = tag.getBoundingClientRect();
    return {
      // A felső deszka (álló nézetben a kép 24 %-a) fölött 3 %-kal.
      house: portrait ? coverOf(stage.left + 0.84 * stage.width, stage.top + 0.21 * stage.height) : null,
      tag: coverOf(tr.left + tr.width / 2, tr.top + tr.height / 2, tag),
      portrait,
    };
  });
}


test.describe("valódi érintés", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("kampó nélkül: indítás, jó és rossz válasz, „Miért?”, a víz utolér, Gyakorold még, új futam", async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/games/tsunami-english?difficulty=easy");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
    await expect(page.getByTestId("ts-hint")).toBeVisible(); // tanító súgó (egy sor)
    // D2 / D1: autó, kapu, sáv, húzó-réteg nincs; a menedék a képen.
    expect(await page.locator('.ts-gate, [data-testid="tsunami-swipe"]').count(), "nincs kapu-tábla / húzó-réteg").toBe(0);
    expect(await shelterCovered(page), "a menedék nincs takarva").toMatchObject({ house: null, tag: null });
    await shot(page, "tsunami-390x844-play.jpg");

    // 1. kérdés: négy gomb, koppintás nélkül olvasható; a JÓ válasz → zöld, a pont nő, a víz apad (D4).
    await expect(options(page)).toHaveCount(4, { timeout: 30_000 });
    await expect(page.getByTestId("play-question-more"), "a kérdés koppintás nélkül olvasható").toHaveCount(0);
    await shot(page, "tsunami-390x844-question.jpg");
    const score0 = await num(page, "ts-score");
    const wave0 = await num(page, "ts-wave");
    await tap(page, '[data-testid="ts-quiz"] .play-question-option[data-correct="true"]');
    await expect(page.locator('[data-testid="ts-quiz"] .play-question-option[data-correct="true"]')).toHaveAttribute("data-state", "correct");
    await expect.poll(() => num(page, "ts-score"), { timeout: 5_000 }).toBeGreaterThan(score0);
    await expect.poll(() => num(page, "ts-wave"), { timeout: 2_000, message: "a jó válasz után a víz apad" }).toBeLessThan(wave0);
    await expect(page.getByTestId("ts-goal")).toContainText("1/");

    // 2. kérdés: ROSSZ válasz → nincs dialógus, a helyes zölden látszik, „Miért?” → kártya.
    await expect(options(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(options(page)).toHaveCount(4, { timeout: 30_000 });
    await tap(page, '[data-testid="ts-quiz"] .play-question-option[data-correct="false"]');
    await expect(page.locator('[data-testid="ts-quiz"] .play-question-option[data-correct="true"]')).toHaveAttribute("data-state", "correct");
    await expect(page.locator('[data-testid="ts-quiz"] .play-question-option[data-state="wrong"]')).toHaveCount(1);
    expect(await page.locator('[role="dialog"]').count(), "a hibás válasz nem nyit blokkoló kártyát").toBe(0);
    await shot(page, "tsunami-390x844-wrong.jpg");
    await page.getByTestId("play-why").first().tap();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await expect(page.getByTestId("quiz-feedback")).toHaveAttribute("data-outcome", "wrong");
    await expect(page.getByTestId("quiz-feedback-retry")).toHaveCount(0);
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);

    // 3. kérdés: ROSSZ válasz, „Miért?” nélkül → a helyes ≥ 1,8 mp-ig zölden látszik — a LAPON BELÜL, képkockánként (C-65).
    await expect(page.locator('[data-testid="ts-quiz"] .play-question-option[data-state="correct"]')).toHaveCount(0, { timeout: 15_000 });
    await expect(options(page)).toHaveCount(4, { timeout: 30_000 });
    await page.evaluate(() => {
      const w = window as unknown as { __tsReveal?: { start: number | null; end: number | null } };
      w.__tsReveal = { start: null, end: null };
      const tick = () => {
        const on = document.querySelector('[data-testid="ts-quiz"] .play-question-option[data-correct="true"][data-state="correct"]') !== null;
        const r = w.__tsReveal!;
        if (r.start === null && on) r.start = performance.now();
        if (r.start !== null && r.end === null && !on) r.end = performance.now();
        if (r.end === null) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const reveal = () => page.evaluate(() => (window as unknown as { __tsReveal: { start: number | null; end: number | null } }).__tsReveal);
    await tap(page, '[data-testid="ts-quiz"] .play-question-option[data-correct="false"]');
    await expect.poll(async () => (await reveal()).start !== null, { timeout: 5_000 }).toBe(true);
    await expect.poll(async () => (await reveal()).end !== null, { timeout: 20_000 }).toBe(true);
    const r = await reveal();
    expect(r.end! - r.start!, "a megoldás ≥ 1,8 mp-ig látszik").toBeGreaterThanOrEqual(1_800);

    // Innen minden kérdésre rossz válasz: a víz utoléri a figurát (a menet a valódi úton ér véget).
    const over = page.getByTestId("ts-over");
    for (let i = 0; i < 120 && !(await over.isVisible()); i++) {
      const open = await page.evaluate(() => document.querySelector('[data-testid="ts-quiz"]')?.getAttribute("data-state") === "open");
      if (open) {
        const box = await page.locator('[data-testid="ts-quiz"] .play-question-option[data-correct="false"]').first().boundingBox().catch(() => null);
        if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      }
      await page.waitForTimeout(1_500);
    }
    await expect(over).toBeVisible({ timeout: 120_000 });
    await shot(page, "tsunami-390x844-result.jpg");
    await expect(page.getByTestId("result-review")).toBeVisible();
    expect(await page.getByTestId("result-review-item").count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("ts-next-goal")).toBeVisible();
    await page.waitForTimeout(2_000);
    await expect(over, "a menet vége után nincs automatikus újraindítás").toBeVisible();
    await page.getByTestId("button-tsunami-retry").tap();
    // Az új menet elölről: 0 jó válasz, alacsony víz.
    await expect(page.getByTestId("ts-goal")).toContainText("0/", { timeout: 5_000 });
    await expect.poll(() => num(page, "ts-wave"), { timeout: 5_000 }).toBeLessThan(30);
    await expect.poll(async () => (await probe(page)).simTime, { timeout: 10_000, message: "az új menet fut" }).toBeGreaterThan(1_000);
    expect(errors.filter((e) => !/401|Failed to fetch/i.test(e))).toEqual([]);
  });

  test("review #483: szünet → Újrakezdés (érintéssel) után az új menet fut: a víz visszaáll, és kérdés érkezik", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/games/tsunami-english?difficulty=easy");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
    const sim = async () => (await probe(page)).simTime;
    await expect.poll(sim, { timeout: 15_000 }).toBeGreaterThan(4_000);
    const w0 = (await probe(page)).water;
    await page.getByTestId("game-pause").tap();
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    await page.getByTestId("game-restart").tap();
    await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
    await expect.poll(sim, { timeout: 5_000, message: "az újrakezdés új menetet indított" }).toBeLessThan(3_000);
    expect((await probe(page)).water, "a víz visszaállt").toBeLessThan(w0);
    await expect.poll(sim, { timeout: 10_000, message: "az újrakezdett menet fut" }).toBeGreaterThan(3_000);
    await expect(options(page), "az újrakezdett menetben kérdés érkezik").toHaveCount(4, { timeout: 30_000 });
  });

  test("két ujj egyszerre (K.4/15): a tárcsa jobbra mozgat, miközben a Sprint gomb gyorsít — mindkét hatás mérve", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=5");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("virtual-joystick")).toBeVisible();
    await page.waitForTimeout(500);
    const joy = (await page.getByTestId("virtual-joystick").boundingBox())!;
    const sprint = (await page.getByRole("button", { name: "Sprint" }).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const jx = joy.x + joy.width / 2;
    const jy = joy.y + joy.height / 2;
    // A figurát balra visszük (a jobbra mozgásnak legyen helye).
    await touch(cdp, "touchStart", [{ x: jx, y: jy, id: 1 }]);
    await touch(cdp, "touchMove", [{ x: jx - joy.width * 0.45, y: jy, id: 1 }]);
    await page.waitForTimeout(1_200);
    await touch(cdp, "touchEnd", []);
    const p0 = await probe(page);
    await touch(cdp, "touchStart", [{ x: jx, y: jy, id: 1 }]);
    await touch(cdp, "touchMove", [{ x: jx + joy.width * 0.45, y: jy, id: 1 }]);
    await touch(cdp, "touchStart", [{ x: jx + joy.width * 0.45, y: jy, id: 1 }, { x: sprint.x + sprint.width / 2, y: sprint.y + sprint.height / 2, id: 2 }]);
    await page.waitForTimeout(350);
    const p1 = await probe(page);
    await touch(cdp, "touchEnd", []);
    expect(p1.x, "a tárcsa jobbra vitte a figurát").toBeGreaterThan(p0.x + 2);
    expect(p1.sprint, "a második ujj sprintel").toBe(1);
  });
});

test.describe("J1 / J5: a játék a kérdés alatt fut (lassítva, ≥ 0,35×), szünetben áll; hibás válasz után teljes sebesség", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("nyitott kérdésnél a sim-idő / valós idő ≥ 0,35 és < 1; hibás válasz után teljes sebesség, kártya nélkül; szünetben 0", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=9");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    await openQuestion(page, { question: true, answers: SHORT_ANSWERS });
    await expect(options(page)).toHaveCount(4, { timeout: 10_000 });
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
    // Hibás válasz a billentyűzettel (1–4): a kijelzés alatt teljes sebesség, nincs dialógus.
    await expect(page.getByTestId("ts-quiz")).toHaveAttribute("data-armed", "true", { timeout: 5_000 });
    const wrongIdx = await page.locator('[data-testid="ts-quiz"] .play-question-option[data-correct="false"]').first().getAttribute("data-option-index");
    await page.keyboard.press(String(Number(wrongIdx) + 1));
    await expect(page.locator('[data-testid="ts-quiz"] .play-question-option[data-state="wrong"]')).toHaveCount(1);
    const after = await rate(1000);
    expect(after.open).toBe(0);
    expect(after.r, "hibás válasz után teljes sebesség").toBeGreaterThanOrEqual(0.9);
    expect(await page.locator('[role="dialog"]').count(), "nincs blokkoló kártya").toBe(0);
    await page.getByTestId("game-pause").click();
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    expect((await rate(600)).r, "szünetben a szimuláció áll").toBe(0);
    await page.getByTestId("game-restart").click();
    await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
    await expect.poll(async () => (await probe(page)).simTime, { timeout: 5_000, message: "az újrakezdett menet szimulációja fut" }).toBeGreaterThan(500);
    expect((await rate(800)).r, "az újrakezdett menet teljes sebességgel fut").toBeGreaterThan(0.5);
  });

  test("átmeneti kapu 3f: a megállítási okok nem oldják fel egymást („Miért?” + háttérbe tett lap → folytatás után is áll, amíg a kártya nyitva)", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=31");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    await openQuestion(page, { question: true, answers: SHORT_ANSWERS });
    const wrong = page.locator('[data-testid="ts-quiz"] .play-question-option[data-correct="false"]').first();
    await expect(wrong).toBeVisible({ timeout: 10_000 });
    await wrong.click();
    await page.getByTestId("play-why").first().click();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    const sim = async () => (await probe(page)).simTime;
    const s0 = await sim();
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

  test("billentyűzet: ← balra, → jobbra mozgat; Shift sprintel", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=3");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    await page.waitForTimeout(300);
    const x0 = (await probe(page)).x;
    await page.keyboard.down("ArrowLeft");
    await expect.poll(async () => (await probe(page)).x, { message: "← balra mozgat" }).toBeLessThan(x0 - 5);
    await page.keyboard.up("ArrowLeft");
    const x1 = (await probe(page)).x;
    await page.keyboard.down("ArrowRight");
    await page.keyboard.down("Shift");
    await expect.poll(async () => (await probe(page)).sprint, { message: "Shift = sprint" }).toBe(1);
    await expect.poll(async () => (await probe(page)).x, { message: "→ jobbra mozgat" }).toBeGreaterThan(x1 + 5);
    await page.keyboard.up("Shift");
    await page.keyboard.up("ArrowRight");
    await expect.poll(async () => (await probe(page)).sprint).toBe(0);
  });
});

test.describe("tétlen játékos: a lejárt kérdés nem válasz, „Miért?” → data-outcome=timeout, és a víz megugrik (D4)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("bemenet nélkül: „Lejárt az idő”, a nyilvántartásban nincs válasz, a magyarázat timeout, a víz nő", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/games/tsunami-english?seed=23&difficulty=easy");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    await expect(options(page)).toHaveCount(4, { timeout: 30_000 });
    // A lejárat előtti szint (a kérdés alatt a víz lassan emelkedik; a lejárat ugrása ennél sokkal nagyobb).
    let before = (await probe(page)).water;
    for (let i = 0; i < 60 && (await probe(page)).reveal === 0; i++) {
      before = (await probe(page)).water;
      await page.waitForTimeout(200);
    }
    await expect(page.getByTestId("play-question-status")).toContainText("Lejárt az idő", { timeout: 15_000 });
    const p = await probe(page);
    expect(p.questionsAnswered, "a tétlen játékos kérdése nem válasz").toBe(0);
    expect(p.water - before, "a lejárt kérdés után a víz megugrik (D4)").toBeGreaterThanOrEqual(3);
    await page.getByTestId("play-why").first().click();
    await expect(page.getByTestId("quiz-feedback")).toHaveAttribute("data-outcome", "timeout");
  });
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`${viewport.width}x${viewport.height}: a kérdés-sáv — leghosszabb válaszok levágás nélkül, ≥ 48 px, a vezérlőt és a figurát nem takarja`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    // A legrosszabb eset mindhárom nézetben: 70 %-os víz, leghosszabb kérdés + négy leghosszabb válasz (kis képernyőn a kompakt
    // kérdés — koordinátori döntés 2026-11-18, „A”).
    // K2: a köztes sáv (35 / 45 / 50 %) is — ott vált a fenti / lenti hely és a kompakt mód.
    for (const water of [null, 35, 45, 50, 70] as const) {
      test(`elrendezés ${water === null ? "a menet elején (alacsony víz)" : `${water} %-os víznél`}`, async ({ page }) => {
        await page.goto("/games/tsunami-english?seed=29&difficulty=easy");
        await page.getByTestId("button-tsunami-start").tap();
        await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
        if (water !== null) await openQuestion(page, { water });
        await openQuestion(page, { question: true, longAnswers: true, longPrompt: true });
        const quiz = page.getByTestId("ts-quiz");
        await expect(quiz).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
        // Koordinátori spec-pontosítás (2026-11-18): állapotra várunk (`data-layout="settled"`), és KÜLÖN mérjük, hogy a
        // nyugalom a kérdés megjelenésétől ≤ 600 ms alatt beáll; utána a nyitott kérdés alatt végig szabad a figura (3 minta).
        await expect(quiz).toHaveAttribute("data-layout", "settled", { timeout: 3_000 });
        const settleMs = (await probe(page) as unknown as { layoutSettleMs: number | null }).layoutSettleMs;
        expect(settleMs, "az elrendezés a megjelenéstől mért beállási ideje (ms)").not.toBeNull();
        expect(settleMs!, `az elrendezés ≤ 600 ms alatt nyugalomba ér (mért: ${settleMs} ms)`).toBeLessThanOrEqual(600);
        const figureFree = () =>
          page.evaluate(() => {
            const api = (window as unknown as { __websuliGame: { probe: () => { figureX: number; figureY: number } } }).__websuliGame;
            const pr = api.probe();
            const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
            const fx = stage.left + pr.figureX * stage.width;
            const fy = stage.top + pr.figureY * stage.height;
            return [fy - 8, fy - 36].map((y) => document.elementsFromPoint(fx, y).some((el) => !!el.closest('[data-testid="ts-quiz"], [data-testid="ts-question"]')));
          });
        for (let sample = 0; sample < 3; sample++) {
          expect(await figureFree(), `a figura a nyitott kérdés alatt végig szabad (${sample + 1}. minta)`).toEqual([false, false]);
          const body = await bodyCover(page, QUIZ_SEL);
          expect(body.box, "a jelenet visszaírja a figura dobozát").not.toBeNull();
          expect(body.hits, `a figura TELJES teste (fej tetejéig) szabad (${sample + 1}. minta, doboz ${JSON.stringify(body.box)})`).toEqual([]);
          await page.waitForTimeout(300);
        }
        const m = await page.evaluate(() => {
          const r = (el: Element) => {
            const b = el.getBoundingClientRect();
            return { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height, w: b.width };
          };
          const opts = Array.from(document.querySelectorAll('[data-testid="ts-question"] .play-question-option')).map(r);
          const labels = Array.from(document.querySelectorAll('[data-testid="ts-question"] .play-question-label')).map((el) => ({
            text: (el as HTMLElement).innerText,
            clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
            inView: el.getBoundingClientRect().bottom <= innerHeight + 1 && el.getBoundingClientRect().top >= 0,
          }));
          const promptEl = document.querySelector('[data-testid="ts-question"] .play-question-prompt') as HTMLElement | null;
          const prompt = promptEl ? { clipped: promptEl.scrollHeight > promptEl.clientHeight + 1, box: r(promptEl) } : null;
          const controls = Array.from(document.querySelectorAll('[data-testid="tsunami-touch-controls"] > *')).map(r);
          const api = (window as unknown as { __websuliGame: { probe: () => { figureX: number; figureY: number; quizPlace: string } } }).__websuliGame;
          const pr = api.probe();
          const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
          const fx = stage.left + pr.figureX * stage.width;
          const fy = stage.top + pr.figureY * stage.height;
          // A figura a vízfelszínen ül: a felszín és fölötte a test / fej pontja.
          const covered = [fy - 8, fy - 36].map((y) => document.elementsFromPoint(fx, y).some((el) => !!el.closest('[data-testid="ts-quiz"], [data-testid="ts-question"]')));
          return { opts, labels, prompt, controls, covered, place: pr.quizPlace, overflowX: document.documentElement.scrollWidth - innerWidth, vw: innerWidth, state: document.querySelector('[data-testid="ts-quiz"]')?.getAttribute("data-state") };
        });
        expect(m.state, "a mérés nyitott kérdésnél").toBe("open");
        // A hely (fent / lent) a figura szerint, méréssel dől el; a mérce az, hogy a figurát ne takarja (alább).
        expect(["top", "bottom"]).toContain(m.place);
        expect(m.opts.length).toBe(4);
        expect(m.controls.length, "a tárcsa és a Sprint gomb látszik").toBe(2);
        for (const o of m.opts) {
          expect(o.h, "a válaszgomb mért magassága ≥ 48 px").toBeGreaterThanOrEqual(48);
          expect(o.l).toBeGreaterThanOrEqual(0);
          expect(o.r).toBeLessThanOrEqual(m.vw);
          for (const c of m.controls) {
            const hit = Math.min(o.r, c.r) - Math.max(o.l, c.l) > 0 && Math.min(o.b, c.b) - Math.max(o.t, c.t) > 0;
            expect(hit, "a válaszgomb nem takarja a vezérlőt").toBe(false);
          }
        }
        for (const l of m.labels) {
          expect(l.text.length, "a leghosszabb válaszok egyike").toBeGreaterThan(20);
          expect(l.clipped, `levágott: ${l.text}`).toBe(false);
          expect(l.inView, `a képen kívül: ${l.text}`).toBe(true);
        }
        expect(m.covered, "a kérdés-felület nem takarja a figurát").toEqual([false, false]);
        expect(m.prompt, "a kérdés-szöveg látszik").not.toBeNull();
        expect(m.prompt!.clipped, "a kérdés-szöveg nincs levágva").toBe(false);
        for (const o of m.opts) {
          const hit = Math.min(o.r, m.prompt!.box.r) - Math.max(o.l, m.prompt!.box.l) > 0 && Math.min(o.b, m.prompt!.box.b) - Math.max(o.t, m.prompt!.box.t) > 0;
          expect(hit, "a gomb nem fedi a kérdést").toBe(false);
        }
        expect(m.overflowX, "nincs vízszintes görgetés").toBeLessThanOrEqual(1);
        const sh = await shelterCovered(page);
        if (viewport.width === 390) expect(sh.tag, "a menedék-címke nyitott kérdésnél sincs takarva").toBeNull();
        else if (sh.tag !== null) {
          // Koordinátori döntés (2026-11-18, B2): ahol a kérdés-sáv kis képernyőn a címkére esik, a tartalék a közös felső sáv
          // „Még N jó válasz a menedékig” felirata — az ilyenkor is látható (képpel dokumentálva).
          await expect(page.getByRole("progressbar", { name: /menedék/i }), "a felső sáv menedék-felirata").toBeVisible();
          await shot(page, `tsunami-${viewport.width}x${viewport.height}-menedek-tartalek-${water ?? "eleje"}.jpg`);
        }
        if (sh.portrait && water === null) expect(sh.house, "álló nézetben a menedék-ház nyitott (fenti) kérdésnél sincs takarva").toBeNull();
        await shot(page, `tsunami-${viewport.width}x${viewport.height}-${water === null ? "long" : `long-${water}`}.jpg`);
        // A gomb érintése azonnali válasz.
        await page.locator('[data-testid="ts-question"] [data-correct="true"]').first().tap();
        await expect.poll(async () => (await probe(page)).questionsAnswered).toBe(1);
      });
    }
  });
}

/*
 * Csiszoló kör 3. pont (koordinátori kérés 2026-11-18): a figura a nyitott kérdés alatt oldalra mozog — fekvő nézetben a
 * szélső válasz-oszlop alá kerülhetne. A terv 7.3 mércéje itt is: a mozgás után ≤ 600 ms-on belül újra szabad, és szabad marad.
 * A mérés a ténylegesen kirajzolt kép-eltolással számol (a próba `figureY`-ja), képkockánként; a tárcsa helyét nem feltételezi.
 */
for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test.describe(`${viewport.width}x${viewport.height}: a figura a nyitott kérdés alatt oldalra mozog — ≤ 600 ms-on belül újra szabad`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("a két szélre mozgatott figurát a kérdés-sáv nem takarja (képkockánként mérve)", async ({ page }) => {
      await page.goto("/games/tsunami-english?seed=29&difficulty=easy");
      await page.getByTestId("button-tsunami-start").tap();
      await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
      await openQuestion(page, { water: 50 });
      await openQuestion(page, { question: true, longAnswers: true, longPrompt: true });
      const quiz = page.getByTestId("ts-quiz");
      await expect(quiz).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
      await expect(quiz).toHaveAttribute("data-layout", "settled", { timeout: 3_000 });
      const covered = () =>
        page.evaluate(() => {
          const pr = (window as unknown as { __websuliGame: { probe: () => { figureX: number; figureY: number } } }).__websuliGame.probe();
          const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
          const fx = stage.left + pr.figureX * stage.width;
          const fy = stage.top + pr.figureY * stage.height;
          return [fy - 8, fy - 36].map((y) => document.elementsFromPoint(fx, y).some((el) => !!el.closest('[data-testid="ts-quiz"], [data-testid="ts-question"]')));
        });
      for (const x of [8, 50, 92]) {
        // A mozgatás és a mérés egy lépésben, a lapon belül: a figura ettől a pillanattól képkockánként szabad-e.
        const freeAfterMs = await page.evaluate(async (target) => {
          const api = (window as unknown as { __websuliGame: { forceState: (p: Record<string, unknown>) => void; probe: () => { figureX: number; figureY: number } } }).__websuliGame;
          // A teljes test (a jelenet által kirajzolt doboz, 5 × 7 rács) — nem csak a középvonal.
          const isCovered = () => {
            const box = (api.probe() as unknown as { figureBox: { left: number; top: number; right: number; bottom: number } | null }).figureBox;
            if (!box) return true;
            const stage = document.querySelector('[data-testid="tsunami-stage"]')!.getBoundingClientRect();
            for (let r = 0; r < 7; r++) {
              for (let c = 0; c < 5; c++) {
                const x = stage.left + box.left + 3 + ((box.right - box.left - 6) * c) / 4;
                const y = stage.top + box.top + 3 + ((box.bottom - box.top - 6) * r) / 6;
                if (document.elementsFromPoint(x, y).some((el) => !!el.closest('[data-testid="ts-quiz"], [data-testid="ts-question"]'))) return true;
              }
            }
            return false;
          };
          api.forceState({ x: target });
          const t0 = performance.now();
          while (performance.now() - t0 < 3_000) {
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            if (!isCovered()) return Math.round(performance.now() - t0);
          }
          return null;
        }, x);
        expect(freeAfterMs, `x = ${x} %: a figura újra szabad (mért: ${freeAfterMs} ms)`).not.toBeNull();
        expect(freeAfterMs!, `x = ${x} %: ≤ 600 ms-on belül szabad (mért: ${freeAfterMs} ms)`).toBeLessThanOrEqual(600);
        await page.waitForTimeout(450); // az eltolás lefut
        for (let sample = 0; sample < 3; sample++) {
          expect(await covered(), `x = ${x} %: a figura végig szabad (${sample + 1}. minta)`).toEqual([false, false]);
          const body = await bodyCover(page, QUIZ_SEL);
          expect(body.hits, `x = ${x} %: a TELJES test szabad (${sample + 1}. minta, doboz ${JSON.stringify(body.box)})`).toEqual([]);
          await page.waitForTimeout(250);
        }
        await shot(page, `tsunami-${viewport.width}x${viewport.height}-szelen-${x}.jpg`);
      }
      expect(await page.evaluate(() => document.querySelector('[data-testid="ts-quiz"]')?.getAttribute("data-state")), "a mérés végig nyitott kérdésnél").toBe("open");
    });
  });
}

/*
 * Vak ellenőr K4 és KICSI 5 (2026-11-19): a figura teste a vezérlők (tárcsa, Sprint) és a felső sáv alá sem kerülhet —
 * alacsony víznél a két szélen (kérdés nélkül), és magas víznél nyitott kérdéssel. A tárcsa helyét nem feltételezi (a vezérlők
 * tényleges dobozát nézi), így a jobb oldali tárcsával is érvényes.
 */
for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test.describe(`${viewport.width}x${viewport.height}: a figura a vezérlők és a felső sáv alá sem kerül`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("alacsony víznél a két szélen a tárcsa / Sprint nem takarja a figurát", async ({ page }) => {
      await page.goto("/games/tsunami-english?seed=29&difficulty=easy");
      await page.getByTestId("button-tsunami-start").tap();
      await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
      await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: { forceState?: unknown } }).__websuliGame?.forceState === "function");
      for (const x of [8, 92]) {
        await page.evaluate((v) => {
          const api = (window as unknown as { __websuliGame: { forceState: (p: Record<string, unknown>) => void } }).__websuliGame;
          api.forceState({ water: 12 });
          api.forceState({ x: v });
        }, x);
        await page.waitForTimeout(700); // ≤ 600 ms-os beállás + egy képkocka
        const body = await bodyCover(page, CONTROLS_SEL);
        expect(body.box, "a jelenet visszaírja a figura dobozát").not.toBeNull();
        expect(body.hits, `x = ${x} %: a figura teste nincs a vezérlők alatt (doboz ${JSON.stringify(body.box)})`).toEqual([]);
      }
    });

    test("magas víznél nyitott kérdéssel a felső sáv és a kérdés nem lóg a figura fejébe", async ({ page }) => {
      await page.goto("/games/tsunami-english?seed=29&difficulty=easy");
      await page.getByTestId("button-tsunami-start").tap();
      await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
      await openQuestion(page, { water: 85 });
      await openQuestion(page, { question: true, longAnswers: true, longPrompt: true });
      const quiz = page.getByTestId("ts-quiz");
      await expect(quiz).toHaveAttribute("data-layout", "settled", { timeout: 3_000 });
      await page.waitForTimeout(500);
      for (const sel of [HUD_SEL, QUIZ_SEL]) {
        const body = await bodyCover(page, sel);
        expect(body.hits, `${sel}: a figura teste szabad (doboz ${JSON.stringify(body.box)})`).toEqual([]);
      }
    });
  });
}

/*
 * Élesítés lap-szinten, léptetett órával (Playwright-óra). Minden lépés EGY képkocka 500 ms-mal. Elvárás: a válaszgombok
 * látható élessége (`data-armed`) és a meghajtó elfogadása (`probe().armed`) minden lépésben egyezik.
 */
test.describe("390x844: élesítés = elfogadás léptetett órával, 2 fps-es képkockákkal", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("minden lépésben: a gomb akkor és csak akkor éles, amikor a meghajtó elfogadja az érintést", async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await page.goto("/games/tsunami-english?seed=11&difficulty=easy");
    await page.getByTestId("button-tsunami-start").tap();
    await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: { forceState?: unknown } }).__websuliGame?.forceState === "function");
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    await openQuestion(page, { question: true, answers: SHORT_ANSWERS });
    const seen: string[] = [];
    let armedSeen = false;
    for (let step = 0; step < 12 && !armedSeen; step++) {
      await page.clock.fastForward(500);
      await page.waitForTimeout(150);
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
    expect(armedSeen, `a gombok élessé váltak (${seen.join(" | ")})`).toBe(true);
  });
});

test.describe("390x844: D4 — a víz látványosan reagál", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("jó válasz → a víz azonnal apad (a HUD 0,5 s-on belül mutatja), rossz → nő", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=13&difficulty=normal");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    await openQuestion(page, { water: 50 });
    await openQuestion(page, { question: true, answers: SHORT_ANSWERS });
    await expect(page.getByTestId("ts-quiz")).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
    const w0 = (await probe(page)).water;
    const hud0 = await num(page, "ts-wave");
    await page.locator('[data-testid="ts-quiz"] .play-question-option[data-correct="true"]').click();
    const w1 = (await probe(page)).water;
    expect(w0 - w1, "a jó válasz a vizet érdemben visszanyomja").toBeGreaterThanOrEqual(15);
    await expect.poll(() => num(page, "ts-wave"), { timeout: 500 }).toBeLessThan(hud0);
    await expect(page.getByTestId("ts-quiz")).toHaveCount(0, { timeout: 15_000 });
    await openQuestion(page, { question: true, answers: SHORT_ANSWERS });
    await expect(page.getByTestId("ts-quiz")).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
    const w2 = (await probe(page)).water;
    await page.locator('[data-testid="ts-quiz"] .play-question-option[data-correct="false"]').first().click();
    expect((await probe(page)).water - w2, "a rossz válasz a vizet megemeli").toBeGreaterThanOrEqual(4);
  });
});

/* B1 (független ellenőr): a győzelmi jelenet LÁTHATÓAN lefut (a figura beér, a víz megtörik), és csak utána nyílik a kártya. */
test.describe("390x844: győzelem — előbb a jelenet, utána az eredménykártya", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a mag győzelme után a jelenet győzelmi állapotban van, a kártya még nincs; ≥ 1,2 mp múlva nyílik", async ({ page }) => {
    await page.goto("/games/tsunami-english?seed=5&difficulty=easy");
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("tsunami-key-hint")).toBeVisible();
    await openQuestion(page, { coreWin: true });
    const t0 = Date.now();
    await expect.poll(async () => (await probe(page) as unknown as { scenePhase: string }).scenePhase, { timeout: 2_000 }).toBe("won");
    await expect(page.getByTestId("ts-won"), "a kártya a jelenet alatt még nem nyílt meg").toHaveCount(0);
    await page.waitForTimeout(700);
    await shot(page, "tsunami-390x844-gyozelem-jelenet.jpg");
    expect(await page.getByTestId("ts-won").count(), "0,7 mp-nél még a jelenet látszik").toBe(0);
    await expect(page.getByTestId("ts-won")).toBeVisible({ timeout: 5_000 });
    expect(Date.now() - t0, "a kártya a jelenet után nyílt").toBeGreaterThanOrEqual(1_200);
  });
});

/* K5: „a 12 kockázatos valódi banki válasz” (a régi kapu-táblás eset helyett a kérdés-sáv gombjain): levágás soha. */
const RISKY_BANK_ANSWERS = [
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
  test.describe(`${viewport.width}x${viewport.height}: a 12 kockázatos valódi banki válasz — levágott gomb soha`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("a kérdés-sáv gombjain egyik válasz sincs levágva", async ({ page }) => {
      test.setTimeout(150_000);
      await page.goto("/games/tsunami-english?seed=11&difficulty=easy");
      await page.getByTestId("button-tsunami-start").tap();
      await expect(page.getByTestId("tsunami-touch-controls")).toBeVisible();
      const quiz = page.getByTestId("ts-quiz");
      for (let i = 0; i < RISKY_BANK_ANSWERS.length; i += 4) {
        const group = RISKY_BANK_ANSWERS.slice(i, i + 4);
        await expect(quiz).toHaveCount(0, { timeout: 30_000 });
        await openQuestion(page, { question: true, answers: group });
        await expect(quiz).toHaveAttribute("data-armed", "true", { timeout: 15_000 });
        const m = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-testid="ts-question"] .play-question-label')).map((el) => ({
            text: el.textContent ?? "",
            clipped: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
          })),
        );
        expect(m.map((x) => x.text).sort()).toEqual([...group].sort());
        for (const x of m) expect(x.clipped, `levágott: „${x.text}”`).toBe(false);
        await page.locator('[data-testid="ts-question"] [data-correct="true"]').first().tap();
      }
    });
  });
}
