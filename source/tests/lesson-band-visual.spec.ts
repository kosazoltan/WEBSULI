import { expect, test, type Page } from "@playwright/test";

/**
 * LS-9 — a korosztályos vizuális rendszer VALÓDI renderben.
 *
 * A mérőoldal `?classroom=N` paraméterrel más bandet kap; a tokenek, a mozgás-kapu, a
 * haladásjelző és a responsive viselkedés csak kirajzolva mérhető. Minden bandről
 * teljes-oldalas képernyőkép készül a `test-results/ls-9/` alá — a képet meg is kell
 * NÉZNI, a szám önmagában nem bizonyíték (#197 tanulság).
 */

const BANDS = [
  { classroom: 2, band: "kid" },
  { classroom: 7, band: "teen" },
  { classroom: 11, band: "senior" },
] as const;

const VIEWPORTS = [360, 390, 768, 1280] as const;

async function openProbe(page: Page, classroom: number) {
  await page.goto(`/__lesson-runtime-probe?classroom=${classroom}`);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('[data-testid="lesson-runtime"]');
}

const accentOf = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-band]") as HTMLElement | null;
    return root ? getComputedStyle(root).getPropertyValue("--lesson-accent").trim() : null;
  });

test("a classroom a várt bandet és három különböző akcentszínt ad", async ({ page }) => {
  const accents: string[] = [];
  for (const { classroom, band } of BANDS) {
    await openProbe(page, classroom);
    await expect(page.locator(`[data-band="${band}"]`)).toHaveCount(1);
    const a = await accentOf(page);
    expect(a, `${band}: --lesson-accent üres`).toBeTruthy();
    accents.push(a!);
  }
  expect(new Set(accents).size, `akcentek: ${accents.join(" | ")}`).toBe(3);
});

for (const { classroom, band } of BANDS) {
  test(`${band}: nincs vízszintes túlfolyás és minden érintési cél ≥ 44 px (360/390/768/1280)`, async ({ page }) => {
    for (const w of VIEWPORTS) {
      await page.setViewportSize({ width: w, height: 900 });
      // 3 szakasz: a haladásjelző csak így renderel — élesben 6×8 px-es lépés-link bukott,
      // amit az egy-szakaszos mérőoldal nem tudott megmutatni.
      await page.goto(`/__lesson-runtime-probe?classroom=${classroom}&sections=3`);
      await page.waitForLoadState("networkidle");
      await page.waitForSelector('[data-testid="lesson-progress"]');
      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        const small = [...document.querySelectorAll('[data-testid="lesson-runtime"] button, [data-testid="lesson-runtime"] a, [data-testid="lesson-runtime"] [role="button"]')]
          .map((el) => ({ h: el.getBoundingClientRect().height, t: (el.textContent ?? "").trim().slice(0, 30) }))
          .filter((x) => x.h > 0 && x.h < 44);
        const clipped = [...document.querySelectorAll('[data-testid="lesson-runtime"] *')]
          .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible")
          .map((el) => el.tagName + ":" + (el.textContent ?? "").trim().slice(0, 30));
        return { overflow: doc.scrollWidth - doc.clientWidth, small, clipped };
      });
      expect(m.overflow, `${band}@${w}: túlfolyás`).toBeLessThanOrEqual(1);
      expect(m.small, `${band}@${w}: kicsi érintési célok`).toEqual([]);
      expect(m.clipped, `${band}@${w}: levágott elemek`).toEqual([]);
      await page.screenshot({ path: `test-results/ls-9/${band}-${w}.png`, fullPage: true });
    }
  });
}

test("a haladásjelző minden szakaszt listáz; egyetlen szakasznál nem jelenik meg", async ({ page }) => {
  await openProbe(page, 7);
  const sections = await page.locator('[data-testid^="lesson-section-"]').count();
  const progress = page.getByTestId("lesson-progress");
  if (sections >= 2) {
    await expect(progress).toBeVisible();
    await expect(progress.locator("[data-progress-step]")).toHaveCount(sections);
  } else {
    await expect(progress).toHaveCount(0);
  }
  // A mérőoldal egy-szakaszos leckéje a "nincs haladás egy lépésből" ágat bizonyítja;
  // a ?sections=3 kapcsoló a többszakaszos ágat (a probe sokszorozza a szakaszt).
  await page.goto("/__lesson-runtime-probe?classroom=7&sections=3");
  await page.waitForSelector('[data-testid="lesson-runtime"]');
  await expect(page.getByTestId("lesson-progress").locator("[data-progress-step]")).toHaveCount(3);
});

test("a recap kártyákat rajzol, nem listát", async ({ page }) => {
  await openProbe(page, 2);
  const recap = page.locator('[data-block="recap"]');
  await expect(recap.locator("[data-recap-item]")).toHaveCount(2);
  await expect(recap.locator("li")).toHaveCount(0);
});

test("prefers-reduced-motion: reduce → 0 animált elem", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openProbe(page, 2);
    const n = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="lesson-runtime"] *')].filter((e) => getComputedStyle(e).animationName !== "none").length);
    expect(n).toBe(0);
});

test("no-preference → legalább 1 animált elem (VAN animáció, és kapuzott)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openProbe(page, 2);
    const n = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="lesson-runtime"] *')].filter((e) => getComputedStyle(e).animationName !== "none").length);
    expect(n).toBeGreaterThan(0);
});
