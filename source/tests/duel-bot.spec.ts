/**
 * JM3a — Párbaj a GÉP ellen (terv D22): az online réteg KIKAPCSOLT állapotában (az e2e-szerver `MP_MODE` nélkül fut, mint
 * élesben ma) a párbaj a gépi ellenféllel játszható. Valódi érintéssel (Pixel 7 profil, `tap`), teszt-kampó nélküli
 * vezérléssel: belépő a játéklistán → kezdő → beállítás → 3-2-1 → körök → felfedés → győzteshirdetés → visszavágó.
 * Mobil-minőség (M1–M3) és a kérdéskártya DOM-mérése a bank leghosszabb tételeivel, 360×640 / 390×844 / 844×390 nézetben.
 * (`?duelSpeed=fast` csak a teszt-kampós buildben rövidíti a 3-2-1-et és a felfedést.)
 */
import { devices, expect, test } from "@playwright/test";

import { emulateSafeArea, safeAreaViolations } from "./support/game-mobile-quality";
import { assertMobileQuality, assertQuestionFits, longestBankItems, playToResult, probe, shot } from "./support/duel-e2e";

test.use({ ...devices["Pixel 7"], serviceWorkers: "block" });

const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("websuli.classroomGrade", "4");
    } catch {
      /* tároló nélkül is */
    }
  });
});

for (const vp of VIEWPORTS) {
  test(`gépi párbaj érintéssel ${vp.width}×${vp.height}: belépő → kezdő → beállítás → meccs → győzteshirdetés → visszavágó`, async ({ page }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(vp);
    await page.goto("/games");
    const entry = page.getByTestId("games-duel-entry");
    await expect(entry).toBeVisible({ timeout: 30_000 });
    await expect(entry).toContainText("Gép ellen");
    await entry.tap();
    await expect(page).toHaveURL(/\/games\/parbaj$/);
    await expect(page.getByTestId("duel-home")).toBeVisible();
    // Kikapcsolt online réteg: nincs szobanyitás / csatlakozás gomb, a gép elleni játék az elsődleges.
    await expect(page.getByTestId("duel-join")).toHaveCount(0);
    await expect(page.getByTestId("duel-create")).toHaveCount(0);
    await page.waitForTimeout(500);
    await assertMobileQuality(page, "kezdő");
    await shot(page, "bot-home");

    await page.goto("/games/parbaj?duelSpeed=fast");
    await page.getByTestId("duel-bot").tap();
    await expect(page.getByTestId("duel-setup")).toBeVisible();
    await page.getByTestId("duel-grade-4").tap();
    await page.getByTestId("duel-skill-easy").tap();
    await assertMobileQuality(page, "beállítás");
    await shot(page, "bot-setup");
    await page.getByTestId("duel-go").tap();

    await expect(page.getByTestId("duel-countdown")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("duel-rival")).toContainText("Gép · Könnyű");
    await shot(page, "bot-countdown");

    let shotQuestion = false;
    let shotReveal = false;
    await playToResult(page, 0, async (round) => {
      // A „Rögzítve ✓ Várjuk a gépet…” csak addig látszik, amíg a gép nem válaszolt — ha már válaszolt, azonnal felfedés jön.
      if (!shotQuestion && (await page.getByTestId("duel-locked").isVisible())) {
        shotQuestion = true;
        await shot(page, "bot-locked");
      }
      if (!shotReveal && round >= 2) {
        await expect(page.getByTestId("duel-verdict")).toBeVisible({ timeout: 15_000 });
        shotReveal = true;
        await assertMobileQuality(page, "felfedés");
        await shot(page, "bot-reveal");
      }
    });
    const res = page.getByTestId("duel-result");
    await expect(page.getByTestId("duel-winner")).toBeVisible();
    await expect(page.getByTestId("duel-result-reason")).toContainText("Gyakorló meccs a gép ellen");
    await expect(page.getByTestId("duel-stats-me")).toBeVisible();
    await expect(page.getByTestId("duel-stats-rival")).toContainText("Gép");
    await page.waitForTimeout(700);
    await assertMobileQuality(page, "eredmény");
    await shot(page, "bot-result");
    expect(await res.getAttribute("data-won")).toMatch(/true|false/);

    await page.getByTestId("duel-rematch").tap();
    await expect(page.getByTestId("duel-countdown")).toBeVisible({ timeout: 10_000 });
    expect((await probe(page)).kind).toBe("bot");
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("kérdés közben: M1–M3, biztonsági sáv, és a bank leghosszabb tételei mindhárom nézetben elférnek (DOM-mérés)", async ({ page }) => {
  test.setTimeout(150_000);
  const items = longestBankItems();
  for (const [i, item] of items.entries()) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.addInitScript((q) => {
        (window as unknown as { __duelForceQuestion?: unknown }).__duelForceQuestion = q;
      }, item);
      await page.goto("/games/parbaj?duelSpeed=fast");
      await page.getByTestId("duel-bot").tap();
      await page.getByTestId("duel-go").tap();
      await expect(page.getByTestId("duel-option-0")).toBeEnabled({ timeout: 15_000 });
      await page.waitForTimeout(250);
      await assertQuestionFits(page, `tétel ${i} ${vp.width}x${vp.height} kérdés`);
      await assertMobileQuality(page, `tétel ${i} ${vp.width}x${vp.height} kérdés`);
      if (i === 0) await shot(page, "bot-question-longest");
      await emulateSafeArea(page, { top: 24, right: vp.width > vp.height ? 32 : 0, bottom: 20, left: vp.width > vp.height ? 32 : 0 });
      await page.waitForTimeout(150);
      expect(await safeAreaViolations(page, { top: 24, right: vp.width > vp.height ? 32 : 0, bottom: 20, left: vp.width > vp.height ? 32 : 0 })).toEqual([]);
      await page.getByTestId("duel-option-1").tap();
      await expect(page.getByTestId("duel-verdict")).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(200);
      await assertQuestionFits(page, `tétel ${i} ${vp.width}x${vp.height} felfedés`);
      if (i === 0) await shot(page, "bot-reveal-longest");
    }
  }
});

test("kilépés megerősítéssel a meccs közben: „Maradok” folytatja, „Kilépek” a kezdőre visz", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games/parbaj?duelSpeed=fast");
  await page.getByTestId("duel-bot").tap();
  await page.getByTestId("duel-go").tap();
  await expect(page.getByTestId("duel-option-0")).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("duel-exit").tap();
  await expect(page.getByTestId("duel-exit-confirm")).toBeVisible();
  await shot(page, "bot-exit-confirm");
  await page.getByTestId("duel-exit-stay").tap();
  await expect(page.getByTestId("duel-exit-confirm")).toHaveCount(0);
  await page.getByTestId("duel-exit").tap();
  await page.getByTestId("duel-exit-leave").tap();
  await expect(page.getByTestId("duel-home")).toBeVisible();
});
