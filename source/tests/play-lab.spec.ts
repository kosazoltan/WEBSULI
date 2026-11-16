import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { MOBILE_VIEWPORTS, measureOverflow, smallFonts, smallTargets } from "./support/game-mobile-quality";

/**
 * J0c — a közös, nem blokkoló kérdés-sáv a „play-lab” próbaoldalon (végrehajtás J0c 8. lépés; terv J1, J4, J5, J16, M2/M3).
 * Csak teszt-kampós buildben él (`/__play-lab`). Képernyőkép: mindig a `testInfo.outputPath()` alá; ha a
 * `PLAY_LAB_SHOT_DIR` meg van adva, oda is `<skin>-<sz>x<m>-<állapot>.jpg` néven (JPEG 70, CSS-pixel).
 */

test.use({ serviceWorkers: "block" });

type Probe = {
  simTime: number;
  questionOpen: number;
  questionsAnswered: number;
  questionsCorrect: number;
  questionId: number | null;
  questionKey: string | null;
  reveal: number;
  paused: number;
};
type LabWindow = { __websuliGame?: { forceState: (p: Record<string, unknown>) => void; probe?: () => Probe } };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

async function openLab(page: Page, query: string): Promise<void> {
  await page.goto(`/__play-lab?auto=1&seed=42&${query}`);
  await page.waitForFunction(() => typeof (window as unknown as LabWindow).__websuliGame?.probe === "function", undefined, { timeout: 20_000 });
  await expect(page.getByTestId("play-lab-canvas")).toBeVisible();
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => (window as unknown as LabWindow).__websuliGame!.probe!());
}

/** A sim-idő és a valós idő aránya egy `ms` hosszú ablakban (a lapon belül mérve, a CI ütemezésétől függetlenül). */
async function simRate(page: Page, ms: number): Promise<number> {
  return page.evaluate(async (wait) => {
    const api = (window as unknown as LabWindow).__websuliGame!;
    const s0 = api.probe!().simTime;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, wait));
    return (api.probe!().simTime - s0) / (performance.now() - t0);
  }, ms);
}

/** Azonnali kérdés (`forceState({ question: true })`); a minGap miatt addig próbálja, amíg új kérdés nyílik. */
async function openQuestion(page: Page, afterId: number | null = null): Promise<Probe> {
  await expect
    .poll(
      async () => {
        await page.evaluate(() => (window as unknown as LabWindow).__websuliGame!.forceState({ question: true }));
        const p = await probe(page);
        return p.questionOpen === 1 && p.questionId !== afterId ? p.questionId : null;
      },
      { timeout: 15_000, intervals: [100, 200, 300] },
    )
    .not.toBeNull();
  return probe(page);
}

const root = (page: Page) => page.getByTestId("play-question");

async function answer(page: Page, correct: boolean): Promise<void> {
  await root(page).locator(`[data-correct="${correct ? "true" : "false"}"]`).first().click();
}

async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const vp = page.viewportSize();
  const file = `${name.replace("{vp}", `${vp?.width ?? 0}x${vp?.height ?? 0}`)}.jpg`;
  await page.screenshot({ path: testInfo.outputPath(file), type: "jpeg", quality: 70 });
  const dir = process.env.PLAY_LAB_SHOT_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, file), type: "jpeg", quality: 70, scale: "css" });
  }
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** A kérdés-sáv semmilyen játékvezérlőt (HUD, vezérlősáv gombjai) nem takar, és a nézetben marad. */
async function expectLayoutClean(page: Page, where: string): Promise<void> {
  const vp = page.viewportSize()!;
  const parts = await page.locator(".play-question-card, .play-question-option").evaluateAll((els) =>
    els.filter((e) => getComputedStyle(e.closest(".play-question-options") ?? e).opacity !== "0").map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  const controls = await page.locator("[data-game-controls] button, [data-game-hud] button, [data-game-hud] .game-hud-stat").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  expect(parts.length, `${where}: a sáv látszik`).toBeGreaterThan(0);
  for (const p of parts) {
    expect(p.x, `${where}: balra kilóg`).toBeGreaterThanOrEqual(0);
    expect(p.y, `${where}: felül kilóg`).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width, `${where}: jobbra kilóg`).toBeLessThanOrEqual(vp.width + 1);
    expect(p.y + p.height, `${where}: alul kilóg`).toBeLessThanOrEqual(vp.height + 1);
    for (const c of controls) expect(overlaps(p, c), `${where}: a sáv vezérlőt takar ${JSON.stringify({ p, c })}`).toBe(false);
  }
  // A prompt-szöveg nem lóg ki a dobozából (a két sorra vágás a doboz magasságán belül tart).
  const promptOk = await page.locator(".play-question-prompt").evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth + 1));
  expect(promptOk, `${where}: a prompt vízszintesen kilóg`).toBe(true);
}

test("(a) J1: nyitott kérdés alatt a játék fut (sim-idő ≥ 0,35× a valós időnek), nincs párbeszéd", async ({ page }) => {
  await openLab(page, "slow=0.5");
  await openQuestion(page);
  await expect(root(page)).toBeVisible();
  const rate = await simRate(page, 1000);
  expect((await probe(page)).questionOpen, "a kérdés az ablak alatt nyitva maradt").toBe(1);
  expect(rate).toBeGreaterThanOrEqual(0.35);
  expect(rate, "lassítva fut (≈ 0,5×), nem teljes sebességgel").toBeLessThan(0.8);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
});

test("(b) J5: hibás válasz után nincs blokkoló kártya, a megoldás ≥ 1,8 mp-ig látszik, a játék teljes sebességgel fut", async ({ page }) => {
  await openLab(page, "slow=0.35");
  await openQuestion(page);
  await answer(page, false);
  const t0 = Date.now();
  await expect(root(page)).toHaveAttribute("data-state", "reveal");
  await expect(root(page).locator('[data-state="correct"]')).toHaveCount(1);
  await expect(root(page).locator('[data-state="wrong"]')).toHaveCount(1);
  await expect(page.getByTestId("play-question-status")).toContainText("A jó válasz:");
  const rate = await simRate(page, 600);
  expect(rate, "a megoldás-kijelzés alatt teljes sebesség").toBeGreaterThanOrEqual(0.8);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  // ≥ 1,8 mp: 1,7 mp-nél a helyes válasz még jelölve van.
  const wait = 1700 - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  await expect(root(page).locator('[data-state="correct"]')).toHaveCount(1);
  expect(Date.now() - t0).toBeLessThan(2500);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
});

test("(c) J5: a „Miért?” szünetet tart és a magyarázókártyát mutatja; bezárás után a játék megy tovább", async ({ page }) => {
  await openLab(page, "slow=0.5");
  await openQuestion(page);
  await answer(page, false);
  await page.getByTestId("play-why").click();
  await expect(page.getByTestId("quiz-feedback")).toBeVisible();
  await expect(page.getByTestId("quiz-feedback")).toHaveAttribute("data-outcome", "wrong");
  const s0 = (await probe(page)).simTime;
  await page.waitForTimeout(800);
  expect((await probe(page)).simTime, "a kártya alatt áll a játék").toBe(s0);
  await page.getByTestId("quiz-feedback-dismiss").click();
  await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
  expect(await simRate(page, 500)).toBeGreaterThan(0.3);
});

test("(d) J4: a hibázott tétel a 3.–6. következő kérdésként tér vissza (seed=42)", async ({ page }) => {
  await openLab(page, "slow=0.5");
  const first = await openQuestion(page);
  const missed = first.questionKey;
  await answer(page, false);
  const keys: string[] = [];
  let last = first.questionId;
  for (let n = 0; n < 6 && !keys.includes(missed!); n++) {
    const p = await openQuestion(page, last);
    last = p.questionId;
    keys.push(p.questionKey!);
    await answer(page, true);
  }
  const at = keys.indexOf(missed!) + 1;
  expect(at, `a hibázott tétel (${missed}) helye a következő kérdések között: ${keys.join(", ")}`).toBeGreaterThanOrEqual(3);
  expect(at).toBeLessThanOrEqual(6);
});

test("(e) J16: a menet végén a „Gyakorold még” lista a hibázott tétellel és a helyes válasszal", async ({ page }) => {
  await openLab(page, "slow=0.5");
  await openQuestion(page);
  const correctLabel = await root(page).locator('[data-correct="true"] .play-question-label').innerText();
  await answer(page, false);
  await page.evaluate(() => (window as unknown as LabWindow).__websuliGame!.forceState({ phase: "result" }));
  const review = page.getByTestId("result-review");
  await expect(review).toBeVisible();
  await expect(review).toContainText("Gyakorold még");
  await expect(review.getByTestId("result-review-item")).toHaveCount(1);
  await expect(review.locator(".play-review-correct")).toContainText(correctLabel);
  await expect(review.locator(".play-review-picked s")).toHaveCount(1);
});

test("(f) M2/M3 a kérdés-állapotban 360×640-en: ≥ 48 px célok, ≥ 12 px betű, nincs oldalgörgetés, a sáv nem takar vezérlőt", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openLab(page, "slow=0.5&long=1");
  await openQuestion(page);
  await expect(root(page).locator(".play-question-option").first()).toBeVisible();
  expect(await smallTargets(page)).toEqual([]);
  expect(await smallFonts(page)).toEqual([]);
  const o = await measureOverflow(page);
  expect(o.x).toBeLessThanOrEqual(2);
  expect(o.y).toBeLessThanOrEqual(2);
  await expectLayoutClean(page, "360×640 kérdés");
  // A válaszgombok az alsó harmadban (hüvelykujj-zóna), legalább 56 px magasak.
  const boxes = await root(page).locator(".play-question-option").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as Box));
  for (const b of boxes) {
    expect(b.height).toBeGreaterThanOrEqual(56);
    expect(b.y + b.height / 2, "a gomb közepe az alsó felében").toBeGreaterThan(640 / 2);
  }
  // Hibás válasz utáni állapotban is.
  await answer(page, false);
  expect(await smallTargets(page)).toEqual([]);
  expect(await smallFonts(page)).toEqual([]);
});

test("review #446: kijelzés alatt kért kérdés vár; az új kérdés mellett az előző hiba „Miért?”-je elérhető, és megállít mindent", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openLab(page, "slow=0.5");
  const first = await openQuestion(page);
  await answer(page, false);
  await page.evaluate(() => (window as unknown as LabWindow).__websuliGame!.forceState({ question: true }));
  // A kérés nem vágja el a megoldást: 1,7 mp-ig ugyanaz a kérdés, kijelzésben.
  await page.waitForTimeout(1500);
  let p = await probe(page);
  expect(p.questionId).toBe(first.questionId);
  expect(p.reveal).toBe(1);
  await expect(root(page).locator('[data-state="correct"]')).toHaveCount(1);
  // A kijelzés végén a függő kérés indul; az új kérdés mellett „Előző: miért?”.
  await expect.poll(async () => (await probe(page)).questionId, { timeout: 5_000 }).not.toBe(first.questionId);
  p = await probe(page);
  expect(p.questionOpen).toBe(1);
  const why = page.getByTestId("play-why");
  await expect(why).toBeVisible();
  await expect(why).toContainText("Előző");
  await expectLayoutClean(page, "új kérdés + előző „Miért?”");
  await shot(page, testInfo, "ocean-{vp}-previous-why");
  const whyBox = (await why.boundingBox())!;
  for (const b of await root(page).locator(".play-question-option").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as Box))) {
    expect(overlaps(whyBox, b), "a „Miért?” nem takar válaszgombot").toBe(false);
  }
  await why.click();
  await expect(page.getByTestId("quiz-feedback")).toBeVisible();
  // Az előző (hibázott) kérdés magyarázata, nem az újé.
  await expect(page.getByTestId("quiz-feedback")).toHaveAttribute("data-outcome", "wrong");
  const a = await page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => { simTime: number; clock: number } } }).__websuliGame.probe());
  await page.waitForTimeout(700);
  const b = await page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => { simTime: number; clock: number } } }).__websuliGame.probe());
  expect(b.simTime, "a játék áll").toBe(a.simTime);
  expect(b.clock, "az új kérdés válaszablaka sem fogy").toBe(a.clock);
  await page.getByTestId("quiz-feedback-dismiss").click();
  expect((await probe(page)).questionOpen).toBe(1);
});

test("review #446: hibátlan menet is eljut az eredményképernyőig (12 helyes válasz)", async ({ page }) => {
  test.setTimeout(120_000);
  await openLab(page, "slow=0.5");
  let last: number | null = null;
  for (let n = 0; n < 12; n++) {
    const p = await openQuestion(page, last);
    last = p.questionId;
    await answer(page, true);
  }
  await expect(page.getByTestId("play-lab-result")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("play-lab-result")).toContainText("12/12");
  await expect(page.getByTestId("result-review")).toHaveCount(0);
});

test("review #446 menetvég: a 12. válasz hibás → a megoldás kifut, nincs 13. kérdés, eredmény a „Gyakorold még” tétellel", async ({ page }) => {
  test.setTimeout(120_000);
  await openLab(page, "slow=0.5");
  let last: number | null = null;
  for (let n = 0; n < 12; n++) {
    const p = await openQuestion(page, last);
    last = p.questionId;
    await answer(page, n < 11);
  }
  // A kijelzés még látszik (nem ugrik azonnal az eredményre) …
  await expect(root(page)).toHaveAttribute("data-state", "reveal");
  // … utána az eredmény, és nem indult 13. kérdés.
  await expect(page.getByTestId("play-lab-result")).toBeVisible({ timeout: 10_000 });
  const p = await probe(page);
  expect(p.questionsAnswered).toBe(12);
  expect(p.questionOpen).toBe(0);
  await expect(page.getByTestId("result-review-item")).toHaveCount(1);
});

test("(g) terv 8.9: hosszú kérdés két sorra vágva, „Mutasd” → a teljes szöveg szünettel; „Tovább” → a játék megy tovább", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openLab(page, "slow=0.5&long=1");
  await openQuestion(page);
  const prompt = page.getByTestId("play-question-prompt");
  const clampedH = await prompt.evaluate((e) => e.clientHeight);
  expect(await prompt.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await page.getByTestId("play-question-more").click();
  await expect(root(page)).toHaveAttribute("data-expanded", "true");
  expect((await probe(page)).paused).toBe(1);
  const s0 = (await probe(page)).simTime;
  await page.waitForTimeout(500);
  expect((await probe(page)).simTime, "kinyitott kérdésnél áll a játék").toBe(s0);
  expect(await prompt.evaluate((e) => e.clientHeight)).toBeGreaterThan(clampedH);
  await expectLayoutClean(page, "kinyitott hosszú kérdés");
  expect(await smallTargets(page)).toEqual([]);
  await page.getByTestId("play-question-more").click();
  await expect(root(page)).toHaveAttribute("data-expanded", "false");
  expect(await simRate(page, 500)).toBeGreaterThan(0.3);
});

for (const vp of MOBILE_VIEWPORTS) {
  test(`elrendezés és képernyőképek ${vp.width}×${vp.height}: gombok, sáv, hiba, eredmény`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // 1) gombos mód, hosszú kérdés (tördelés + „Mutasd”), óceán skin
    await openLab(page, "slow=0.5&long=1&skin=ocean");
    await openQuestion(page);
    await expect(root(page).locator(".play-question-option").first()).toBeVisible();
    await page.waitForTimeout(250);
    await expectLayoutClean(page, `${vp.width}×${vp.height} kérdés`);
    await shot(page, testInfo, "ocean-{vp}-question");
    await answer(page, false);
    await expect(root(page)).toHaveAttribute("data-state", "reveal");
    await page.waitForTimeout(300);
    await expectLayoutClean(page, `${vp.width}×${vp.height} hiba`);
    await shot(page, testInfo, "ocean-{vp}-wrong");
    await page.evaluate(() => (window as unknown as LabWindow).__websuliGame!.forceState({ phase: "result" }));
    await expect(page.getByTestId("result-review")).toBeVisible();
    await page.waitForTimeout(1300);
    expect((await measureOverflow(page)).x).toBeLessThanOrEqual(2);
    await shot(page, testInfo, "ocean-{vp}-result");

    // 2) „bar” mód (célok a világban), rövid kérdés, űr skin
    await openLab(page, "slow=0.5&mode=bar&skin=space");
    await openQuestion(page);
    await page.waitForTimeout(250);
    await expectLayoutClean(page, `${vp.width}×${vp.height} sáv`);
    expect(await smallFonts(page)).toEqual([]);
    await shot(page, testInfo, "space-{vp}-bar");
  });
}

test("a hét skin: mind ugyanaz a közös komponens, saját témával (360×640)", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const seen = new Set<string>();
  for (const skin of ["ocean", "rock", "mine", "neon", "arena", "space", "storm"]) {
    await openLab(page, `slow=0.5&skin=${skin}`);
    await openQuestion(page);
    await expect(root(page)).toHaveAttribute("data-skin", skin);
    const bg = await page.locator(".play-question-card").evaluate((e) => getComputedStyle(e).backgroundColor);
    seen.add(bg);
    expect(await smallTargets(page)).toEqual([]);
    await expectLayoutClean(page, `${skin} 360×640`);
    if (skin !== "ocean" && skin !== "space") await shot(page, testInfo, `${skin}-{vp}-question`);
  }
  expect(seen.size, "minden skin saját háttérszínt ad").toBe(7);
});

test("billentyűzet: 1–4 választ; a gombsor fókuszálható (asztali játék, terv 8.11)", async ({ page }) => {
  await openLab(page, "slow=0.5&mode=bar");
  await openQuestion(page);
  const correctIndex = await root(page).locator('[data-correct="true"]').getAttribute("data-option-index");
  await page.keyboard.press(String(Number(correctIndex) + 1));
  await expect(root(page)).toHaveAttribute("data-state", "reveal");
  await expect(page.getByTestId("play-question-status")).not.toHaveText("");
  expect((await probe(page)).questionsCorrect).toBe(1);
});
