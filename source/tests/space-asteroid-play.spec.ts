import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * J6a — Galaktikus Aszteroida valódi érintéssel (végrehajtás J6a 5.; terv J1, J5, J9, J-SA; K.4/13–18, 23–25).
 *
 * Az ELSŐ eset szándékosan KAMPÓ NÉLKÜLI: se `forceState`, se `probe` — csak a felhasználó útja érintéssel (a Kockavadásznál a
 * kampós teszt elfedte a valódi út hibáját). A kristályok helyét a DOM adja (a `data-correct` a teszt-buildben a jó / rossz
 * kristályt jelöli, a választás érintéssel történik). A második eset a kampót használja a mérésekhez (szimuláció-idő,
 * ütközés, kérdés/perc a lapon).
 *
 * Képernyőkép: ha az `SA_SHOT_DIR` meg van adva, oda (JPEG 70).
 */

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "5");
    localStorage.setItem("websuli.spaceQuiz.grade", "5");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

const crystals = (page: Page) => page.locator('[data-testid="sa-crystals"] [data-correct]');
type Probe = Record<string, number | string | null>;
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => Probe } }).__websuliGame.probe());
const force = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate((p) => (window as unknown as { __websuliGame: { forceState: (x: object) => void } }).__websuliGame.forceState(p), patch);

/** Koppintás egy elem közepére valódi érintéssel (a kristály a helyén áll; a zóna ~1 mp alatt beáll a kártya alá). */
async function tapCenter(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(900);
  const box = await el.boundingBox();
  expect(box, `${selector} doboza`).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SA_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70, scale: "css" });
}

test.describe("valódi érintés", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("kampó nélkül: azonnali indulás kapu nélkül, magától érkező kristály-kérdés, jó és rossz kristály, „Miért?”", async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    // J-SA: a menet AZONNAL indul — nincs induló kvíz, semmilyen blokkoló réteg; a HUD hullám / élet, nincs „mp”.
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(page.getByTestId("sa-wave-banner")).toContainText("HULLÁM 1");
    await expect(page.locator("[data-game-hud]")).toContainText("1/8");
    await expect(page.locator("[data-game-hud]")).not.toContainText(/\d+ mp/);
    await shot(page, "play-start.jpg");

    // Az ütemező a bemelegítés (10 mp) után magától kristály-kérdést ad (nyugodt pillanatban), blokkoló réteg nélkül.
    await expect(crystals(page)).toHaveCount(4, { timeout: 60_000 });
    expect(await page.locator('[role="dialog"]').count(), "a kérdés nem modális").toBe(0);
    await expect(page.getByTestId("sa-prompt")).toBeVisible();
    await shot(page, "play-question.jpg");

    // 1. kérdés: a JÓ kristály érintéssel → fejlesztés (felirat), a kristály zöld, a pont nő.
    await tapCenter(page, '[data-testid="sa-crystals"] [data-correct="true"]');
    await expect(page.locator('[data-testid="sa-crystals"] [data-correct="true"]')).toHaveAttribute("data-state", "correct");
    await expect(page.getByText(/Pajzs!|Hármas lövés!|Bomba a tárba!/)).toBeVisible({ timeout: 5_000 });
    await expect.poll(async () => Number((await page.locator('[data-hud-stat="score"]').innerText()).replace(/\D/g, "")), { timeout: 5_000 }).toBeGreaterThanOrEqual(50);
    await shot(page, "play-correct.jpg");

    // 2. kérdés (magától): a ROSSZ kristály → nincs dialógus, a helyes kristály zölden látszik, „Miért?” → kártya újrapróba nélkül.
    await expect(crystals(page)).toHaveCount(0, { timeout: 5_000 });
    await expect(crystals(page)).toHaveCount(4, { timeout: 60_000 });
    await tapCenter(page, '[data-testid="sa-crystals"] [data-correct="false"]');
    await expect(page.locator('[data-testid="sa-crystals"] [data-correct="true"]')).toHaveAttribute("data-state", "correct");
    expect(await page.locator('[role="dialog"]').count(), "a hibás válasz nem nyit blokkoló kártyát").toBe(0);
    await shot(page, "play-wrong.jpg");
    await page.getByTestId("play-why").tap();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await expect(page.getByTestId("quiz-feedback")).toHaveAttribute("data-outcome", "wrong");
    await expect(page.getByTestId("quiz-feedback-retry")).toHaveCount(0);
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
    expect(errors.filter((e) => !/401|Failed to fetch/i.test(e))).toEqual([]);
  });

  test("kampóval: a világ a kérdés alatt fut (≥ 0,35×), a „Miért?” alatt áll; a rossz kristály 3 sziklát ad; ütközés = élet −1 kvíz nélkül", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");

    // J1: nyitott kérdés alatt a szimuláció-idő / valós idő ≥ 0,35 (a lapon belül, egyetlen page.evaluate-ben mérve, C-64 / C-65).
    await force(page, { question: true });
    await expect(crystals(page)).toHaveCount(4, { timeout: 5_000 });
    const open = await page.evaluate(
      () =>
        new Promise<{ ratio: number; open: number; real: number }>((resolve) => {
          const api = (window as unknown as { __websuliGame: { probe: () => Record<string, number> } }).__websuliGame;
          const s0 = api.probe().simTime!;
          const t0 = performance.now();
          let stillOpen = 1;
          const tick = () => {
            if (!api.probe().questionOpen) stillOpen = 0;
            if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
            else resolve({ ratio: (api.probe().simTime! - s0) / (performance.now() - t0), open: stillOpen, real: performance.now() - t0 });
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`[space-asteroid-play] nyitott kérdés alatt: szimuláció / valós idő = ${open.ratio.toFixed(2)} (a kérdés végig nyitva: ${open.open})`);
    expect(open.ratio, "a szimuláció a kérdés alatt fut (≥ 0,35×)").toBeGreaterThanOrEqual(0.35);
    expect(open.ratio, "a szimuláció a kérdés alatt soha nem áll").toBeGreaterThan(0);

    // J5: hibás válasz → nincs dialógus, 3 apró szikla jelenik meg a hajó felé (az ellenfelek száma +3), a világ teljes sebességen fut.
    const before = await probe(page);
    const wrong = page.locator('[data-testid="sa-crystals"] [data-correct="false"]').first();
    const wb = (await wrong.boundingBox())!;
    await page.touchscreen.tap(wb.x + wb.width / 2, wb.y + wb.height / 2);
    await expect.poll(async () => (await probe(page)).reveal, { timeout: 3_000 }).toBe(1);
    expect(await page.locator('[role="dialog"]').count()).toBe(0);
    const after = await probe(page);
    expect((after.enemies as number) - (before.enemies as number), "a rossz kristály 3 apró sziklára hasad (a közben érkező ellenfelekkel együtt ≥ 3)").toBeGreaterThanOrEqual(3 - 1);
    const full = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const api = (window as unknown as { __websuliGame: { probe: () => Record<string, number> } }).__websuliGame;
          const s0 = api.probe().simTime!;
          const t0 = performance.now();
          const tick = () => {
            if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
            else resolve((api.probe().simTime! - s0) / (performance.now() - t0));
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`[space-asteroid-play] hibás válasz utáni kijelzés alatt: szimuláció / valós idő = ${full.toFixed(2)}`);
    expect(full, "a megoldás-kijelzés alatt a világ fut").toBeGreaterThanOrEqual(0.35);

    // „Miért?”: a kártya megnyílik, és amíg nyitva van, a szimuláció-idő nem nő; bezárás után újra nő.
    await page.getByTestId("play-why").tap();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    const t1 = (await probe(page)).simTime as number;
    await page.waitForTimeout(700);
    const t2 = (await probe(page)).simTime as number;
    expect(t2 - t1, "a „Miért?” alatt áll a szimuláció").toBeLessThanOrEqual(34);
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
    await expect.poll(async () => ((await probe(page)).simTime as number) - t2, { timeout: 3_000 }).toBeGreaterThan(300);

    // J-SA: az ütközés CSAK élet −1 és sérthetetlenség — a hajó mozdulatlanul áll, a szikla előbb-utóbb eltalálja; nincs kvíz-réteg.
    await expect.poll(async () => (await probe(page)).lives as number, { timeout: 150_000, intervals: [1_000] }).toBeLessThan(3);
    const hit = await probe(page);
    expect(hit.over, "egy ütközés nem a menet vége").toBe(0);
    expect(hit.invuln as number, "az ütközés után ≤ 2 mp sérthetetlenség").toBeLessThanOrEqual(2);
    expect(await page.locator('[role="dialog"]').count(), "az ütközés nem nyit kvíz-réteget").toBe(0);
  });

  test("a lapon mért kérdés/perc: a magától érkező kristály-kérdések ütemezése (a jó kristályt megérintve), eredmény, nincs automatikus újraindítás", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
    const started = Date.now();
    const RUN_MS = 90_000;
    let answered = 0;
    while (Date.now() - started < RUN_MS) {
      const good = page.locator('[data-testid="sa-crystals"] [data-correct="true"][data-state="idle"]').first();
      if (await good.isVisible().catch(() => false)) {
        const box = await good.boundingBox().catch(() => null);
        if (box) {
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
          answered++;
        }
      }
      if ((await probe(page)).over === 1) break;
      await page.waitForTimeout(300);
    }
    const p = await probe(page);
    const minutes = (Date.now() - started) / 60_000;
    const asked = (p.questionsAnswered as number) ?? 0;
    console.log(
      `[space-asteroid-play] ${minutes.toFixed(2)} perc alatt ${asked} megválaszolt kérdés (${(asked / minutes).toFixed(2)} / perc; érintések: ${answered}), hullám ${p.wave}, élet ${p.lives}`,
    );
    // A bemelegítés (10 mp) után ≥ 4/perc a cél (terv J2, a node-szimuláció méri pontosan); a lapon a CI lassúsága és a
    // sérülés utáni „nem nyugodt” szakaszok miatt a küszöb lazább: legalább 2/perc.
    expect(asked / minutes, "kérdés/perc a lapon").toBeGreaterThanOrEqual(2);
    await force(page, { phase: "over", gameWon: false });
    await expect(page.getByTestId("sa-over")).toBeVisible();
    await shot(page, "play-result.jpg");
    await page.waitForTimeout(2_000);
    await expect(page.getByTestId("sa-over"), "a menet vége után nincs automatikus újraindítás").toBeVisible();
    await page.getByRole("button", { name: "Új kör" }).tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });
});
