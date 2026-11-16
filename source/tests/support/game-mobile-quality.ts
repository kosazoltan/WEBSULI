import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { isBenignWebglEnvWarning } from "./webgl-noise";

/**
 * S2 — a hét játék közös mobil-minőségi mérése (terv M1–M11; végrehajtás K.4, K.7.3, S2 5. lépés).
 *
 * Játékonként egy esetfájl (`tests/game-mobile-cases/<id>.ts`). `status: "baseline"` → csak a ma is teljesülő
 * alap-ellenőrzés; `status: "full"` → a teljes mérés. A játékszelet (S6–S12) a saját esetét állítja "full"-ra.
 *
 * Képernyőkép: mindig a `testInfo.outputPath()` alá; ha a `GAME_MOBILE_SHOT_DIR` környezeti változó meg van
 * adva, oda is `<id>-<szélesség>x<magasság>-<állapot>.jpg` néven (JPEG 70 — K.4, a commitolt bizonyítékhoz).
 */

export type GameMobileCase = {
  /** Játékazonosító, pl. "tornado-hunter-200". */
  id: string;
  /** "/games/<id>" */
  path: string;
  status: "baseline" | "full";
  /** Ahogy a game-viewport-experience.spec.ts MENU_GAMES-e. */
  startTestId?: string;
  startName?: RegExp;
  /** Az indítás utáni játszható állapot jele. */
  playReady: (page: Page) => Promise<void>;
  /** Érintővezérlő testid (Tornado: tornado-touch-controls; Aszteroida: sa-touch-controls; …). */
  touchControlsTestId?: string;
  /** Ahogy a game-win-paths.spec.ts GAMES-e. */
  resultForce: Record<string, unknown>;
  resultTestId: string;
  /** Rossz válasz kiváltása (M9, M10); hiányában a két mérés nem fut, és az S13 őr ezt hibának veszi. */
  answerWrong?: (page: Page) => Promise<void>;
  orientation?: "any" | "landscape";
};

export type SafeInsets = { top: number; right: number; bottom: number; left: number };

export const MOBILE_VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const;

const WEBGL_ERROR = /WebGL|GL_|CONTEXT_LOST/;

/* ------------------------------ mérő-segédek ------------------------------ */

/** Oldalgörgetés: a dokumentum görgethető túllógása px-ben (M1). */
export async function measureOverflow(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
}

/**
 * Megvárja, hogy a belépő animációk (PauseMenu / ResultScreen: scale 0,9 → 1) lecsengjenek: a megadott elemek
 * mérete és helye 4 egymást követő képkockán azonos, és nincs futó Web Animation. Nem fix `waitForTimeout`;
 * a mérce (≥ 48 px) nem lazul, csak a mérés ideje kerül az animáció utánra.
 */
export async function waitForStable(page: Page, selector: string, timeout = 5_000): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const w = window as unknown as { __stableKey?: string; __stableN?: number };
      const els = Array.from(document.querySelectorAll(sel));
      const key = els
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${r.x.toFixed(2)},${r.y.toFixed(2)},${r.width.toFixed(2)},${r.height.toFixed(2)}`;
        })
        .join("|");
      const running = els.some((el) => el.getAnimations({ subtree: true }).some((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity));
      if (!running && key !== "" && key === w.__stableKey) w.__stableN = (w.__stableN ?? 0) + 1;
      else w.__stableN = 0;
      w.__stableKey = key;
      return (w.__stableN ?? 0) >= 4;
    },
    selector,
    { polling: "raf", timeout },
  );
}

/**
 * `waitForStable`, de csak ha a szelektorra van találat (S13 / B5): a közös `StartScreen` (`[data-game-start]`)
 * belépő animációja alatt a gombok még kisebbnek látszanak; a régi, saját menüs kezdőképernyőn nincs ilyen gyökér,
 * ott nincs mire várni (a `waitForStable` üres találatra sosem lenne stabil).
 */
export async function settleIfPresent(page: Page, selector: string): Promise<void> {
  if ((await page.locator(selector).count()) > 0) await waitForStable(page, selector);
}

/**
 * Állapotonként az a gyökér, amelynek beállt állapotát a képernyőkép előtt megvárjuk (B5).
 *
 * A „play” (és a „quiz”) állapot SZÁNDÉKOSAN nincs itt (main CI #437 után, b5041240: a Kockavadász 3 nézetben 3
 * újrapróbán bukott): futó játékban a HUD jogosan mozog folyamatosan — másodpercenként új időérték, ehhez a
 * `.game-hud-progress-fill` 0,25 s-os `transform`-átmenete és a változott stat rugós „pop”-animációja. A szoftveres
 * WebGL-es CI-gépen a 3D jelenet mellett kevés rAF-képkocka fut, így a tick-ek között nincs 4 animációmentes képkocka,
 * és a `waitForStable` 5 s után időtúllépéssel bukik. Élő játékot nem lehet „beállt” állapotban fotózni; a játék
 * közbeni M2/M3 mérés amúgy sem várt erre (a mérce nem változik), csak a képernyőkép időzítése.
 */
const SETTLE_SELECTOR: Record<string, string> = {
  start: "[data-game-start]",
  pause: '[data-testid="game-pause-menu"]',
  result: "[data-game-result]",
};

/** Látható kattintható elemek, amelyek szélessége vagy magassága < `min` (alap 48; M2). */
export async function smallTargets(
  page: Page,
  min = 48,
): Promise<Array<{ label: string; w: number; h: number; testid: string | null }>> {
  return page.evaluate((limit) => {
    const out: Array<{ label: string; w: number; h: number; testid: string | null }> = [];
    const nodes = document.querySelectorAll<HTMLElement>('button, a[href], [role="button"], input, select, summary');
    for (const el of Array.from(nodes)) {
      if (el.closest('[aria-hidden="true"]')) continue;
      if ((el as HTMLButtonElement).disabled) continue;
      if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.width < limit || r.height < limit) {
        const label = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 60);
        out.push({ label, w: Math.round(r.width), h: Math.round(r.height), testid: el.getAttribute("data-testid") });
      }
    }
    return out;
  }, min);
}

/** Látható, nem üres szövegek, amelyek szülőjének számított betűmérete < `min` (alap 12; M3). */
export async function smallFonts(page: Page, min = 12): Promise<Array<{ text: string; px: number }>> {
  return page.evaluate((limit) => {
    const out: Array<{ text: string; px: number }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent || "").trim();
      if (!text) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest('[aria-hidden="true"], script, style, noscript')) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const r = parent.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const px = parseFloat(style.fontSize);
      if (px < limit) out.push({ text: text.slice(0, 60), px });
    }
    return out;
  }, min);
}

/** A biztonsági sáv emulálása: a `--game-safe-*` változók felülírása (a keret csak ezeket olvassa). */
export async function emulateSafeArea(page: Page, insets: SafeInsets): Promise<void> {
  await page.addStyleTag({
    content: `:root{--game-safe-top:${insets.top}px;--game-safe-right:${insets.right}px;--game-safe-bottom:${insets.bottom}px;--game-safe-left:${insets.left}px}`,
  });
}

/** A `[data-game-hud]` és `[data-game-controls]` elemek doboza kilóg-e a sávval szűkített nézetből (1 px tűrés; M4). */
export async function safeAreaViolations(page: Page, insets: SafeInsets): Promise<string[]> {
  return page.evaluate((s) => {
    const out: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tol = 1;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-game-hud], [data-game-controls]"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const name = el.hasAttribute("data-game-hud") ? "hud" : `controls:${el.getAttribute("data-testid") ?? el.className}`;
      if (r.top < s.top - tol) out.push(`${name} top ${Math.round(r.top)} < ${s.top}`);
      if (r.left < s.left - tol) out.push(`${name} left ${Math.round(r.left)} < ${s.left}`);
      if (r.right > vw - s.right + tol) out.push(`${name} right ${Math.round(r.right)} > ${vw - s.right}`);
      if (r.bottom > vh - s.bottom + tol) out.push(`${name} bottom ${Math.round(r.bottom)} > ${vh - s.bottom}`);
    }
    return out;
  }, insets);
}

/** A lap háttérbe küldése és visszahozása (visibilitychange hidden → 300 ms → visible; M6). */
export async function hideAndShowPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** `navigator.vibrate` rögzítése a `window.__vibrateCalls` tömbbe (M10). Navigáció ELŐTT hívandó. */
export async function stubVibrate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __vibrateCalls?: unknown[] };
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (p: unknown) => {
        (w.__vibrateCalls ??= []).push(p);
        return true;
      },
    });
  });
}

/* ------------------------------ közös lépések ------------------------------ */

/**
 * Általános játszható-állapot jel: a játék gyökere `data-playing="true"` (mind a hét lap ma is beállítja).
 * A baseline esetfájlok ezt használják; a játékszelet a saját, pontosabb jelére cseréli.
 */
export async function waitForPlaying(page: Page): Promise<void> {
  await expect(page.locator('[data-game][data-playing="true"]').first()).toBeAttached({ timeout: 15_000 });
}

type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void } };

function collectErrors(page: Page): { errors: string[] } {
  const bag = { errors: [] as string[] };
  page.on("pageerror", (err) => bag.errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    const type = msg.type();
    // A WebGL-hibák a Chrome-ban gyakran „warning” szinten jönnek (GL_INVALID_…, CONTEXT_LOST).
    if (isBenignWebglEnvWarning(msg.text())) return; // CI szoftveres WebGL környezeti zaja (webgl-noise.ts)
    if (type === "error" || (type === "warning" && WEBGL_ERROR.test(msg.text()))) {
      bag.errors.push(`console.${type}: ${msg.text()}`);
    }
  });
  return bag;
}

function startLocator(page: Page, c: GameMobileCase) {
  if (c.startTestId) return page.getByTestId(c.startTestId).first();
  if (c.startName) return page.getByRole("button", { name: c.startName }).first();
  throw new Error(`${c.id}: sem startTestId, sem startName nincs megadva`);
}

async function shot(page: Page, testInfo: TestInfo, c: GameMobileCase, state: string): Promise<void> {
  const vp = page.viewportSize();
  const name = `${c.id}-${vp?.width ?? 0}x${vp?.height ?? 0}-${state}.jpg`;
  // B5: beállt állapotot fotózunk (belépő animáció után), nem a köztes képkockát.
  const settle = SETTLE_SELECTOR[state];
  if (settle) await settleIfPresent(page, settle);
  await page.screenshot({ path: testInfo.outputPath(name), type: "jpeg", quality: 70 });
  const dir = process.env.GAME_MOBILE_SHOT_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70 });
  }
}

async function openStart(page: Page, c: GameMobileCase): Promise<void> {
  await page.goto(c.path);
  await expect(startLocator(page, c)).toBeVisible({ timeout: 20_000 });
}

async function startPlaying(page: Page, c: GameMobileCase): Promise<void> {
  await openStart(page, c);
  await startLocator(page, c).click();
  await c.playReady(page);
}

async function forceResult(page: Page, c: GameMobileCase): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as GameTestWindow).__websuliGame?.forceState === "function",
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate((patch) => (window as unknown as GameTestWindow).__websuliGame?.forceState(patch), c.resultForce);
  await expect(page.locator("[data-game-result]").first()).toBeVisible({ timeout: 10_000 });
}

function expectNoOverflow(o: { x: number; y: number }, where: string, withY: boolean) {
  expect(o.x, `${where}: vízszintes oldalgörgetés`).toBeLessThanOrEqual(2);
  if (withY) expect(o.y, `${where}: függőleges oldalgörgetés`).toBeLessThanOrEqual(2);
}

/* ------------------------------ a tesztsor ------------------------------ */

export function defineGameMobileQuality(c: GameMobileCase): void {
  test.describe(c.id, () => {
    for (const viewport of MOBILE_VIEWPORTS) {
      test.describe(`${viewport.width}x${viewport.height}`, () => {
        test.use({ viewport });

        test(`baseline: betölt, a start látható, nincs vízszintes görgetés és lap-hiba`, async ({ page }, testInfo) => {
          const bag = collectErrors(page);
          await openStart(page, c);
          expectNoOverflow(await measureOverflow(page), "kezdőképernyő", false);
          await shot(page, testInfo, c, "start");
          const pageErrors = bag.errors.filter((e) => e.startsWith("pageerror"));
          expect(pageErrors, "pageerror a betöltéskor").toEqual([]);
        });

        if (c.status !== "full") return;

        test(`full: M1 M2 M3 négy állapotban, M7 eredmény, M11`, async ({ page }, testInfo) => {
          const bag = collectErrors(page);
          await openStart(page, c);
          expectNoOverflow(await measureOverflow(page), "kezdőképernyő", true);
          await settleIfPresent(page, SETTLE_SELECTOR.start);
          expect(await smallTargets(page), "M2 kezdőképernyő").toEqual([]);

          await startLocator(page, c).click();
          await c.playReady(page);
          expect(bag.errors, "M11 konzol- / WebGL-hiba a játszható állapotig").toEqual([]);
          expectNoOverflow(await measureOverflow(page), "játék közben", true);
          expect(await smallTargets(page), "M2 játék közben").toEqual([]);
          expect(await smallFonts(page), "M3 játék közben").toEqual([]);
          await shot(page, testInfo, c, "play");

          await page.getByTestId("game-pause").click();
          await expect(page.getByTestId("game-pause-menu")).toBeVisible();
          expectNoOverflow(await measureOverflow(page), "szünet", true);
          await waitForStable(page, '[data-testid="game-pause-menu"]');
          expect(await smallTargets(page), "M2 szünet").toEqual([]);
          expect(await smallFonts(page), "M3 szünet").toEqual([]);
          await shot(page, testInfo, c, "pause");
          await page.getByTestId("game-resume").click();
          await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);

          await forceResult(page, c);
          await expect(page.getByTestId(c.resultTestId).first()).toBeVisible();
          await expect(page.getByTestId("game-result-stars")).toBeVisible();
          await expect(page.locator('[data-testid="game-result-retry"], [data-game-retry]').first()).toBeVisible();
          await expect(page.getByTestId("game-result-back")).toBeVisible();
          expectNoOverflow(await measureOverflow(page), "eredmény", true);
          await waitForStable(page, "[data-game-result]");
          expect(await smallTargets(page), "M2 eredmény").toEqual([]);
          expect(await smallFonts(page), "M3 eredmény").toEqual([]);
          await shot(page, testInfo, c, "result");
        });

        test(`full: M4 biztonsági sáv játék közben`, async ({ page }) => {
          const insets = { top: 44, right: 0, bottom: 34, left: 0 };
          await startPlaying(page, c);
          await emulateSafeArea(page, insets);
          await page.waitForTimeout(100);
          expect(await safeAreaViolations(page, insets)).toEqual([]);
        });

        test(`full: M6 háttérbe kerülés → szünet menü`, async ({ page }) => {
          await startPlaying(page, c);
          await hideAndShowPage(page);
          await expect(page.getByTestId("game-pause-menu")).toBeVisible();
        });

        test(`full: M8 a játéklistáról legfeljebb két koppintás`, async ({ page }) => {
          await page.goto("/games");
          await page.locator(`a[href="${c.path}"]`).first().click();
          await startLocator(page, c).click();
          await c.playReady(page);
        });

        if (c.answerWrong) {
          const answerWrong = c.answerWrong;
          test(`full: M9 csökkentett mozgásnál nincs rázás / villogás`, async ({ page }) => {
            await page.emulateMedia({ reducedMotion: "reduce" });
            await startPlaying(page, c);
            await answerWrong(page);
            const names = await page.evaluate(() =>
              document.getAnimations().map((a) => {
                const anim = a as Animation & { animationName?: string };
                return `${anim.animationName ?? ""} ${a.id ?? ""}`.trim();
              }),
            );
            expect(names.filter((n) => /shake|flash/i.test(n))).toEqual([]);
          });

          test(`full: M10 rossz válaszra [30, 40, 30] rezgés`, async ({ page }) => {
            await stubVibrate(page);
            await startPlaying(page, c);
            await answerWrong(page);
            const calls = await page.evaluate(() => (window as unknown as { __vibrateCalls?: unknown[] }).__vibrateCalls ?? []);
            expect(calls).toContainEqual([30, 40, 30]);
          });
        }
      });
    }

    if (c.status === "full" && c.touchControlsTestId) {
      const touchId = c.touchControlsTestId;
      test.describe("nem érintős", () => {
        test.use({ hasTouch: false, isMobile: false, viewport: { width: 1366, height: 768 } });
        test(`M5: egérrel nincs érintővezérlő`, async ({ page }) => {
          await startPlaying(page, c);
          await expect(page.getByTestId(touchId)).toHaveCount(0);
        });
      });
      test.describe("érintős laptop", () => {
        test.use({ hasTouch: true, isMobile: false, viewport: { width: 1366, height: 768 } });
        test(`M5: másodlagos érintős mutatóval látszik az érintővezérlő`, async ({ page }) => {
          await startPlaying(page, c);
          await expect(page.getByTestId(touchId).first()).toBeVisible();
        });
      });
    }
  });
}
