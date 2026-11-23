import { devices, expect, test, type Page } from "@playwright/test";

import { emulateSafeArea, waitForStable } from "./support/game-mobile-quality";
import { expectMetaScreenOk, insetsFor, metaShot } from "./support/game-meta-quality";
import { playToResult } from "./support/duel-e2e";

test.use({ serviceWorkers: "block" });

/**
 * A játékok meta-képernyőinek (garázs, pályaválasztó, beállítás, ranglista, statisztika) mobil mérése érintős Pixel 7
 * profilban (docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md, „Mérő”; X1–X7: `support/game-meta-quality.ts`).
 * Első eset a Vihargarázs (tulajdonosi hibajelentés 2026-11-16, Android, álló nézet): a 412×800-as nézet a valódi
 * telefon címsorral / rendszersávokkal csökkentett magassága.
 */
test.use({ ...devices["Pixel 7"] });

const META_VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 412, height: 800 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
  { width: 915, height: 412 },
  // A valódi fekvő magasság a böngésző címsora miatt gyakran csak ~340–360 px (orkesztrátori review, #467).
  { width: 740, height: 360 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = { id: "fixture", isAdmin: true, firstName: "Teszt", classroom: 4, classrooms: [4] };
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

const TORNADO = "/games/tornado-hunter-200";

async function openTornadoMenu(page: Page): Promise<void> {
  await page.goto(TORNADO);
  await expect(page.getByTestId("tornado-quick-start")).toBeVisible({ timeout: 20_000 });
}

/** A menü „Beállítások” részében lévő gombhoz előbb a lenyílót kell kinyitni (StartScreen `<details>`). */
async function openMenuSettings(page: Page): Promise<void> {
  const summary = page.locator("details.game-start-settings > summary");
  if ((await page.locator("details.game-start-settings[open]").count()) === 0) await summary.tap();
}

/**
 * Valódi érintéses húzás felfelé (a tartalom lefelé görög): CDP `Input.dispatchTouchEvent` touchStart → 10 touchMove →
 * 3 álló touchMove (40 ms-onként, az ujj megáll: nincs lendület) → touchEnd — a böngésző ugyanúgy görget, mint ujjal (a `synthesizeScrollGesture` touch módja az emulált profilban nem
 * görgetett, mérve 2026-11-16).
 */
async function swipeUp(page: Page, x: number, y: number, distance: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - (distance * i) / 10 }] });
  }
  // Az ujj a végén megáll (mint egy gondos kéz): nulla sebességnél nincs lendület (fling). Lendület közben a Chromium a következő
  // koppintást a fling megállítására használja és nem ad `click`-et — a lap aljánál a fling a határon „fut”, a pozíció nem változik,
  // ezért pozíció-figyeléssel nem várható ki (2026-11-23: lassabb gépen a Vissza és az utolsó jármű koppintása elnyelődött).
  const endY = y - distance;
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(40);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: endY }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await waitScrollSettled(page);
}

/**
 * A görgetés végéig vár: a lap és minden görgethető elem pozíciója 3 egymást követő mintán (50 ms) azonos; ha a határidőig
 * nem nyugszik meg, hibával áll le (nem koppint mozgó lapra). A lendület (fling) ellen nem ez véd — a határon futó fling a
 * pozíciót nem mozdítja —, hanem a `swipeUp` álló touchMove-jai.
 */
async function waitScrollSettled(page: Page, timeoutMs = 3000): Promise<void> {
  const sample = () => page.evaluate(() => {
    const pos = [window.scrollX, window.scrollY];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) pos.push(el.scrollTop, el.scrollLeft);
    }
    return pos.join(",");
  });
  const deadline = Date.now() + timeoutMs;
  let last = await sample();
  let stable = 0;
  while (stable < 3 && Date.now() < deadline) {
    await page.waitForTimeout(50);
    const now = await sample();
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
  if (stable < 3) throw new Error(`a görgetés ${timeoutMs} ms alatt sem nyugodott meg`);
}

async function atPageBottom(page: Page): Promise<boolean> {
  return page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2);
}

/** Az elem teljesen a nézetben (és ha `container` adott, annak dobozán belül) van, a biztonsági sáv fölött. */
async function expectFullyInside(page: Page, testId: string, container: string | null, safeBottom = 0): Promise<void> {
  const r = (await page.getByTestId(testId).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(r.y, `${testId} teteje`).toBeGreaterThanOrEqual(-1);
  expect(r.y + r.height, `${testId} alja`).toBeLessThanOrEqual(vp.height - safeBottom + 1);
  if (container) {
    const c = (await page.getByTestId(container).boundingBox())!;
    expect(r.y, `${testId} a(z) ${container} tetején belül`).toBeGreaterThanOrEqual(c.y - 1);
    expect(r.y + r.height, `${testId} a(z) ${container} alján belül`).toBeLessThanOrEqual(c.y + c.height + 1);
  }
}

test.describe("Vihargarázs", () => {
  for (const viewport of META_VIEWPORTS) {
    test(`${viewport.width}x${viewport.height}: X1–X7, érintéses végigjárás (szűrő → jármű → fejlesztés → vissza)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const insets = insetsFor(viewport);
      await openTornadoMenu(page);
      await page.getByRole("button", { name: "Vihargarázs" }).tap();
      await expect(page.getByRole("heading", { name: "Vihargarázs" })).toBeVisible();
      await emulateSafeArea(page, insets);
      await metaShot(page, "tornado-garazs");
      await metaShot(page, "tornado-garazs-teljes", true);
      await expectMetaScreenOk(page, "Vihargarázs nyitva", { insets });

      // Szűrő → egy másik (meg nem vett) jármű → vissza a sajátra → fejlesztés megvétele.
      await page.getByRole("button", { name: /^Felderítő/ }).tap();
      await expect(page.getByTestId("tornado-garage-filter-scout")).toHaveAttribute("aria-pressed", "true");
      const tiles = page.locator('[data-testid^="tornado-garage-vehicle-"]');
      await tiles.nth(1).tap();
      await expect(tiles.nth(1)).toHaveAttribute("aria-pressed", "true");
      await expectMetaScreenOk(page, "Vihargarázs, Felderítő szűrő, idegen jármű", { insets });
      await tiles.nth(0).tap();
      await expect(page.getByTestId("tornado-garage-upgrade-engine")).toBeVisible();
      await expect(page.getByTestId("tornado-garage-upgrade-engine")).toContainText("900 SC");
      await page.getByTestId("tornado-garage-upgrade-engine").tap();
      await expect(page.getByTestId("tornado-coins")).toContainText("300 SC");
      await expect(page.getByTestId("tornado-garage-upgrade-engine")).toHaveAttribute("data-level", "1");
      // 300 SC-ből a Motor 2. szintje (1710 SC) nem fér bele: ez a soron is látszik.
      await expect(page.getByTestId("tornado-garage-upgrade-engine")).toHaveAttribute("data-affordable", "false");
      await metaShot(page, "tornado-garazs-fejlesztve");
      await expectMetaScreenOk(page, "Vihargarázs fejlesztés után", { insets });

      // Kevés SC: a sor koppintása megmondja, mennyi hiányzik (1710 − 300 = 1410), az egyenleg nem változik.
      await page.getByTestId("tornado-garage-upgrade-engine").tap();
      await expect(page.getByTestId("tornado-garage-flash")).toContainText(/Még 1\s?410 SC hiányzik/);
      await expect(page.getByTestId("tornado-coins")).toContainText("300 SC");

      // Valódi érintéses görgetés (CDP touch-gesztus, nem programbeli scrollTop): a lap / a hasábok ALJÁIG.
      const landscape = viewport.width > viewport.height;
      if (landscape) {
        await expect(page.getByTestId("tornado-garage")).toHaveAttribute("data-layout", "landscape");
        for (const pane of ["tornado-garage-side", "tornado-garage-list"]) {
          const box = (await page.getByTestId(pane).boundingBox())!;
          await expect(page.getByTestId(pane), `${pane}: alul jelzi a folytatást`).toHaveAttribute("data-scroll-hint", "more");
          for (let i = 0; i < 40 && (await page.getByTestId(pane).getAttribute("data-scroll-hint")) !== "end"; i++) {
            await swipeUp(page, box.x + box.width / 2, box.y + box.height * 0.8, Math.min(240, box.height * 0.6));
          }
          await expect(page.getByTestId(pane), `${pane}: érintéssel az aljáig görgethető`).toHaveAttribute("data-scroll-hint", "end");
        }
        await metaShot(page, "tornado-garazs-hasabok-alja");
        // Az utolsó fejlesztés-sor és az utolsó jármű a hasáb aljára görgetve teljesen látszik és koppintható.
        await expectFullyInside(page, "tornado-garage-upgrade-instruments", "tornado-garage-side");
        await page.getByTestId("tornado-garage-upgrade-instruments").tap({ trial: true });
        const lastTile = page.locator('[data-testid="tornado-garage-list"] [data-testid^="tornado-garage-vehicle-"]').last();
        await expectFullyInside(page, (await lastTile.getAttribute("data-testid"))!, "tornado-garage-list");
        await lastTile.tap();
        await expect(lastTile).toHaveAttribute("aria-pressed", "true");
      } else {
        for (let i = 0; i < 20 && !(await atPageBottom(page)); i++) await swipeUp(page, viewport.width / 2, viewport.height * 0.75, viewport.height * 0.5);
        expect(await atPageBottom(page), "álló nézet: a lap érintéssel az aljáig görgethető").toBe(true);
        await expectFullyInside(page, "tornado-garage-upgrade-instruments", null, insets.bottom);
      }

      await page.getByRole("button", { name: "Vissza" }).first().tap();
      await expect(page.getByTestId("tornado-quick-start")).toBeVisible();
    });
  }
});

test.describe("Viharvadász menü és a közös „Hogyan játsszak?” ablak", () => {
  for (const viewport of [META_VIEWPORTS[0], META_VIEWPORTS[3], META_VIEWPORTS[4]]) {
    test(`menü, Beállítások nyitva ${viewport.width}x${viewport.height}: X1–X7 (az „Aktuális jármű” képe nem üres)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const insets = insetsFor(viewport);
      await openTornadoMenu(page);
      await openMenuSettings(page);
      await expect(page.getByTestId("tornado-vehicle-art").first()).toBeVisible();
      await emulateSafeArea(page, insets);
      await metaShot(page, "tornado-menu-beallitasok", true);
      await expectMetaScreenOk(page, "Viharvadász menü, Beállítások nyitva", { insets });
    });

    for (const game of [
      { id: "tornado-hunter-200", path: TORNADO, start: "tornado-quick-start" },
      { id: "block-craft-quiz", path: "/games/block-craft-quiz", start: "bc-start" },
    ]) {
      test(`${game.id} „Hogyan játsszak?” ${viewport.width}x${viewport.height}: X1–X7 (bezáró ≥ 44 px, a sávon belül)`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const insets = insetsFor(viewport);
        await page.goto(game.path);
        await expect(page.getByTestId(game.start)).toBeVisible({ timeout: 20_000 });
        await emulateSafeArea(page, insets);
        await openMenuSettings(page);
        const help = page.getByRole("button", { name: /Hogyan játsszak/ }).first();
        await help.scrollIntoViewIfNeeded();
        await help.tap();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        // A belépő animáció (zoom-in) után mérünk: a doboz 4 képkockán át változatlan.
        await waitForStable(page, '[role="dialog"]');
        await metaShot(page, `${game.id}-hogyan`);
        await expectMetaScreenOk(page, `${game.id} „Hogyan játsszak?”`, { insets, scope: '[role="dialog"]' });
        await page.getByRole("button", { name: "Close" }).tap();
        await expect(dialog).toHaveCount(0);
      });
    }
  }
});

test.describe("Viharvadász további meta-képernyői", () => {
  for (const viewport of [META_VIEWPORTS[0], META_VIEWPORTS[3], META_VIEWPORTS[4]]) {
    for (const s of [
      { name: "Szintek", open: async (page: Page) => page.getByRole("button", { name: /Vadászat indítása/ }).tap(), heading: /Szintek/ },
      { name: "Rekordok", open: async (page: Page) => { await openMenuSettings(page); await page.getByRole("button", { name: "Rekordok" }).tap(); }, heading: /Rekord/ },
      { name: "Statisztika", open: async (page: Page) => { await openMenuSettings(page); await page.getByRole("button", { name: "Statisztika" }).tap(); }, heading: /Statisztika/ },
      { name: "Beállítások", open: async (page: Page) => { await openMenuSettings(page); await page.getByRole("button", { name: /Iskolai szint/ }).tap(); }, heading: /Beállítás/ },
    ]) {
      test(`${s.name} ${viewport.width}x${viewport.height}: X1–X7`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const insets = insetsFor(viewport);
        await openTornadoMenu(page);
        await s.open(page);
        await expect(page.getByRole("heading", { name: s.heading }).first()).toBeVisible();
        await emulateSafeArea(page, insets);
        await metaShot(page, `tornado-${s.name.toLowerCase()}`);
        await expectMetaScreenOk(page, `Viharvadász ${s.name}`, { insets });
      });
    }
  }
});

/**
 * JM3a-2: a Párbaj nem-játék képernyői (kezdő, beállítás, gépi győzteshirdetés) a meta-mérő alatt — itt az API hálózat nélkül
 * (a `/api/rt/status` üres → online réteg ki), ahogy élesben `MP_MODE=off` mellett. Az online képernyőket (váróterem, megtelt
 * szoba, online győzteshirdetés, visszavágó-kérés) ugyanez a mérő a valódi szerveren méri: `tests/duel-online.spec.ts`.
 */
test.describe("Párbaj meta-képernyői (gépi mód)", () => {
  for (const viewport of [META_VIEWPORTS[0], META_VIEWPORTS[3], META_VIEWPORTS[4]]) {
    test(`kezdő, beállítás és gépi győzteshirdetés ${viewport.width}x${viewport.height}: X1–X8`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      const insets = insetsFor(viewport);
      await page.goto("/games/parbaj?duelSpeed=fast");
      await expect(page.getByTestId("duel-home")).toBeVisible({ timeout: 20_000 });
      await waitForStable(page, "[data-game-start]");
      await emulateSafeArea(page, insets);
      await metaShot(page, "parbaj-kezdo", true);
      await expectMetaScreenOk(page, "Párbaj kezdő", { insets });
      await page.getByTestId("duel-bot").tap();
      await expect(page.getByTestId("duel-setup")).toBeVisible();
      await metaShot(page, "parbaj-beallitas", true);
      await expectMetaScreenOk(page, "Párbaj beállítás (gép ellen)", { insets });
      await page.getByTestId("duel-go").tap();
      await playToResult(page, 0);
      await waitForStable(page, '[data-testid="duel-result"]');
      await metaShot(page, "parbaj-gepi-eredmeny", true);
      await expectMetaScreenOk(page, "Párbaj gépi győzteshirdetés", { insets });
    });
  }
});
