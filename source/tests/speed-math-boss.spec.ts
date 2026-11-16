import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * J4b — a teljes menet VALÓDI ÉRINTÉSSEL, KAMPÓ NÉLKÜL a Zéró-robot legyőzéséig (végrehajtás J4b 7.; terv 5.4; K.4/15–18,
 * 23–26). Se `forceState`, se `probe`: minden feladatra a jó számdrónra koppintunk (a `data-correct` a teszt-buildben a jó
 * célt jelöli; a választás érintés). A jó válaszok energiahulláma és a kombó-erő (automata ágyú) védi a tornyot — így a
 * menet a valódi úton jut el a Hibagyáron át a főellenfélig, ahol a gyenge pontok a robottal együtt MOZOGNAK.
 *
 * Képernyőkép: ha a `SQ_SHOT_DIR` meg van adva, oda (JPEG 70).
 */

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SQ_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70 });
}

test("kampó nélkül, érintéssel: hullámok → Hibagyár → Zéró-robot (mozgó gyenge pontok) → győzelem, eredménylap", async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/games/speed-quiz-math");
  await page.getByTestId("sq-start").tap();
  await expect(page.getByTestId("sq-world")).toBeVisible();

  const won = page.getByTestId("sq-won");
  const hud = page.locator("[data-game-hud]");
  let sawFactory = false;
  let sawZero = false;
  let bossShot = false;
  let answered = 0;
  const deadline = Date.now() + 450_000;
  while (Date.now() < deadline && !(await won.isVisible())) {
    const right = page.locator('[data-testid="sq-answers"] [data-correct="true"][data-state="idle"]').first();
    if ((await right.count()) > 0) {
      // a belépő repülés / a mozgó gyenge pont: a pillanatnyi doboz közepére koppintunk
      await page.waitForTimeout(560);
      const box = await right.boundingBox().catch(() => null);
      if (box) {
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        answered += 1;
      }
      await expect(page.getByTestId("play-question-more")).toHaveCount(0);
    }
    const label = (await hud.innerText().catch(() => "")) ?? "";
    if (label.includes("Hibagyár")) sawFactory = true;
    if (label.includes("Zéró-robot")) {
      sawZero = true;
      if (!bossShot && (await right.count()) > 0) {
        bossShot = true;
        await shot(page, "touch-boss.jpg");
      }
    }
    await page.waitForTimeout(250);
  }
  await expect(won, `győzelem (megválaszolt feladatok: ${answered})`).toBeVisible({ timeout: 20_000 });
  expect(sawFactory, "a menet a Hibagyáron át vezetett").toBe(true);
  expect(sawZero, "a főellenfél harca a valódi úton jött el").toBe(true);
  await shot(page, "touch-won.jpg");
  await expect(page.getByTestId("sq-next-goal")).toBeVisible();
  // egy koppintás az új menet
  await page.getByRole("button", { name: "Új futam" }).tap();
  await expect(page.getByTestId("sq-score")).toContainText("Pont: 0");
  expect(errors.filter((e) => !/401|Failed to fetch/i.test(e))).toEqual([]);
});

/**
 * Review #466: a Hibagyár négy válasza páronként egymásra került — a takart helyes válasz érintéssel nem volt választható
 * (a kampó nélküli menet ezt elfedte: a „jó” koppintás néha a fedő, rossz drónra esett, és csak a pontosság romlott).
 * Itt a főellenfél-állapotot kampóval nyitjuk, de a VÁLASZTÁS valódi érintés: MINDEN indexen a megérintett drón kerül
 * a megoldás-kijelzésbe (jó → `correct`, rossz → `wrong`), és a doboza nem fedi a többit.
 */
for (const kind of ["factory", "boss"] as const) {
  test(`${kind === "factory" ? "Hibagyár" : "Zéró-robot"}: a négy válaszcél közül bármelyik kiválasztható érintéssel (nincs takart cél)`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/games/speed-quiz-math?seed=8");
    await page.getByTestId("sq-start").tap();
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: { forceState?: unknown } }).__websuliGame?.forceState === "function");
    await page.evaluate((phase) => (window as unknown as { __websuliGame: { forceState: (p: object) => void } }).__websuliGame.forceState({ phase }), kind);
    const tested = new Map<number, string>();
    for (let round = 0; round < 12 && tested.size < 4; round++) {
      const drones = page.locator('[data-testid="sq-answers"] [data-correct][data-state="idle"]');
      await expect(drones).toHaveCount(4, { timeout: 15_000 });
      await page.waitForTimeout(300);
      // a még nem próbált indexek közül előbb a rosszat (a jó válasz sebez — a Hibagyár 2 találattól elesne)
      let pick = -1;
      for (let i = 0; i < 4 && pick < 0; i++) if (!tested.has(i) && (await page.getByTestId(`sq-drone-${i}`).getAttribute("data-correct")) === "false") pick = i;
      for (let i = 0; i < 4 && pick < 0; i++) if (!tested.has(i)) pick = i;
      const el = page.getByTestId(`sq-drone-${pick}`);
      const correct = (await el.getAttribute("data-correct")) === "true";
      const box = (await el.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(el, `${pick}. index`).toHaveAttribute("data-state", correct ? "correct" : "wrong");
      tested.set(pick, correct ? "correct" : "wrong");
      // a következő gyenge-pont kérdésig (a megoldás-kijelzés + a ritmus-szünet)
      await expect(page.locator('[data-testid="sq-answers"] [data-correct]')).toHaveCount(0, { timeout: 10_000 });
    }
    expect([...tested.keys()].sort()).toEqual([0, 1, 2, 3]);
  });
}
