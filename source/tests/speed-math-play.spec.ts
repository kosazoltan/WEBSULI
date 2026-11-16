import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * J4a — „Neon védőtorony” valódi érintéssel (végrehajtás J4a 6.; terv J1, J4, J5, J9, J16; K.4/13–18, 23–25).
 *
 * Az ELSŐ eset szándékosan KAMPÓ NÉLKÜLI: se `forceState`, se `probe` — csak a felhasználó útja érintéssel (a Kockavadásznál
 * a kampós teszt elfedte a valódi út hibáját). A számdrónok helyét a DOM adja (a `data-correct` a teszt-buildben a
 * jó / rossz drónt jelöli, a választás érintéssel történik). A fosztogatókat nem lőjük le, és minden további feladatra
 * rosszul felelünk: a tanító szakasz (30 mp) után a torony elesik — így a menet a valódi úton ér véget.
 *
 * Képernyőkép: ha a `SQ_SHOT_DIR` meg van adva, oda (JPEG 70).
 */

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

const drones = (page: Page) => page.locator('[data-testid="sq-answers"] [data-correct]');

/** Koppintás egy elem közepére valódi érintéssel (a lebegő drón dobozán belül). */
async function tapCenter(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible({ timeout: 15_000 });
  // a belépő repülés (~0,5 s) után a drón egy helyben lebeg
  await page.waitForTimeout(650);
  const box = await el.boundingBox();
  expect(box, `${selector} doboza`).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SQ_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70 });
}

test.describe("valódi érintés", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("kampó nélkül: indítás, lövés, jó és rossz drón, „Miért?”, a torony eleste, Gyakorold még, új futam", async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/games/speed-quiz-math");
    await page.getByTestId("sq-start").tap();
    const world = page.getByTestId("sq-world");
    await expect(world).toBeVisible();
    await expect(page.getByTestId("sq-hint")).toBeVisible(); // tanító súgó (egy sor)

    // Lövés: koppintás a játéktérre (a lézer elindul; a találat a fosztogató helyén múlik).
    const wb = (await world.boundingBox())!;
    for (let i = 0; i < 3; i++) await page.touchscreen.tap(wb.x + wb.width * (0.3 + 0.2 * i), wb.y + wb.height * 0.45);

    // 1. feladat: a JÓ drón érintéssel → a pont nő, a drón zöld.
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    await expect(page.getByTestId("play-question-more"), "a feladat koppintás nélkül olvasható").toHaveCount(0);
    await tapCenter(page, '[data-testid="sq-answers"] [data-correct="true"]');
    await expect(page.locator('[data-testid="sq-answers"] [data-correct="true"]')).toHaveAttribute("data-state", "correct");
    await expect.poll(async () => Number((await page.getByTestId("sq-score").innerText()).replace(/\D/g, "")), { timeout: 5_000 }).toBeGreaterThan(0);
    await shot(page, "touch-correct.jpg");

    // 2. feladat: ROSSZ drón → nincs dialógus, a helyes drón zölden látszik, „Miért?” (a kijelzés ALATT) → kártya újrapróba nélkül.
    // A „Miért?” a kijelzés alatt áll egy helyben; a kijelzés végén a kártya „Miért?”-csippé, majd új feladattá alakul, és a
    // gomb elmozdul — a main CI-n (43943054869, 1. és 3. próba) a koppintás erre a váltásra esett, és a gomb mellé ment.
    await expect(drones(page)).toHaveCount(0, { timeout: 5_000 });
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    await tapCenter(page, '[data-testid="sq-answers"] [data-correct="false"]');
    await expect(page.locator('[data-testid="sq-answers"] [data-correct="true"]')).toHaveAttribute("data-state", "correct");
    await expect(page.locator('[data-testid="sq-answers"] [data-state="wrong"]')).toHaveCount(1);
    expect(await page.locator('[role="dialog"]').count(), "a hibás válasz nem nyit blokkoló kártyát").toBe(0);
    await shot(page, "touch-wrong.jpg");
    await page.getByTestId("play-why").tap();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await expect(page.getByTestId("quiz-feedback")).toHaveAttribute("data-outcome", "wrong");
    await expect(page.getByTestId("quiz-feedback-retry")).toHaveCount(0);
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);

    // 3. feladat: ROSSZ drón, „Miért?” nélkül → a helyes drón ≥ 1,8 mp-ig zölden látszik.
    // A kijelzés hossza a LAPON BELÜL, képkockánként mérve (main CI 43943054869, 2. próba; kanban #58): a Playwright-oldali
    // `waitForTimeout(1500)` + a közbeeső parancsok oda-vissza útja a lassú, szoftveres WebGL-es CI-n 2 mp fölé nyúlt, így
    // a mérés a már lezárt kijelzést nézte. A mérce (≥ 1,8 mp) változatlan; ugyanez a minta: game-explanation-pause.spec.ts.
    await expect(page.locator('[data-testid="sq-answers"] [data-state="correct"]')).toHaveCount(0, { timeout: 15_000 });
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    await page.evaluate(() => {
      const w = window as unknown as { __sqReveal?: { start: number | null; end: number | null } };
      w.__sqReveal = { start: null, end: null };
      const tick = () => {
        const on = document.querySelector('[data-testid="sq-answers"] [data-correct="true"][data-state="correct"]') !== null;
        const r = w.__sqReveal!;
        if (r.start === null && on) r.start = performance.now();
        if (r.start !== null && r.end === null && !on) r.end = performance.now();
        if (r.end === null) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const reveal = () => page.evaluate(() => (window as unknown as { __sqReveal: { start: number | null; end: number | null } }).__sqReveal);
    await tapCenter(page, '[data-testid="sq-answers"] [data-correct="false"]');
    await expect.poll(async () => (await reveal()).start !== null, { timeout: 5_000 }).toBe(true);
    await expect(page.locator('[data-testid="sq-answers"] [data-state="wrong"]')).toHaveCount(1);
    await expect.poll(async () => (await reveal()).end !== null, { timeout: 20_000 }).toBe(true);
    const r = await reveal();
    expect(r.end! - r.start!, "a megoldás ≥ 1,8 mp-ig látszik").toBeGreaterThanOrEqual(1_800);

    // Innen minden feladatra rossz válasz, fosztogató-lövés nincs: a tanító szakasz után a torony elesik.
    const over = page.getByTestId("sq-over");
    for (let i = 0; i < 40 && !(await over.isVisible()); i++) {
      const wrong = page.locator('[data-testid="sq-answers"] [data-correct="false"]').first();
      if ((await wrong.count()) > 0 && (await page.locator('[data-testid="sq-answers"] [data-state="correct"]').count()) === 0) {
        const box = await wrong.boundingBox().catch(() => null);
        if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await expect(page.getByTestId("play-question-more")).toHaveCount(0);
      }
      await page.waitForTimeout(2_000);
    }
    await expect(over).toBeVisible({ timeout: 60_000 });
    await shot(page, "touch-result.jpg");
    // Eredmény: a hibázott tételek a helyes válasszal („Gyakorold még”), következő cél, automatikus újraindítás nincs.
    await expect(page.getByTestId("result-review")).toBeVisible();
    expect(await page.getByTestId("result-review-item").count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("sq-next-goal")).toBeVisible();
    await page.waitForTimeout(2_000);
    await expect(over, "a menet vége után nincs automatikus újraindítás").toBeVisible();
    await page.getByRole("button", { name: "Új futam" }).tap();
    await expect(page.getByTestId("sq-score")).toContainText("Pont: 0");
    await expect(world).toBeVisible();
    expect(errors.filter((e) => !/401|Failed to fetch/i.test(e))).toEqual([]);
  });
});

test.describe("J1: a játék a kérdés alatt fut (lassítva, ≥ 0,35×), szünetben áll", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("nyitott kérdésnél a sim-idő / valós idő ≥ 0,35 és < 1; szünetben 0", async ({ page }) => {
    await page.goto("/games/speed-quiz-math?seed=9");
    await page.getByTestId("sq-start").click();
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    const rate = (ms: number) =>
      page.evaluate(async (wait) => {
        const api = (window as unknown as { __websuliGame: { probe: () => { simTime: number; questionOpen: number } } }).__websuliGame;
        const s0 = api.probe().simTime;
        const t0 = performance.now();
        await new Promise((r) => setTimeout(r, wait));
        return { r: (api.probe().simTime - s0) / (performance.now() - t0), open: api.probe().questionOpen };
      }, ms);
    const during = await rate(1000);
    expect(during.open, "a mérés végén is nyitott a kérdés").toBe(1);
    expect(during.r).toBeGreaterThanOrEqual(0.35 * 0.9);
    expect(during.r).toBeLessThan(0.9);
    await page.getByTestId("game-pause").click();
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    expect((await rate(600)).r, "szünetben a szimuláció áll").toBe(0);
  });
});

test.describe("két ujj egyszerre (K.4/15, terv 8.4)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("két drón egyszerre megérintve: csak az első válasz számít; a második ujj alatt a lövés is működik", async ({ page }) => {
    await page.goto("/games/speed-quiz-math?seed=5");
    await page.getByTestId("sq-start").tap();
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    await page.waitForTimeout(650);
    const wrongBox = (await page.locator('[data-testid="sq-answers"] [data-correct="false"]').first().boundingBox())!;
    const rightBox = (await page.locator('[data-testid="sq-answers"] [data-correct="true"]').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const pt = (b: { x: number; y: number; width: number; height: number }, id: number) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2, id });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(wrongBox, 1), pt(rightBox, 2)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const answered = await page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => { questionsAnswered: number; questionsCorrect: number } } }).__websuliGame.probe());
    expect(answered.questionsAnswered, "egy kérdésre egy válasz").toBe(1);
    // A két mutató közül az egyik nem elsődleges: ha a választás `click`-re épülne, egyik sem számítana (mutáció-ellenőrzés).
    await expect(page.locator('[data-testid="sq-answers"] [data-state="correct"]')).toHaveCount(1);
  });

  test("mozgó érintési cél: lenyomás a drónon → elhúzás → felengedés máshol = NINCS válasz; utána sima koppintás = válasz", async ({ page }) => {
    await page.goto("/games/speed-quiz-math?seed=6");
    await page.getByTestId("sq-start").tap();
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    await page.waitForTimeout(650);
    const box = (await page.locator('[data-testid="sq-answers"] [data-correct="true"]').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
    for (let k = 1; k <= 6; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx, y: cy + 25 * k, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const probe = () => page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => { questionsAnswered: number; reveal: number } } }).__websuliGame.probe());
    await page.waitForTimeout(150);
    expect((await probe()).questionsAnswered, "az elhúzott (visszavont) érintés nem válasz").toBe(0);
    await expect(page.locator('[data-testid="sq-answers"] [data-state="correct"]')).toHaveCount(0);
    await page.touchscreen.tap(cx, cy);
    await expect.poll(async () => (await probe()).questionsAnswered).toBe(1);
  });
});
