import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * J7a — Tornado Hunter 200 javítások valódi érintéses úton (terv 5.7 „Javítás”, kanban #82):
 * a ⚓ csak a mérési sávban aktív (a sávon kívül letiltott és nem nyit kérdést), a sávban a kérdés nyílik és a jó
 * válasz horgonyoz, az eredményképernyőn látszik a pont-bontás (összege a pontszám), a garázs a közös hatás-számítás
 * sávjait mutatja. Képernyőkép: `GAME_MOBILE_SHOT_DIR` megadásakor oda is (K.1 3. pont).
 */

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const;

async function shot(page: Page, testInfo: TestInfo, state: string): Promise<void> {
  const vp = page.viewportSize();
  const name = `tornado-hunter-200-${vp?.width ?? 0}x${vp?.height ?? 0}-${state}.jpg`;
  await page.screenshot({ path: testInfo.outputPath(name), type: "jpeg", quality: 70 });
  const dir = process.env.GAME_MOBILE_SHOT_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70, scale: "css" });
  }
}

async function startPlaying(page: Page): Promise<void> {
  await page.goto("/games/tornado-hunter-200");
  await page.getByTestId("tornado-quick-start").click();
  const root = page.locator('[data-game="TornadoHunter200"]');
  await expect(root).toHaveAttribute("data-game-state", "playing", { timeout: 20_000 });
  await expect(page.locator("[data-tornado-play] canvas")).toBeVisible();
  const rotate = page.getByTestId("game-rotate-continue");
  if (await rotate.isVisible()) await rotate.click();
  await expect(page.getByTestId("tornado-touch-controls")).toBeVisible();
  await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function");
}

async function force(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate((p) => (window as unknown as GameTestWindow).__websuliGame?.forceState(p), patch);
}

/** Valódi érintés a gomb közepén (a letiltott gomb ugyanúgy nem kap eseményt, mint egy ujjra). */
async function tapCenter(page: Page, locator: ReturnType<Page["getByRole"]>): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, "a ⚓ gomb látszik").not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

for (const viewport of VIEWPORTS) {
  test.describe(`J7a ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("a ⚓ a mérési sávon kívül letiltott: koppintásra és F-re sem nyílik kérdés", async ({ page }, testInfo) => {
      await startPlaying(page);
      const anchor = page.getByRole("button", { name: "⚓", exact: true });
      await expect(anchor).toBeVisible();
      // A kezdőpont ~3,4 km-re van a tölcsértől: messze a sávon kívül.
      await expect(anchor).toBeDisabled();
      await expect(anchor).toHaveClass(/opacity-40/);
      await tapCenter(page, anchor);
      await page.waitForTimeout(400);
      await expect(page.getByTestId("tornado-quiz")).toHaveCount(0);
      await page.keyboard.press("f");
      await expect(page.getByText(/Túl messze vagy/)).toBeVisible();
      await expect(page.getByTestId("tornado-quiz")).toHaveCount(0);
      // Audit (#64): a „Menj közelebb” buborék nem takarhatja a céljelző nyilat és a távolság-feliratot.
      const guidance = await page.getByTestId("tornado-anchor-guidance").boundingBox();
      const toast = await page.getByText(/Túl messze vagy/).boundingBox();
      for (const id of ["tornado-target-marker", "tornado-target-marker-km"]) {
        const el = page.getByTestId(id);
        if (!guidance || (await el.count()) === 0 || !(await el.isVisible())) continue;
        const r = (await el.boundingBox())!;
        const overlap = r.x < guidance.x + guidance.width && r.x + r.width > guidance.x && r.y < guidance.y + guidance.height && r.y + r.height > guidance.y;
        expect(overlap, `${id} és a horgony-buborék fedi egymást`).toBe(false);
        if (toast) {
          const hitsToast = r.x < toast.x + toast.width && r.x + r.width > toast.x && r.y < toast.y + toast.height && r.y + r.height > toast.y;
          expect(hitsToast, `${id} és a „Túl messze” üzenet fedi egymást`).toBe(false);
        }
      }
      await shot(page, testInfo, "anchor-disabled");
    });

    test("a sávban a ⚓ aktív, a kérdés nyílik, a jó válasz horgonyoz, az eredményen ott a pont-bontás", async ({ page }, testInfo) => {
      await startPlaying(page);
      const anchor = page.getByRole("button", { name: "⚓", exact: true });
      await force(page, { nearTornadoKm: 0.65 });
      await expect(anchor).toBeEnabled({ timeout: 5_000 });
      await shot(page, testInfo, "anchor-ready");
      await tapCenter(page, anchor);
      const quiz = page.getByTestId("tornado-quiz");
      await expect(quiz).toBeVisible({ timeout: 5_000 });
      // SPEC-VÁLTOZÁS 2026-11-17 (terv 5.7, 9.; végrehajtás J7b 3.–4.: a megállító overlay megszűnt): a horgony-kérdés a közös,
      // nem blokkoló kérdés-sávon jön (gomb-mód); a fajtáját a kérdés mellett a „⚓ Horgonyzási kérdés” felirat mutatja.
      await expect(quiz).toHaveAttribute("data-mode", "buttons");
      await expect(page.getByTestId("tornado-question-kind")).toContainText("Horgonyzási kérdés");
      await shot(page, testInfo, "anchor-question");
      await quiz.locator('[data-correct="true"]').first().click();
      await expect(page.getByText(/Horgony rögzítve|Túl|Sáros|Hibás/).first()).toBeVisible({ timeout: 5_000 });
      const result = page.getByTestId("th-result");
      await expect(result).toBeVisible({ timeout: 10_000 });
      const breakdown = page.getByTestId("tornado-score-breakdown");
      await expect(breakdown).toBeVisible();
      const values = await breakdown.locator("dd").allTextContents();
      expect(values).toHaveLength(5);
      const sum = values.reduce((s, v) => s + Number(v.replace(/[^\d]/g, "")), 0);
      // A kijelzett szám számlálóval „felfut”; a végső pontszám az aria-címkében van.
      const label = (await result.locator(".game-result-score").getAttribute("aria-label")) ?? "";
      const score = Number(label.replace(/[^\d]/g, ""));
      expect(sum, "a bontás összege a pontszám").toBe(score);
      // Az eredménykártya a nézeten belül marad (a bontás nem tolja ki).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await shot(page, testInfo, "result-breakdown");
    });

    // SPEC-VÁLTOZÁS 2026-11-17 (terv 9., J5; a J7a ezt a J7b-nek adta át): hibás válaszra NEM nyílik magától kártya — a
    // helyes válasz a sávban látszik, a magyarázókártyát a „Miért?” nyitja (szünettel). A mérce nem lazul: a kártya elérhető.
    test("hibás horgony-válasz: blokkoló kártya nincs, a „Miért?” megnyitja a magyarázó kártyát", async ({ page }, testInfo) => {
      await startPlaying(page);
      await force(page, { nearTornadoKm: 0.65 });
      const anchor = page.getByRole("button", { name: "⚓", exact: true });
      await expect(anchor).toBeEnabled({ timeout: 5_000 });
      await tapCenter(page, anchor);
      const quiz = page.getByTestId("tornado-quiz");
      await expect(quiz).toBeVisible({ timeout: 5_000 });
      await quiz.locator('[data-correct="false"]').first().click();
      await expect(quiz.locator('[data-state="correct"]')).toHaveCount(1);
      await expect(page.locator('[role="dialog"]')).toHaveCount(0);
      await page.getByTestId("play-why").click();
      await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 5_000 });
      await shot(page, testInfo, "wrong");
    });
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`J7a garázs ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("a Vihargarázs a közös hatás-számítás nyolc sávját mutatja, nincs túlcsordulás", async ({ page }, testInfo) => {
      await page.goto("/games/tornado-hunter-200");
      await page.getByText("Vihargarázs").click();
      const detail = page.getByTestId("tornado-garage-detail");
      for (const label of ["Sebesség", "Gyorsulás", "Irányítás", "Tapadás", "Stabilitás", "Szélállóság", "Horgony", "Mérősáv"]) {
        await detail.getByText(label, { exact: true }).scrollIntoViewIfNeeded();
        await expect(detail.getByText(label, { exact: true })).toBeVisible();
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await shot(page, testInfo, "garage");
    });
  });
}
