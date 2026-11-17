import { devices, expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block", ...devices["Pixel 7"], viewport: { width: 390, height: 844 } });

/**
 * J3a — Kockavadász „Rúnabánya” böngészőben (végrehajtás J3a 5.; terv 5.3, J1, J4, J5, J-BC; C-65: időtartam a lapon belül,
 * képkockánként mérve). A teszt-kampó (`window.__websuliGame`) csak `VITE_ENABLE_GAME_TEST_HOOKS=1` buildben él.
 *
 * 1. Sima blokk kérdés nélkül, VALÓDI érintéssel: a Bányász gomb 3 koppintása = 1 blokk a hotbarban, kérdés nem nyílik.
 * 2. Rúna-zár (`forceState({ question: true })` = rúnaérc a játékos előtt): a világ lassítva fut (≥ 0,35), nincs modális
 *    párbeszéd; rossz rúnakő (valódi érintés) → a helyes rúna ≥ 1,8 mp-ig `data-state="correct"`; „Miért?” → a kártya
 *    nyílik és a szimuláció áll; bezárva a játék folytatódik.
 * 3. Jó rúnakő → dupla zsákmány (2 kristály), a kombó nő.
 */

type Probe = Record<string, number | string | null>;
type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void; probe: () => Probe } };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "5");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

const probe = (page: Page) => page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.probe());

async function startGame(page: Page): Promise<void> {
  await page.goto("/games/block-craft-quiz?seed=11");
  await page.getByTestId("bc-start").click();
  await expect(page.getByTestId("bc-touch-controls")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.probe === "function", undefined, { timeout: 15_000 });
}

async function openLock(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true }));
  await expect(page.locator('[data-testid="bc-quiz"] [data-correct="false"]').first()).toBeVisible({ timeout: 15_000 });
}

test("sima blokk kérdés nélkül: a Bányász gomb 3 valódi koppintása kibányászik egy blokkot, kérdés nem nyílik", async ({ page }) => {
  await startGame(page);
  const mine = page.getByRole("button", { name: "Bányász" });
  const box = (await mine.boundingBox())!;
  // A kezdő nézés egy közeli, bányászható blokkra mutat (E24 + kanban #64); 3 ütés = 1 blokk (koppintós mód).
  for (let i = 0; i < 3; i++) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect.poll(async () => Number((await probe(page)).blocks), { timeout: 15_000 }).toBe(1);
  await expect(page.getByTestId("bc-hotbar")).toBeVisible();
  const p = await probe(page);
  expect(p.questionOpen, "sima blokknál nincs kérdés").toBe(0);
  expect(p.questionsAnswered).toBe(0);
  await expect(page.getByTestId("bc-quiz")).toHaveCount(0);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
});

test("Rúna-zár: a világ lassítva fut (nem áll), rossz rúnakőre a helyes ≥ 1,8 mp-ig világít, a „Miért?” megállítja a játékot", async ({ page }) => {
  await startGame(page);
  await openLock(page);
  await expect(page.getByTestId("bc-question")).toBeVisible();
  await expect(page.locator('[role="dialog"]'), "a Rúna-zár nem modális").toHaveCount(0);
  // J1: a kérdés alatt a szimuláció fut (a mag időskálája 0,5 ≥ 0,35), a sim-idő nő.
  const a = await probe(page);
  expect(a.questionOpen).toBe(1);
  expect(Number(a.timeScale)).toBeGreaterThanOrEqual(0.35);
  expect(Number(a.timeScale)).toBeLessThan(1);
  await expect.poll(async () => Number((await probe(page)).simTime), { timeout: 10_000 }).toBeGreaterThan(Number(a.simTime));

  // Rossz rúnakő VALÓDI érintéssel; a megoldás-kijelzés hosszát a lapon belül, képkockánként mérjük (C-65) — a JÁTÉK
  // kérdés-órájában (`probe().clock`: szünetben / a „Miért?” kártya alatt áll), hogy a kártya alatti szünet ne számítson.
  await page.evaluate(() => {
    const w = window as unknown as GameTestWindow & { __revealMs?: number; __revealDone?: boolean };
    w.__revealMs = 0;
    w.__revealDone = false;
    let start: number | null = null;
    const clock = () => Number(w.__websuliGame!.probe().clock);
    const tick = () => {
      const correct = document.querySelector('[data-testid="bc-quiz"] [data-state="correct"]');
      if (correct && start === null) start = clock();
      if (start !== null && !correct) {
        w.__revealMs = clock() - start;
        w.__revealDone = true;
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const wrong = page.locator('[data-testid="bc-quiz"] [data-correct="false"]').first();
  const wb = (await wrong.boundingBox())!;
  await page.touchscreen.tap(wb.x + wb.width / 2, wb.y + wb.height / 2);
  await expect(page.locator('[data-testid="bc-quiz"] [data-state="correct"]')).toHaveCount(1, { timeout: 5_000 });
  const afterWrong = await probe(page);
  expect(afterWrong.questionsAnswered).toBe(1);
  expect(afterWrong.questionsCorrect).toBe(0);
  expect(afterWrong.crystals, "rossz válasz: kisebb zsákmány").toBe(1);
  expect(afterWrong.runes, "a zár így is kinyílt").toBe(1);
  await expect(page.locator('[role="dialog"]'), "a hibás válasz nem nyit kártyát magától").toHaveCount(0);

  // „Miért?” — a kártya nyílik, és alatta a szimuláció áll (J5).
  await page.getByTestId("play-why").click();
  await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 5_000 });
  const s0 = Number((await probe(page)).simTime);
  await page.waitForTimeout(1_200);
  expect(Number((await probe(page)).simTime), "a „Miért?” kártya alatt a szimuláció áll").toBe(s0);
  await page.getByTestId("quiz-feedback-dismiss").click();
  await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
  await expect.poll(async () => Number((await probe(page)).simTime), { timeout: 10_000 }).toBeGreaterThan(s0);

  // A megoldás-kijelzés a kártya bezárása után kifut; a JÁTÉKIDŐBEN mért hossza ≥ 1,8 mp (a kártya alatti szünet nélkül).
  await page.waitForFunction(() => (window as unknown as { __revealDone?: boolean }).__revealDone === true, undefined, { timeout: 20_000 });
  const revealMs = await page.evaluate(() => (window as unknown as { __revealMs: number }).__revealMs);
  expect(revealMs, `a helyes rúna ${revealMs.toFixed(0)} ms játékidőig világított`).toBeGreaterThanOrEqual(1_800);
  await expect(page.getByTestId("bc-quiz")).toHaveCount(0, { timeout: 10_000 });
});

test("jó rúnakő: dupla zsákmány (2 kristály), a kombó nő, és a következő zár is nyitható", async ({ page }) => {
  await startGame(page);
  await openLock(page);
  const right = page.locator('[data-testid="bc-quiz"] [data-correct="true"]').first();
  const rb = (await right.boundingBox())!;
  await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await expect.poll(async () => Number((await probe(page)).crystals), { timeout: 10_000 }).toBe(2);
  const p = await probe(page);
  expect(p.combo).toBe(1);
  expect(p.questionsCorrect).toBe(1);
  await expect(page.getByTestId("bc-quiz")).toHaveCount(0, { timeout: 10_000 });
  await openLock(page);
  await expect(page.getByTestId("bc-prompt")).toBeVisible();
});
