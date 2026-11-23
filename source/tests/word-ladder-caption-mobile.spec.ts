import { expect, test, type Page } from "@playwright/test";

/**
 * P-011 — Szólétra feliratok telefonon (docs/specs/2026-11-23-szoletra-felirat.md E2–E4), a CI-azonos úton (buildelt szerver,
 * teszt-kampós build). Keskeny álló nézetekben (360×640, 390×844) a DOM-fogások látszanak (a 3D lapok csak ≥ 600 px-en):
 * - E2: a fogás-felirat és a verseny-sor árnyék (`text-shadow`) nélkül, ≥ 4,5 : 1 kontraszttal — a fogásnál a színátmenet
 *   MINDEN színpontjához (alap- és jó-állapot), a verseny-sornál a saját hátteréhez;
 * - E3: a verseny-sor címkéi („Te”, rivális) az állás-szövegtől eltérő színűek;
 * - E4: a győzelmi cím és a vereség eredmény-sora a rag nélküli mondattal; képernyőkép a kérdés-kártyáról, a verseny-sorról és
 *   az eredménylapról a teszt kimeneti mappájába (követett repófájlt a teszt nem ír).
 */

test.use({ serviceWorkers: "block", hasTouch: true, isMobile: true });

const VIEWS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
] as const;

type Api = { forceState: (p: object) => void; probe: () => Record<string, number | string | null> };

async function stub(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p.includes("leaderboard") || p.includes("/api/games/score")) data = { ok: true };
    await route.fulfill({ json: data });
  });
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as { __websuliGame: Api }).__websuliGame.probe());

/** Egy olvasással (C-64): árnyék, kontraszt és színek a lapon belül számolva. */
const readCaptions = (page: Page) =>
  page.evaluate(() => {
    const rgbs = (s: string) => Array.from(s.matchAll(/rgba?\(([^)]+)\)/g)).map((m) => m[1]!.split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number));
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (a: number[], b: number[]) => {
      const L1 = lum(a);
      const L2 = lum(b);
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    };
    const holdOf = (sel: string) => {
      const btn = document.querySelector<HTMLElement>(sel);
      const label = btn?.querySelector<HTMLElement>(".wl-hold-label");
      if (!btn || !label) return null;
      const fg = rgbs(getComputedStyle(label).color)[0]!;
      const stops = rgbs(getComputedStyle(btn).backgroundImage);
      return {
        shadow: getComputedStyle(label).textShadow,
        stops: stops.length,
        minContrast: stops.length ? Math.min(...stops.map((s) => contrast(fg, s))) : 0,
      };
    };
    const race = document.querySelector<HTMLElement>(".wl-race-text");
    const you = document.querySelector<HTMLElement>(".wl-race-key-you");
    const rival = document.querySelector<HTMLElement>(".wl-race-key-rival");
    const lead = document.querySelector<HTMLElement>(".wl-race-lead");
    const raceBg = race ? rgbs(getComputedStyle(race).backgroundColor)[0] ?? [0, 0, 0] : [0, 0, 0];
    const raceBgAlpha = race ? Number((getComputedStyle(race).backgroundColor.match(/rgba\([^)]*[,/]\s*([\d.]+)\)/) ?? [])[1] ?? 1) : 0;
    const col = (el: HTMLElement | null) => (el ? getComputedStyle(el).color : "");
    const cOf = (el: HTMLElement | null) => (el ? contrast(rgbs(getComputedStyle(el).color)[0]!, raceBg) : 0);
    return {
      hold: holdOf('[data-testid^="wl-option-"]:not([data-state])') ?? holdOf('[data-testid^="wl-option-"]'),
      race: race
        ? {
            shadow: getComputedStyle(race).textShadow,
            bgAlpha: raceBgAlpha,
            youColor: col(you),
            rivalColor: col(rival),
            leadColor: col(lead),
            minContrast: Math.min(cOf(you), cOf(rival), cOf(lead)),
            rivalText: rival?.innerText ?? "",
          }
        : null,
    };
  });

const correctHold = (page: Page) =>
  page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>('[data-testid^="wl-option-"][data-state="correct"]');
    const label = btn?.querySelector<HTMLElement>(".wl-hold-label");
    if (!btn || !label) return null;
    const rgbs = (s: string) => Array.from(s.matchAll(/rgba?\(([^)]+)\)/g)).map((m) => m[1]!.split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number));
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const fg = rgbs(getComputedStyle(label).color)[0]!;
    const stops = rgbs(getComputedStyle(btn).backgroundImage);
    const c = (s: number[]) => (Math.max(lum(fg), lum(s)) + 0.05) / (Math.min(lum(fg), lum(s)) + 0.05);
    return { shadow: getComputedStyle(label).textShadow, stops: stops.length, minContrast: stops.length ? Math.min(...stops.map(c)) : 0 };
  });

for (const vp of VIEWS) {
  test(`E2/E3 @ ${vp.width}x${vp.height}: a fogás-felirat és a verseny-sor árnyék nélkül, ≥ 4,5 : 1 kontraszttal, a címke és az állás eltérő színű`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(vp);
    await stub(page);
    await page.goto("/games/word-ladder-hu-en?seed=11&wall=60");
    await page.getByTestId("wl-start").tap();
    await expect(page.getByTestId("wl-race")).toBeVisible();
    await expect.poll(async () => (await probe(page)).questionOpen, { timeout: 30_000 }).toBe(1);
    await expect.poll(async () => { const q = await probe(page); return Number(q.clock) >= Number(q.armedAt); }, { timeout: 10_000 }).toBe(true);
    await expect(page.locator('[data-testid="wl-quiz"]')).toHaveAttribute("data-quiz3d", "false");
    await page.waitForTimeout(200);
    const m = await readCaptions(page);
    await page.screenshot({ path: testInfo.outputPath(`felirat-${vp.width}x${vp.height}-kerdes.jpg`), type: "jpeg", quality: 70 });
    console.log(`P011|${vp.width}x${vp.height}|${JSON.stringify(m)}`);
    expect(m.hold, "a DOM-fogás látszik").not.toBeNull();
    expect(m.hold!.shadow, "fogás-felirat: nincs text-shadow").toBe("none");
    expect(m.hold!.stops, "fogás: színátmenet mérve").toBeGreaterThan(0);
    expect(m.hold!.minContrast, "fogás-felirat: kontraszt a legvilágosabb színponthoz").toBeGreaterThanOrEqual(4.5);
    expect(m.race, "a verseny-sor látszik").not.toBeNull();
    expect(m.race!.shadow, "verseny-sor: nincs text-shadow").toBe("none");
    expect(m.race!.bgAlpha, "verseny-sor: tömör (≥ 0,85 fedésű) háttér").toBeGreaterThanOrEqual(0.85);
    expect(m.race!.minContrast, "verseny-sor: kontraszt a saját hátteréhez").toBeGreaterThanOrEqual(4.5);
    expect(m.race!.youColor, "a „Te” címke színe eltér az állás-szövegtől").not.toBe(m.race!.leadColor);
    expect(m.race!.rivalColor, "a rivális címke színe eltér az állás-szövegtől").not.toBe(m.race!.leadColor);
    expect(m.race!.rivalText).toBe("Villám");

    // Jó fogás → a zölden világító kapaszkodó felirata is árnyék nélkül, ≥ 4,5 : 1.
    await page.locator('[data-testid^="wl-option-"][data-correct="true"]:not([disabled])').first().tap();
    await expect(page.locator('[data-testid^="wl-option-"][data-state="correct"]').first()).toBeVisible({ timeout: 3_000 });
    const ok = await correctHold(page);
    console.log(`P011|${vp.width}x${vp.height}|jó|${JSON.stringify(ok)}`);
    expect(ok, "a jó fogás mérve").not.toBeNull();
    expect(ok!.shadow).toBe("none");
    expect(ok!.minContrast, "jó fogás: kontraszt a legvilágosabb színponthoz").toBeGreaterThanOrEqual(4.5);
  });

  test(`E4 @ ${vp.width}x${vp.height}: a győzelmi cím és a vereség eredmény-sora rag nélküli mondattal`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(vp);
    await stub(page);
    await page.goto("/games/word-ladder-hu-en?seed=11&wall=60");
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: Api }).__websuliGame?.forceState === "function");
    await page.evaluate(() => (window as unknown as { __websuliGame: Api }).__websuliGame.forceState({ phase: "won" }));
    const won = page.getByTestId("wl-won");
    await expect(won).toBeVisible({ timeout: 15_000 });
    await expect(won).toContainText("🏁 Elérted a csúcsot Villám előtt!");
    await expect(won).not.toContainText("Villámt");
    await page.screenshot({ path: testInfo.outputPath(`felirat-${vp.width}x${vp.height}-gyozelem.jpg`), type: "jpeg", quality: 70 });

    await page.evaluate(() => (window as unknown as { __websuliGame: Api }).__websuliGame.forceState({ phase: "lost" }));
    await expect(page.getByTestId("wl-result-line")).toContainText("Villám most gyorsabb volt — a visszavágóban utolérheted!", { timeout: 15_000 });
    await page.screenshot({ path: testInfo.outputPath(`felirat-${vp.width}x${vp.height}-vereseg.jpg`), type: "jpeg", quality: 70 });
  });
}
