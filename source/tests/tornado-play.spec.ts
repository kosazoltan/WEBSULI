import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * J7b — Tornado Hunter 200: útelágazás (Q1), turbó-kérdés (Q3) és a horgony-kérdés a NEM BLOKKOLÓ kérdés-sávon
 * (terv 5.7, 9.; végrehajtás J7b; J7 elfogadás: „a vezetés a kérdés alatt nem áll”). Valódi böngészőben, a három
 * mobilnézetben. Az elágazás áthajtását a teszt a jármű elhelyezésével (`__websuliTornado.setPlayer`) végzi, a jármű a
 * kapuvonalat a SAJÁT fizikájával keresztezi; a gombos válaszok valódi érintéssel. Képernyőkép: `GAME_MOBILE_SHOT_DIR`.
 */

type Probe = Record<string, number | string | null>;
type GameWindow = {
  __websuliGame?: { forceState: (patch: Record<string, unknown>) => void; probe?: () => Probe };
  __websuliTornado?: {
    getJunction: () => { ox: number; oz: number; fx: number; fz: number; rx: number; rz: number; line: number; gates: number; spacing: number; frozen: boolean; questionId: number } | null;
    setPlayer: (patch: Record<string, number | boolean>) => void;
    getPlayer: () => { x: number; z: number; heading: number; speed: number };
  };
};

const VIEWPORTS = [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
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
  await page.goto("/games/tornado-hunter-200?seed=7");
  await page.getByTestId("tornado-quick-start").click();
  const root = page.locator('[data-game="TornadoHunter200"]');
  await expect(root).toHaveAttribute("data-game-state", "playing", { timeout: 20_000 });
  await expect(page.locator("[data-tornado-play] canvas")).toBeVisible();
  const rotate = page.getByTestId("game-rotate-continue");
  if (await rotate.isVisible()) await rotate.click();
  await page.waitForFunction(() => typeof (window as unknown as GameWindow).__websuliGame?.probe === "function");
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.probe!());

/** Megvárja az első elágazást (a director bemelegítése után, ~10 mp). */
async function waitJunction(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as GameWindow).__websuliGame?.probe?.().questionKind === "junction", undefined, { timeout: 40_000 });
}

/**
 * Rögzítés (J7b döntések 25.): a kérdés megjelenése után ≥ 1 s-mal (kérdés-óra) lenyomott fék. A kérdés-óra lassú gépen a
 * falióránál lassabban járhat, ezért fék-koppintás, amíg a táblák nem rögzülnek (minden koppintás új felfutó él).
 */
async function commitIntent(page: Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await page.keyboard.down(" ");
    await page.waitForTimeout(120);
    await page.keyboard.up(" ");
    const frozen = await page
      .waitForFunction(() => (window as unknown as GameWindow).__websuliGame?.probe?.().junctionFrozen === 1, undefined, { timeout: 500 })
      .then(() => true)
      .catch(() => false);
    if (frozen) return;
  }
  throw new Error("a táblák a fék után sem rögzültek");
}

/** A jármű a rögzült (`gate`.) kapu elé kerül, a kapuvonal felé néz, és a saját fizikájával áthajt rajta. */
async function driveThroughGate(page: Page, gate: number): Promise<void> {
  await commitIntent(page);
  await page.evaluate((g) => {
    const api = (window as unknown as GameWindow).__websuliTornado!;
    const j = api.getJunction()!;
    const off = (g - (j.gates - 1) / 2) * j.spacing;
    const x = j.ox + j.fx * (j.line - 3) + j.rx * off;
    const z = j.oz + j.fz * (j.line - 3) + j.rz * off;
    api.setPlayer({ x, z, heading: Math.atan2(j.fx, -j.fz), speed: 14 });
  }, gate);
}

for (const viewport of VIEWPORTS) {
  test.describe(`J7b ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("elágazás: a kérdés alatt a vezetés megy; a helyes kapu = turbó, a helyes tábla felvillan; nincs blokkoló kártya", async ({ page }, testInfo) => {
      await startPlaying(page);
      await shot(page, testInfo, "start");
      await waitJunction(page);
      const quiz = page.getByTestId("tornado-quiz");
      await expect(quiz).toHaveAttribute("data-mode", "bar");
      await expect(page.getByTestId("tornado-question-kind")).toHaveAttribute("data-kind", "junction");
      // Három tábla, a feliratuk a kérdés-sáv három opciója, teljes szöveggel (nincs levágás), egymást nem fedve.
      for (let i = 0; i < 3; i++) await expect(page.getByTestId(`tornado-sign-${i}`)).toBeVisible();
      const signs = await page.evaluate(() =>
        [0, 1, 2].map((i) => {
          const el = document.querySelector<HTMLElement>(`[data-testid="tornado-sign-${i}"]`)!;
          const r = el.getBoundingClientRect();
          return { x: r.left, r: r.right, top: r.top, bottom: r.bottom, cut: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1, fs: parseFloat(getComputedStyle(el).fontSize) };
        }),
      );
      for (const s of signs) {
        expect(s.cut, "tábla-felirat levágva").toBe(false);
        expect(s.fs).toBeGreaterThanOrEqual(14);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.r).toBeLessThanOrEqual(viewport.width + 1);
      }
      const sorted = [...signs].sort((a, b) => a.x - b.x);
      for (let k = 1; k < sorted.length; k++) expect(sorted[k]!.x, "a táblák feliratai fedik egymást").toBeGreaterThanOrEqual(sorted[k - 1]!.r - 1);
      // J7 elfogadás: nyitott kérdés mellett a szimuláció és a jármű halad (a kérdés nem állítja meg a vezetést).
      await page.keyboard.down("w");
      const a = await probe(page);
      await page.waitForTimeout(1000);
      const b = await probe(page);
      await page.keyboard.up("w");
      expect(Number(b.simTime) - Number(a.simTime), "a szimuláció a kérdés alatt fut").toBeGreaterThan(300);
      expect(Math.hypot(Number(b.x) - Number(a.x), Number(b.z) - Number(a.z)), "a jármű halad a kérdés alatt").toBeGreaterThan(1);
      await shot(page, testInfo, "question");
      // Helyes kapu → a helyes tábla zölden felvillan (a közös helyes-kijelzés 0,9 mp), nitró; a lapon belül, képkockánként (C-65).
      const correct = await page.evaluate(() => {
        const opts = Array.from(document.querySelectorAll('[data-testid="tornado-quiz"] [data-correct]'));
        return opts.findIndex((o) => o.getAttribute("data-correct") === "true");
      });
      expect(correct).toBeGreaterThanOrEqual(0);
      const shown = page.evaluate(
        (i) =>
          new Promise<number>((resolve) => {
            let start = -1;
            const tick = (t: number) => {
              const st = document.querySelector(`[data-testid="tornado-sign-${i}"]`)?.getAttribute("data-state");
              if (st === "correct" && start < 0) start = t;
              if (start >= 0 && st !== "correct") return resolve(t - start);
              if (start >= 0 && t - start > 2500) return resolve(t - start);
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        correct,
      );
      await driveThroughGate(page, correct);
      expect(await shown, "a helyes tábla felvillan").toBeGreaterThanOrEqual(800);
      await expect(page.getByTestId("tornado-chase-msg").or(page.getByTestId("tornado-nitro")).first()).toBeVisible({ timeout: 3_000 });
      expect(Number((await probe(page)).questionsCorrect)).toBe(1);
      await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
    });

    test("elágazás rossz kapuval: kerülő, a megoldás a játéktérben, kártya csak a „Miért?”-re, és amíg nyitva, áll a játék", async ({ page }, testInfo) => {
      await startPlaying(page);
      await waitJunction(page);
      const wrong = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid="tornado-quiz"] [data-correct]')).findIndex((o) => o.getAttribute("data-correct") === "false"),
      );
      const correct = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid="tornado-quiz"] [data-correct]')).findIndex((o) => o.getAttribute("data-correct") === "true"),
      );
      // J4: hibánál a helyes megoldás a játéktérben (a helyes tábla zölden) ≥ 1,8 mp-ig látszik — lapon belül, képkockánként (C-65).
      const shown = page.evaluate(
        (i) =>
          new Promise<number>((resolve) => {
            let start = -1;
            const tick = (t: number) => {
              const st = document.querySelector(`[data-testid="tornado-sign-${i}"]`)?.getAttribute("data-state");
              if (st === "correct" && start < 0) start = t;
              if (start >= 0 && st !== "correct") return resolve(t - start);
              if (start >= 0 && t - start > 2600) return resolve(t - start);
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        correct,
      );
      await driveThroughGate(page, wrong);
      await expect(page.getByTestId("tornado-chase-msg")).toContainText("Kerülő");
      await expect(page.getByTestId(`tornado-sign-${wrong}`)).toHaveAttribute("data-state", "wrong");
      await expect(page.locator('[role="dialog"]')).toHaveCount(0);
      await shot(page, testInfo, "wrong");
      expect(await shown, "a helyes tábla ≥ 1,8 mp-ig zöld").toBeGreaterThanOrEqual(1800);
      expect(Number((await probe(page)).detourSec)).toBeGreaterThanOrEqual(8);
      await page.getByTestId("play-why").click();
      await expect(page.getByTestId("quiz-feedback")).toBeVisible();
      const a = Number((await probe(page)).simTime);
      await page.waitForTimeout(800);
      expect(Number((await probe(page)).simTime), "a „Miért?” alatt áll a játék").toBe(a);
      // (f) A megállítási okok nem oldják fel egymást: a háttérbe tett lap szünete és a folytatás a „Miért?” alatt sem indítja el.
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(page.getByTestId("game-pause-menu")).toBeVisible();
      await page.getByTestId("game-resume").click();
      await expect(page.getByTestId("quiz-feedback")).toBeVisible();
      await page.waitForTimeout(500);
      expect(Number((await probe(page)).simTime), "a szünet feloldása a „Miért?” kártya alatt elindította a játékot").toBe(a);
      await page.getByTestId("quiz-feedback-dismiss").click();
      await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
      await page.waitForTimeout(500);
      expect(Number((await probe(page)).simTime)).toBeGreaterThan(a);
    });

    test("turbó-kérdés gombokkal (valódi érintés): jó válasz = nitró; a szünet és a kérdés-óra együtt áll", async ({ page }, testInfo) => {
      await startPlaying(page);
      await page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.forceState({ question: true }));
      const quiz = page.getByTestId("tornado-quiz");
      await expect(quiz).toHaveAttribute("data-mode", "buttons");
      await expect(page.getByTestId("tornado-question-kind")).toHaveAttribute("data-kind", "turbo");
      await shot(page, testInfo, "turbo");
      // Szünet alatt a kérdés ideje sem fogy (a szimuláció és a kérdés-óra együtt áll).
      await page.getByTestId("game-pause").click();
      const a = await probe(page);
      await page.waitForTimeout(700);
      expect((await probe(page)).simTime).toBe(a.simTime);
      await shot(page, testInfo, "pause");
      await page.getByTestId("game-resume").click();
      await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
      await page.waitForTimeout(300);
      const btn = quiz.locator('[data-correct="true"]').first();
      const box = (await btn.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByTestId("tornado-nitro")).toBeVisible({ timeout: 3_000 });
    });
  });
}

for (const viewport of VIEWPORTS) {
  test.describe(`J7b ellenőrzés után ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test("B1 / 25.: kormányzás és az első 1 s-ban lenyomott fék mellett a táblák várnak, nincs válasz — a kérdés lejár", async ({ page }) => {
      await startPlaying(page);
      await waitJunction(page);
      const id = (await probe(page)).questionId;
      // Akadály miatti fék a kérdés első másodpercében (tovább tartva), közben 1,5 s kanyar: egyik sem szándék.
      await page.keyboard.down(" ");
      await page.keyboard.down("a");
      await page.waitForTimeout(1500);
      await page.keyboard.up("a");
      await page.keyboard.up(" ");
      const mid = await probe(page);
      if (mid.questionId === id) {
        expect(mid.intent, "a kormány / a korai fék szándéknak számított").toBe(0);
        expect(mid.junctionFrozen).toBe(0);
      }
      await page.waitForFunction((qid) => (window as unknown as GameWindow).__websuliGame?.probe?.().questionId !== qid, id, { timeout: 15_000 });
      const p = await probe(page);
      expect(p.questionsAnswered, "szándék nélkül nyilvántartott válasz").toBe(0);
      expect(p.junctionFrozen).toBe(0);
    });

    test("M3: a leghosszabb válaszok a táblákon jellel, a teljes szöveg a kártya alatti listában — levágás és átfedés nélkül", async ({ page }, testInfo) => {
      await startPlaying(page);
      await page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.forceState({ junction: "long" }));
      const list = page.getByTestId("tornado-sign-answers");
      const wide = viewport.width > 600;
      if (!wide) await expect(list).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="tornado-quiz"] .play-question-card')!.getBoundingClientRect();
        const lst = document.querySelector<HTMLElement>('[data-testid="tornado-sign-answers"]');
        const items = lst ? Array.from(lst.querySelectorAll("li")).map((li) => ({ text: li.textContent ?? "", cut: li.scrollWidth > li.clientWidth + 1 })) : [];
        const signs = [0, 1, 2].map((i) => {
          const el = document.querySelector<HTMLElement>(`[data-testid="tornado-sign-${i}"]`)!;
          const r = el.getBoundingClientRect();
          return { top: r.top, h: r.height, w: r.width, cut: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1, text: el.textContent ?? "" };
        });
        const lr = lst?.getBoundingClientRect();
        return { cardBottom: card.bottom, cardLeft: card.left, listTop: lr?.top ?? null, listBottom: lr?.bottom ?? null, listRight: lr?.right ?? null, items, signs: signs.map((x, i) => ({ ...x, left: document.querySelector(`[data-testid="tornado-sign-${i}"]`)!.getBoundingClientRect().left })) };
      });
      for (const s of m.signs) {
        expect(s.cut, `levágott tábla: ${s.text}`).toBe(false);
        expect(s.h).toBeGreaterThanOrEqual(48);
        expect(s.top, "a tábla a kártya alá csúszik").toBeGreaterThanOrEqual(m.cardBottom - 1);
      }
      if (m.listTop !== null && wide) {
        // R4 (J7b döntések 24.): alacsony fekvőn a lista a bal oldalon — se a kártyát, se a táblákat nem fedi.
        expect(m.listRight!, "a lista a kártyát fedi").toBeLessThanOrEqual(m.cardLeft + 1);
        for (const s of m.signs) expect(s.left, "a tábla a lista alá kerül").toBeGreaterThanOrEqual(m.listRight! - 1);
        expect(m.items.map((x) => x.text).join(" | ")).toContain("maradj a helyeden fedezékben");
        for (const it of m.items) expect(it.cut).toBe(false);
        await expect(page.getByTestId("tornado-question-kind")).toHaveCount(0);
      } else if (m.listTop !== null) {
        expect(m.listTop, "a lista a kártya alatt").toBeGreaterThanOrEqual(m.cardBottom - 1);
        expect(m.items.map((x) => x.text).join(" | ")).toContain("maradj a helyeden fedezékben");
        expect(m.items.map((x) => x.text).join(" | ")).toContain("If I were there, I would help.");
        for (const it of m.items) expect(it.cut).toBe(false);
        for (const s of m.signs) expect(s.top, "a tábla a lista alá kerül").toBeGreaterThanOrEqual((m.listBottom ?? 0) - 1);
      } else {
        // Széles nézetben a teljes szöveg a táblán befér.
        expect(m.signs.map((x) => x.text).join(" | ")).toContain("maradj a helyeden fedezékben");
      }
      await shot(page, testInfo, "long-answers");
      // Koppintás a helyes táblára (valódi érintés) = válasz.
      const correct = page.locator('[data-tornado-signs="open"] [data-correct="true"]').first();
      const box = (await correct.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect.poll(async () => Number((await probe(page)).questionsCorrect), { timeout: 3_000 }).toBe(1);
    });

    test("K2: nitró alatt a tárcsa hátrahúzása megszakítja a nitrót (érintéssel is lehet fékezni)", async ({ page }) => {
      await startPlaying(page);
      await page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.forceState({ question: true }));
      const btn = page.getByTestId("tornado-quiz").locator('[data-correct="true"]').first();
      const box = (await btn.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect.poll(async () => Number((await probe(page)).nitroMs), { timeout: 3_000 }).toBeGreaterThan(0);
      const stick = (await page.getByTestId("virtual-joystick").boundingBox())!;
      const cx = stick.x + stick.width / 2;
      const cy = stick.y + stick.height / 2;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
      for (let k = 1; k <= 6; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx, y: cy + (stick.height / 2) * (k / 6), id: 1 }] });
      await expect.poll(async () => Number((await probe(page)).nitroMs), { timeout: 2_000 }).toBe(0);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    });
  });
}
