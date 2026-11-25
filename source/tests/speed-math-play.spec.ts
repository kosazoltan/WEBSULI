import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type ElementHandle, type Page } from "@playwright/test";

/**
 * J4a — „Neon védőtorony” valódi érintéssel (végrehajtás J4a 6.; terv J1, J4, J5, J9, J16; K.4/13–18, 23–25).
 *
 * Az ELSŐ eset szándékosan KAMPÓ NÉLKÜLI: se `forceState`, se `probe` — csak a felhasználó útja érintéssel (a Kockavadásznál
 * a kampós teszt elfedte a valódi út hibáját). A számdrónok helyét a DOM adja (a `data-correct` a teszt-buildben a
 * jó / rossz drónt jelöli, a választás érintéssel történik). A fosztogatókat nem lőjük le, és minden további feladatra
 * rosszul felelünk: a tanító szakasz (30 mp) után a torony elesik — így a menet a valódi úton ér véget.
 *
 * Képernyőkép: ha a `SQ_SHOT_DIR` meg van adva, oda (JPEG 70).
 */

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

const drones = (page: Page) => page.locator('[data-testid="sq-answers"] [data-correct]');

/**
 * #1730 (gyökérok, terhelt futtatón diagnosztikával mérve, 2026-11-24): a koppintás célba ér és a válasz rögzül (`pick` → `correct`), de a
 * jó válasz kijelzése csak `REVEAL_CORRECT_MS` (0,9 s játékidő) — a Playwright-oldali ellenőrzés terhelés alatt a kijelzés vége UTÁN ért
 * oda, amikor már a következő feladat tétlen drónjai látszottak. Ritkábban a koppintás a kérdés ablakán (≈ 6 s) TÚL érkezett: ekkor a
 * játék helyesen „Lejárt az idő”-t ad (a jó drón ilyenkor is zöld — kijelzés —, de pont nincs). A rövid életű állapotot ezért a LAPON
 * BELÜL rögzítjük a koppintás ELŐTT bekapcsolt MutationObserverrel: a drónok kimeneteli állapotát (elemenként egyszer) és a feladat
 * státuszsorát (`play-question-status`: dicséret / „A jó válasz: …” / „Lejárt az idő …”), és ezekre teszünk állítást.
 */
type Outcome = "correct" | "wrong" | "timeout";
type Recorded = { correctDrone: number; wrongDrones: number; outcome: Outcome | null };
async function recordRound(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Rec = { correctDrone: number; wrongDrones: number; outcome: "correct" | "wrong" | "timeout" | null };
    const w = window as unknown as { __sqRec?: Rec; __sqObs?: MutationObserver };
    w.__sqObs?.disconnect();
    const rec: Rec = { correctDrone: 0, wrongDrones: 0, outcome: null };
    w.__sqRec = rec;
    // drónonként (helye szerint: `sq-drone-<i>`) egyszer — a React újrarajzolása új elemet adhat ugyanarra a drónra
    const seen = new Set<string>();
    // a felvétel előtti (előző feladatból maradt) státusz nem kimenetel — csak az utána megjelenő számít
    // Review #576: csak UGYANANNAK a státuszelemnek a kezdeti szövege nem kimenetel — a kérdésazonosítóval kulcsolt kártya
    // kérdésenként új elemet hoz (InlineQuestion.tsx), így a következő kérdés azonos „Lejárt az idő” szövege már számít.
    const statusEl0 = document.querySelector('[data-testid="play-question-status"]');
    const initial = `${statusEl0?.getAttribute("data-tone") ?? ""}|${statusEl0?.textContent ?? ""}`;
    const drone = (el: Element) => {
      const state = el.getAttribute("data-state");
      if (!el.closest('[data-testid="sq-answers"]')) return; // a kérdéssáv válaszgombjai is hordozzák a data-correct-et — csak a drónok
      const key = `${el.getAttribute("data-testid") ?? ""}|${state}`;
      if ((state !== "correct" && state !== "wrong") || seen.has(key)) return; // tétlen / halványított („dim”) nem kimenetel
      seen.add(key);
      if (el.getAttribute("data-correct") === "true") { if (state === "correct") rec.correctDrone += 1; }
      else if (state === "wrong") rec.wrongDrones += 1;
    };
    const status = () => {
      if (rec.outcome) return;
      const el = document.querySelector('[data-testid="play-question-status"]');
      const tone = el?.getAttribute("data-tone");
      const text = el?.textContent ?? "";
      if (el === statusEl0 && `${tone ?? ""}|${text}` === initial) return;
      if (tone === "good") rec.outcome = "correct";
      else if (tone === "bad") rec.outcome = /Lejárt az idő/.test(text) ? "timeout" : "wrong";
    };
    const obs = new MutationObserver(records => {
      for (const m of records) {
        if (m.type === "attributes" && m.target instanceof Element && m.target.hasAttribute("data-correct")) drone(m.target);
        if (m.type === "childList") m.addedNodes.forEach(n => { if (n instanceof Element) { if (n.hasAttribute("data-correct")) drone(n); n.querySelectorAll("[data-correct]").forEach(drone); } });
      }
      status();
      // Review #576: a kimenetel után a felvétel lezárul (a mostani csomag drónállapotai már feldolgozva) — a későbbi kérdések
      // drónjai nem számolódnak a rögzített kimenetelhez.
      if (rec.outcome) obs.disconnect();
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-state", "data-tone"] });
    w.__sqObs = obs;
  });
}
const recorded = (page: Page) => page.evaluate(() => (window as unknown as { __sqRec: Recorded }).__sqRec);

/**
 * Egy feladat megválaszolása valódi érintéssel (jó vagy rossz drón), a kimenetel laponbelüli rögzítésével. Ha a koppintás a kérdés
 * ablakán túl érkezett (terhelt futtató: „Lejárt az idő” — a játék helyes viselkedése, nem a koppintás hibája), a következő feladaton
 * újra próbálja, legfeljebb háromszor; a kimenetelt adja vissza (a hívó állít rá).
 */
async function answerRound(page: Page, correct: boolean, beforeTap?: () => Promise<void>): Promise<Recorded & { wave: ElementHandle<Element>[] }> {
  const selector = `[data-testid="sq-answers"] [data-correct="${correct}"]`;
  for (let attempt = 1; ; attempt++) {
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    const wave = await drones(page).elementHandles();
    await recordRound(page);
    await beforeTap?.();
    await tapCenter(page, selector);
    await expect.poll(async () => (await recorded(page)).outcome, { timeout: 10_000, message: "a feladat kimenetele (státuszsor)" }).not.toBeNull();
    const rec = await recorded(page);
    // Review #576: a TÉNYLEGESEN megválaszolt feladat drónjait adja vissza — a hívó ezek eltűnését várja (újrapróba után nem a lejártét).
    if (rec.outcome !== "timeout" || attempt >= 3) return { ...rec, wave };
    // a lejárt feladat kijelzése után új négy drón jön — a régi négy elem eltűnése tartósan ellenőrizhető
    await expect.poll(() => page.evaluate(nodes => nodes.filter(node => node.isConnected).length, wave), { timeout: 15_000 }).toBe(0);
    await Promise.all(wave.map(n => n.dispose()));
  }
}

/** Koppintás egy elem közepére valódi érintéssel (a lebegő drón dobozán belül). */
async function tapCenter(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible({ timeout: 15_000 });
  // a belépő repülés (~0,5 s) után a drón egy helyben lebeg
  await page.waitForTimeout(650);
  const box = await el.boundingBox();
  expect(box, `${selector} doboza`).not.toBeNull();
  const original = await el.elementHandle();
  if (!original) throw new Error("A választott drón eltűnt a koppintás előtt");
  try {
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    // Ha az ellenfél közepe fedte a drónt, ez szabályosan lövés volt. Egyetlen új érintés
    // ugyanazon a még választható drónon, másik ponton; új kérdésre nem válaszolunk helyette.
    // #1730: csak ha a laponbelüli napló szerint a feladat még nem kapott választ (különben a második koppintás a következő
    // feladat drónjára eshetne).
    const next = await original.evaluate(async node => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const rec = (window as unknown as { __sqRec?: { outcome: string | null } }).__sqRec;
      if (rec?.outcome) return null;
      if (!node.isConnected || node.getAttribute("data-state") !== "idle" || node.getAttribute("aria-disabled") === "true") return null;
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width * 0.2, y: r.top + r.height / 2 };
    });
    if (next) await page.touchscreen.tap(next.x, next.y);
  } finally { await original.dispose(); }
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SQ_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70 });
}

test.describe("valódi érintés", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("kampó nélkül: indítás, lövés, jó és rossz drón, „Miért?”, a torony eleste, Gyakorold még, új futam", async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/games/speed-quiz-math");
    await page.getByTestId("sq-start").tap();
    const world = page.getByTestId("sq-world");
    await expect(world).toBeVisible();
    await expect(page.getByTestId("sq-hint")).toBeVisible(); // tanító súgó (egy sor)

    // Lövés: koppintás a játéktérre (a lézer elindul; a találat a fosztogató helyén múlik).
    const wb = (await world.boundingBox())!;
    for (let i = 0; i < 3; i++) await page.touchscreen.tap(wb.x + wb.width * (0.3 + 0.2 * i), wb.y + wb.height * 0.45);

    // 1. feladat: a JÓ drón érintéssel → a pont nő, a drón zöld.
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    await expect(page.getByTestId("play-question-more"), "a feladat koppintás nélkül olvasható").toHaveCount(0);
    const first = await answerRound(page, true);
    const firstWave = first.wave;
    expect(first.outcome, "a jó drón érintése helyes válasz").toBe("correct");
    expect(first.correctDrone, "a jó drón zöldre vált").toBe(1);
    expect(first.wrongDrones, "jó válasznál egyik rossz drón sem vált pirosra").toBe(0);
    await expect.poll(async () => Number((await page.getByTestId("sq-score").innerText()).replace(/\D/g, "")), { timeout: 5_000 }).toBeGreaterThan(0);
    await shot(page, "touch-correct.jpg");

    // 2. feladat: ROSSZ drón → nincs dialógus, a helyes drón zölden látszik, „Miért?” (a kijelzés ALATT) → kártya újrapróba nélkül.
    // A „Miért?” a kijelzés alatt áll egy helyben; a kijelzés végén a kártya „Miért?”-csippé, majd új feladattá alakul, és a
    // gomb elmozdul — a main CI-n (43943054869, 1. és 3. próba) a koppintás erre a váltásra esett, és a gomb mellé ment.
    // A régi négy DOM-elem eltűnése tartósan ellenőrizhető akkor is, ha a két mérés között már az új négy drón megjelent.
    await expect.poll(() => page.evaluate(nodes => nodes.filter(node => node.isConnected).length, firstWave), { timeout: 15_000 }).toBe(0);
    await Promise.all(firstWave.map(node => node.dispose()));
    const second = await answerRound(page, false);
    expect(second.outcome, "a rossz drón érintése hibás válasz").toBe("wrong");
    expect(second.correctDrone, "a helyes drón zölden látszik").toBe(1);
    expect(second.wrongDrones, "pontosan a koppintott rossz drón vált pirosra").toBe(1);
    await Promise.all(second.wave.map(node => node.dispose()));
    expect(await page.locator('[role="dialog"]').count(), "a hibás válasz nem nyit blokkoló kártyát").toBe(0);
    await shot(page, "touch-wrong.jpg");
    await page.getByTestId("play-why").tap();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await expect(page.getByTestId("quiz-feedback")).toHaveAttribute("data-outcome", "wrong");
    await expect(page.getByTestId("quiz-feedback-retry")).toHaveCount(0);
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);

    // 3. feladat: ROSSZ drón, „Miért?” nélkül → a helyes drón ≥ 1,8 mp-ig zölden látszik.
    // A kijelzés hossza a LAPON BELÜL, képkockánként mérve (main CI 43943054869, 2. próba; kanban #58): a Playwright-oldali
    // `waitForTimeout(1500)` + a közbeeső parancsok oda-vissza útja a lassú, szoftveres WebGL-es CI-n 2 mp fölé nyúlt, így
    // a mérés a már lezárt kijelzést nézte. A mérce (≥ 1,8 mp) változatlan; ugyanez a minta: game-explanation-pause.spec.ts.
    await expect(page.locator('[data-testid="sq-answers"] [data-state="correct"]')).toHaveCount(0, { timeout: 15_000 });
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    const armReveal = () => page.evaluate(() => {
      const w = window as unknown as { __sqReveal?: { start: number | null; end: number | null } };
      w.__sqReveal = { start: null, end: null };
      const tick = () => {
        const on = document.querySelector('[data-testid="sq-answers"] [data-correct="true"][data-state="correct"]') !== null;
        const r = w.__sqReveal!;
        if (r.start === null && on) r.start = performance.now();
        if (r.start !== null && r.end === null && !on) r.end = performance.now();
        if (r.end === null) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const reveal = () => page.evaluate(() => (window as unknown as { __sqReveal: { start: number | null; end: number | null } }).__sqReveal);
    const third = await answerRound(page, false, armReveal);
    expect(third.outcome, "a rossz drón érintése hibás válasz").toBe("wrong");
    expect(third.wrongDrones, "pontosan a koppintott rossz drón vált pirosra").toBe(1);
    await Promise.all(third.wave.map(node => node.dispose()));
    await expect.poll(async () => (await reveal()).start !== null, { timeout: 5_000 }).toBe(true);
    await expect.poll(async () => (await reveal()).end !== null, { timeout: 20_000 }).toBe(true);
    const r = await reveal();
    expect(r.end! - r.start!, "a megoldás ≥ 1,8 mp-ig látszik").toBeGreaterThanOrEqual(1_800);

    // Innen minden feladatra rossz válasz, fosztogató-lövés nincs: a tanító szakasz után a torony elesik.
    // E2E-ingadozók 3. kör (kanban #76): a hurok állapotát EGY atomi lap-hívás olvassa (C-64). A régi `count()` → `boundingBox()`
    // pár között a drón eltűnhetett, és a `boundingBox()` (időkorlát nélkül) a KÖVETKEZŐ drónra várt — menetvégen újabb nem
    // jön, így a lépés a 180 s-os tesztkeretig lógott.
    const over = page.getByTestId("sq-over");
    for (let i = 0; i < 40; i++) {
      const s = await page.evaluate(() => {
        if ((document.querySelector('[data-testid="sq-over"]')?.getClientRects().length ?? 0) > 0) return { over: true, tap: null };
        const revealing = document.querySelector('[data-testid="sq-answers"] [data-state="correct"]') !== null;
        const wrong = document.querySelector('[data-testid="sq-answers"] [data-correct="false"]');
        if (revealing || !wrong) return { over: false, tap: null };
        const r = wrong.getBoundingClientRect();
        return { over: false, tap: r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null };
      });
      if (s.over) break;
      if (s.tap) {
        await page.touchscreen.tap(s.tap.x, s.tap.y);
        await expect(page.getByTestId("play-question-more")).toHaveCount(0);
      }
      await page.waitForTimeout(2_000);
    }
    await expect(over).toBeVisible({ timeout: 60_000 });
    await shot(page, "touch-result.jpg");
    // Eredmény: a hibázott tételek a helyes válasszal („Gyakorold még”), következő cél, automatikus újraindítás nincs.
    await expect(page.getByTestId("result-review")).toBeVisible();
    expect(await page.getByTestId("result-review-item").count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("sq-next-goal")).toBeVisible();
    await page.waitForTimeout(2_000);
    await expect(over, "a menet vége után nincs automatikus újraindítás").toBeVisible();
    await page.getByRole("button", { name: "Új futam" }).tap();
    await expect(page.getByTestId("sq-score")).toContainText("Pont: 0");
    await expect(world).toBeVisible();
    expect(errors.filter((e) => !/401|Failed to fetch/i.test(e))).toEqual([]);
  });
});

test.describe("J1: a játék a kérdés alatt fut (lassítva, ≥ 0,35×), szünetben áll", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("nyitott kérdésnél a sim-idő / valós idő ≥ 0,35 és < 1; szünetben 0", async ({ page }) => {
    await page.goto("/games/speed-quiz-math?seed=9");
    await page.getByTestId("sq-start").click();
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    const rate = (ms: number) =>
      page.evaluate(async (wait) => {
        const api = (window as unknown as { __websuliGame: { probe: () => { simTime: number; questionOpen: number } } }).__websuliGame;
        const s0 = api.probe().simTime;
        const t0 = performance.now();
        await new Promise((r) => setTimeout(r, wait));
        return { r: (api.probe().simTime - s0) / (performance.now() - t0), open: api.probe().questionOpen };
      }, ms);
    const during = await rate(1000);
    expect(during.open, "a mérés végén is nyitott a kérdés").toBe(1);
    expect(during.r).toBeGreaterThanOrEqual(0.35 * 0.9);
    expect(during.r).toBeLessThan(0.9);
    await page.getByTestId("game-pause").click();
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    expect((await rate(600)).r, "szünetben a szimuláció áll").toBe(0);
  });
});

test.describe("két ujj egyszerre (K.4/15, terv 8.4)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("két drón egyszerre megérintve: csak az első válasz számít; a második ujj alatt a lövés is működik", async ({ page }) => {
    await page.goto("/games/speed-quiz-math?seed=5");
    await page.getByTestId("sq-start").tap();
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    await page.waitForTimeout(650);
    const wrongBox = (await page.locator('[data-testid="sq-answers"] [data-correct="false"]').first().boundingBox())!;
    const rightBox = (await page.locator('[data-testid="sq-answers"] [data-correct="true"]').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const pt = (b: { x: number; y: number; width: number; height: number }, id: number) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2, id });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(wrongBox, 1), pt(rightBox, 2)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const answered = await page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => { questionsAnswered: number; questionsCorrect: number } } }).__websuliGame.probe());
    expect(answered.questionsAnswered, "egy kérdésre egy válasz").toBe(1);
    // A két mutató közül az egyik nem elsődleges: ha a választás `click`-re épülne, egyik sem számítana (mutáció-ellenőrzés).
    await expect(page.locator('[data-testid="sq-answers"] [data-state="correct"]')).toHaveCount(1);
  });

  test("mozgó érintési cél: lenyomás a drónon → elhúzás → felengedés máshol = NINCS válasz; utána sima koppintás = válasz", async ({ page }) => {
    await page.goto("/games/speed-quiz-math?seed=6");
    await page.getByTestId("sq-start").tap();
    await expect(drones(page)).toHaveCount(4, { timeout: 15_000 });
    await page.waitForTimeout(650);
    const box = (await page.locator('[data-testid="sq-answers"] [data-correct="true"]').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
    for (let k = 1; k <= 6; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx, y: cy + 25 * k, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const probe = () => page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => { questionsAnswered: number; reveal: number } } }).__websuliGame.probe());
    await page.waitForTimeout(150);
    expect((await probe()).questionsAnswered, "az elhúzott (visszavont) érintés nem válasz").toBe(0);
    await expect(page.locator('[data-testid="sq-answers"] [data-state="correct"]')).toHaveCount(0);
    await page.touchscreen.tap(cx, cy);
    await expect.poll(async () => (await probe()).questionsAnswered).toBe(1);
  });
});
