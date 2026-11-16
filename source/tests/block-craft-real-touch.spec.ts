import { devices, expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block", ...devices["Pixel 7"], viewport: { width: 390, height: 844 } });

const SHOT = process.env.BC_PROBE_SHOT_DIR;

/**
 * E24 / 3. pont — éles próba: „180 mp alatt egyetlen blokk sem gyűlt (BLOKK 0/8), kvíz sem jött”.
 * VALÓDI érintéses út, teszt-kampó (`__websuliGame.forceState`) nélkül: a gyerek koppint a „Bányász” gombra
 * vagy a vászonra, helyesen válaszol, és a blokk megérkezik. A meglévő `block-craft-quiz` eset kampóval jut
 * kvízig, ezért a valódi út csak itt van tesztelve.
 */
async function startLikeAChild(page: Page): Promise<void> {
  await page.goto("/games/block-craft-quiz");
  const start = page.getByTestId("bc-start");
  await expect(start).toBeVisible({ timeout: 20_000 });
  // Mint egy gyerek: ha az osztályválasztó kérdez, kiválasztja a 3. osztályt.
  const gate = page.getByTestId("classroom-gate-modal");
  if (await gate.isVisible()) await gate.getByTestId("button-grade-3").tap();
  await expect(gate).toBeHidden();
  await start.tap();
  await expect(page.getByTestId("bc-touch-controls")).toBeVisible({ timeout: 20_000 });
}

/**
 * A gyerek addig koppint, amíg kvíz nem jön — legfeljebb a mért 20 mp-es kereten belül (a tesztek ezt az időt mérik).
 * #58 (run 43916330845): a korábbi „6 koppintás” darabszám-korlát a CI szoftveres WebGL-jén (~1 s / koppintás) ~9 s
 * után feladta, a 20 mp-es elvárás előtt. Bukáskor diagnosztika: a célkereszt-tipp megjelent-e (= nem volt célzott blokk)
 * és fut-e a render-ciklus (`probe().frames`, teszt-kampós buildben).
 */
async function tapUntilQuiz(page: Page, tapOnce: () => Promise<void>): Promise<number> {
  const t0 = Date.now();
  const quiz = page.getByTestId("bc-quiz");
  const frames = () =>
    page.evaluate(() => Number((window as unknown as { __websuliGame?: { probe?: () => Record<string, number | string | null> } }).__websuliGame?.probe?.().frames ?? Number.NaN));
  let taps = 0;
  let hintSeen = false;
  const f0 = await frames();
  while (Date.now() - t0 < 20_000 && !(await quiz.isVisible())) {
    await tapOnce();
    taps++;
    await page.waitForTimeout(500);
    hintSeen ||= await page.getByTestId("bc-mine-hint").isVisible();
  }
  const ms = Date.now() - t0;
  if (!(await quiz.isVisible())) {
    const f1 = await frames();
    throw new Error(`nincs kvíz ${ms} ms alatt: ${taps} koppintás, célkereszt-tipp ${hintSeen ? "megjelent" : "nem jelent meg"}, render-lépések ${f0} → ${f1}`);
  }
  return ms;
}

async function answerRight(page: Page): Promise<void> {
  await page.locator('[data-testid="bc-quiz"] [data-correct="true"]').first().tap();
}

test("Kockavadász: Bányász gomb érintéssel → 20 mp-en belül kvíz, helyes válasz után BLOKK 1/8", async ({ page }) => {
  await startLikeAChild(page);
  const box = (await page.getByRole("button", { name: "Bányász" }).boundingBox())!;
  const ms = await tapUntilQuiz(page, () => page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2));
  console.log(`BC_PROBE gomb: első kvíz ${ms} ms`);
  expect(ms).toBeLessThan(20_000);
  await answerRight(page);
  await expect(page.getByTestId("bc-quiz")).toBeHidden({ timeout: 15_000 });
  await expect(page.locator("body")).toContainText(/blokk\s*1\s*\/\s*8/i, { timeout: 15_000 });
  if (SHOT) await page.screenshot({ path: `${SHOT}/bc-after-first-block.png` });
});

test("Kockavadász: koppintás a vászon közepére érintéssel → 20 mp-en belül kvíz", async ({ page }) => {
  await startLikeAChild(page);
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  const ms = await tapUntilQuiz(page, () => page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2));
  console.log(`BC_PROBE vászon: első kvíz ${ms} ms`);
  expect(ms).toBeLessThan(20_000);
});
