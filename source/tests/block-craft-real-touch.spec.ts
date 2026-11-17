import { devices, expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block", ...devices["Pixel 7"], viewport: { width: 390, height: 844 } });

const SHOT = process.env.BC_PROBE_SHOT_DIR;

/**
 * E24 / 3. pont — éles próba: „180 mp alatt egyetlen blokk sem gyűlt (BLOKK 0/8), kvíz sem jött”.
 * VALÓDI érintéses út, teszt-kampó (`__websuliGame.forceState`) nélkül: a gyerek koppint a „Bányász” gombra
 * vagy a vászonra, és a blokk megérkezik. A meglévő `block-craft-quiz` eset kampóval jut a kérdésig, ezért a valódi
 * út csak itt van tesztelve.
 *
 * SPEC-VÁLTOZÁS 2026-11-17 (docs/specs/2026-11-16-jatekok-jatekelmeny.md 5.3 „Megszűnik: kvíz minden blokkra”; végrehajtás
 * J3a 3.): a sima blokk KÉRDÉS NÉLKÜL bányászható (koppintós módban 3 ütés = 1 blokk), a kérdés a rúnaércnél jön. A mérce
 * nem lazul: a valódi érintéses útnak továbbra is 20 mp-en belül kézzelfogható eredményt kell adnia — most a hotbarba
 * került blokkot (a régi „kvíz + helyes válasz → BLOKK 1/8” helyett), és kérdés közben nem nyílhat modális réteg.
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
 * A gyerek addig koppint, amíg egy blokk a hotbarba nem kerül — legfeljebb a mért 20 mp-es kereten belül (a tesztek ezt
 * az időt mérik). #58 (run 43916330845): a darabszám-korlát a CI szoftveres WebGL-jén (~1 s / koppintás) a 20 mp-es elvárás
 * előtt feladta volna. Bukáskor diagnosztika: a célkereszt-tipp megjelent-e (= nem volt célzott blokk) és fut-e a
 * render-ciklus (`probe().frames`, teszt-kampós buildben).
 */
async function tapUntilBlock(page: Page, tapOnce: () => Promise<void>): Promise<number> {
  const t0 = Date.now();
  const hotbar = page.getByTestId("bc-hotbar");
  const frames = () =>
    page.evaluate(() => Number((window as unknown as { __websuliGame?: { probe?: () => Record<string, number | string | null> } }).__websuliGame?.probe?.().frames ?? Number.NaN));
  let taps = 0;
  let hintSeen = false;
  const f0 = await frames();
  while (Date.now() - t0 < 20_000 && !(await hotbar.isVisible())) {
    await tapOnce();
    taps++;
    await page.waitForTimeout(300);
    hintSeen ||= await page.getByTestId("bc-mine-hint").isVisible();
  }
  const ms = Date.now() - t0;
  if (!(await hotbar.isVisible())) {
    const f1 = await frames();
    throw new Error(`nincs blokk a hotbarban ${ms} ms alatt: ${taps} koppintás, célkereszt-tipp ${hintSeen ? "megjelent" : "nem jelent meg"}, render-lépések ${f0} → ${f1}`);
  }
  return ms;
}

test("Kockavadász: Bányász gomb érintéssel → 20 mp-en belül kibányászott blokk a hotbarban, kérdés nélkül", async ({ page }) => {
  await startLikeAChild(page);
  const box = (await page.getByRole("button", { name: "Bányász" }).boundingBox())!;
  const ms = await tapUntilBlock(page, () => page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2));
  console.log(`BC_PROBE gomb: első blokk ${ms} ms`);
  expect(ms).toBeLessThan(20_000);
  await expect(page.getByTestId("bc-hotbar").getByRole("button").first()).toContainText(/×\s*1/);
  await expect(page.locator('[role="dialog"]'), "sima blokknál nincs modális kvíz").toHaveCount(0);
  if (SHOT) await page.screenshot({ path: `${SHOT}/bc-after-first-block.png` });
});

test("Kockavadász: koppintás a vászon közepére érintéssel → 20 mp-en belül kibányászott blokk", async ({ page }) => {
  await startLikeAChild(page);
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  const ms = await tapUntilBlock(page, () => page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2));
  console.log(`BC_PROBE vászon: első blokk ${ms} ms`);
  expect(ms).toBeLessThan(20_000);
});
