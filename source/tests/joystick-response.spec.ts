import { devices, expect, test, type CDPSession, type Page } from "@playwright/test";

import { CASE as blockCraft } from "./game-mobile-cases/block-craft-quiz";
import { CASE as spaceAsteroid } from "./game-mobile-cases/space-asteroid-quiz";
import { CASE as tornado } from "./game-mobile-cases/tornado-hunter-200";
import { CASE as tsunami } from "./game-mobile-cases/tsunami-english";
import type { GameMobileCase } from "./support/game-mobile-quality";

/**
 * Joystick-reakció (kanban #49, `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` „Joystick-reakció”).
 *
 * A tulajdonos valódi telefonon: „a joystick nagyon lassan reagál, és nem lehet finoman vezérelni”. Ez a mérő a
 * teljes láncot nézi az ujjtól a képernyőig, valódi (CDP) érintés-eseményekkel, teszt-kampó nélküli bemenettel:
 *  - a lapba injektált rögzítő minden pointer-esemény időbélyegét és minden képkocka elején a játék mozgásállapotát
 *    (`(window as unknown as InputWindow).__websuliInput.probes`, `GE/inputProbe.ts`) és a tárcsa gombjának helyét írja;
 *  - lépcső: az ujj egy mozdulattal teljes kitérésbe ugrik → hány képkocka múlva változik a gomb, a játék bemenete
 *    és a mozgás; mennyi idő alatt éri el a bemenet / a mozgás a végérték 63 / 90%-át;
 *  - finomság: 5…100%-os vízszintes kitérésnél a kialakuló mozgás a teljes kitéréshez mérve;
 *  - render-szám: a húzás alatt hányszor renderel a tárcsa és a játéklap.
 * A küszöbök KÉPKOCKÁBAN vannak megadva (a CI szoftveres WebGL-je lassú, de a képkocka-szám arányos marad).
 * `JOY_MEASURE=1`: a teljes mérés 1× / 4× / 6× CPU-lassítással, JSON-sorokkal (`JOY_RESULT …`) a kimeneten.
 */

test.use({ serviceWorkers: "block", ...devices["Pixel 7"] });

const MEASURE = process.env.JOY_MEASURE === "1";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "4");
    localStorage.setItem("websuli.spaceQuiz.grade", "4");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = { id: "fixture", isAdmin: false, firstName: "Teszt", classroom: 4, classrooms: [4] };
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    if (p === "/api/games/score" && route.request().method() === "POST") data = { ok: true };
    await route.fulfill({ json: data });
  });
});

type InputWindow = Window & {
  __websuliInput?: { probes: Record<string, () => Record<string, number>>; renders: Record<string, number> };
};

type Frame = { t: number; knobX: number; knobY: number; [k: string]: number };
type Rec = { frames: Frame[]; events: Array<{ type: string; t: number; d: number }> };

type GameSpec = {
  case: GameMobileCase;
  probe: string;
  viewport: { width: number; height: number };
  /** Az ujj függőleges eltolása a sugár arányában (a Tornadónál gáz kell a kormányzáshoz). */
  dy: number;
  /** Mennyi ideig tartjuk a gázt a lépcső előtt (ms). */
  prerollMs: number;
  /** A játék bemenetét jelző mező (a tárcsa értékéből képzett, a hurok által olvasott érték). */
  input: string;
  /** A mozgás mértéke egy képkockában (pl. irányszög-sebesség, oldalsebesség). */
  motion: (prev: Frame, cur: Frame) => number;
  holdMs: number;
};

const rate = (key: string) => (prev: Frame, cur: Frame) => {
  const dt = (cur.t - prev.t) / 1000;
  return dt > 0 ? (cur[key]! - prev[key]!) / dt : 0;
};

const GAMES: GameSpec[] = [
  {
    case: tornado,
    probe: "tornado",
    viewport: { width: 844, height: 390 },
    dy: -0.5,
    prerollMs: 1500,
    input: "steerIn",
    motion: rate("heading"),
    holdMs: 700,
  },
  {
    case: spaceAsteroid,
    probe: "space",
    viewport: { width: 390, height: 844 },
    dy: 0,
    prerollMs: 0,
    input: "inX",
    motion: (_p, c) => c.vx!,
    holdMs: 320,
  },
  {
    case: tsunami,
    probe: "tsunami",
    viewport: { width: 390, height: 844 },
    dy: 0,
    prerollMs: 0,
    input: "inX",
    motion: rate("x"),
    holdMs: 500,
  },
  {
    case: blockCraft,
    probe: "blockcraft",
    viewport: { width: 390, height: 844 },
    dy: 0,
    prerollMs: 0,
    input: "inX",
    motion: (_p, c) => c.strafe!,
    holdMs: 400,
  },
];

async function startGame(page: Page, g: GameSpec): Promise<void> {
  await page.setViewportSize(g.viewport);
  await page.goto(g.case.path);
  const start = g.case.startTestId
    ? page.getByTestId(g.case.startTestId).first()
    : page.getByRole("button", { name: g.case.startName! }).first();
  await expect(start).toBeVisible({ timeout: 20_000 });
  const gate = page.getByTestId("classroom-gate-modal");
  if (await gate.isVisible()) await gate.getByTestId("button-grade-3").click();
  await start.click();
  await g.case.playReady(page);
  await expect(page.getByTestId("virtual-joystick")).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction((id) => Boolean((window as unknown as InputWindow).__websuliInput?.probes[id]), g.probe, { timeout: 15_000 });
  // A belépő animációk lecsengése.
  await page.waitForTimeout(800);
}

async function installRecorder(page: Page, probe: string): Promise<void> {
  await page.evaluate((id) => {
    const rec: Rec = { frames: [], events: [] };
    (window as unknown as { __joyRec: Rec }).__joyRec = rec;
    const log = (e: Event) => {
      rec.events.push({ type: e.type, t: e.timeStamp, d: performance.now() });
    };
    for (const type of ["pointerdown", "pointermove", "pointerup"]) {
      window.addEventListener(type, log, { capture: true, passive: true });
    }
    const knobOf = () => document.querySelector<HTMLElement>('[data-testid="virtual-joystick"] > span[aria-hidden="true"]');
    const loop = () => {
      const read = (window as unknown as InputWindow).__websuliInput?.probes[id];
      const knob = knobOf();
      const m = knob ? /translate(?:3d)?\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(knob.style.transform) : null;
      if (read) rec.frames.push({ t: performance.now(), knobX: m ? Number(m[1]) : 0, knobY: m ? Number(m[2]) : 0, ...read() });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, probe);
}

/** Vár, amíg a rögzítő legalább `n` képkockát gyűjtött (legfeljebb 6 s). */
async function waitFrames(page: Page, n: number): Promise<void> {
  await page
    .waitForFunction((min) => ((window as unknown as { __joyRec?: Rec }).__joyRec?.frames.length ?? 0) >= min, n, {
      timeout: 6_000,
      polling: 50,
    })
    .catch(() => undefined);
}

/**
 * A rögzítő kiürítése. #58 (2. kör): ugyanabban a lap-hívásban jelzi azt is, hogy nyitva van-e kérdés (`quizScope`) —
 * a CI-ben a Kockavadász minden Playwright-hívása egy ~0,7 s-os képkockára vár, ezért a külön `isVisible` lépcsőnként
 * egy képkockát fogyasztott.
 */
async function readRec(page: Page, quizScope?: string): Promise<Rec & { quizOpen: boolean }> {
  return page.evaluate((scope) => {
    const rec = (window as unknown as { __joyRec: Rec }).__joyRec;
    const out = { frames: rec.frames.slice(), events: rec.events.slice() };
    rec.frames.length = 0;
    rec.events.length = 0;
    const q = scope ? document.querySelector(scope) : null;
    return { ...out, quizOpen: !!q && q.getClientRects().length > 0 };
  }, quizScope ?? null);
}

async function renders(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => ({ ...((window as unknown as InputWindow).__websuliInput?.renders ?? {}) }));
}

type Stick = { cx: number; cy: number; r: number };

/**
 * A tárcsa helye. #58 (2. kör): a tárcsa a teszt alatt nem mozdul (rögzített nézet), ezért lapon belül egyszer mérjük; új
 * körnél (`ensurePlaying` lassú útja) a gyorsítótár törlődik.
 */
const stickCache = new WeakMap<Page, Stick>();

async function stickGeometry(page: Page): Promise<Stick> {
  const cached = stickCache.get(page);
  if (cached) return cached;
  const box = (await page.getByTestId("virtual-joystick").boundingBox({ timeout: 15_000 }))!;
  const s = { cx: box.x + box.width / 2, cy: box.y + box.height / 2, r: box.width / 2 };
  stickCache.set(page, s);
  return s;
}

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", x?: number, y?: number) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x: x!, y: y!, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
  });
}

/**
 * Mérés előtti bizonyíték, hogy a játék tényleg fogadja a tárcsát: egy teljes jobbra húzásra a játék bemenet-mezője
 * (`probe()[g.input]`) megváltozik. Ha nem, a teszt diagnosztikával bukik (képernyőkép, a látható fedőrétegek, a pont
 * alatti elem) — így egy fedőréteg vagy egy rossz helyre eső érintés nem „lassú mérésként”, hanem okkal jelenik meg.
 */
async function assertStickReachesGame(page: Page, cdp: CDPSession, g: GameSpec): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await ensurePlaying(page, g);
    const s = await stickGeometry(page);
    await touch(cdp, "touchStart", s.cx, s.cy);
    await touch(cdp, "touchMove", s.cx + 0.9 * s.r, s.cy);
    const ok = await page
      .waitForFunction(
        ({ id, key }) => Math.abs((window as unknown as InputWindow).__websuliInput?.probes[id]?.()[key] ?? 0) > 0.05,
        { id: g.probe, key: g.input },
        { timeout: 8_000, polling: 50 },
      )
      .then(() => true)
      .catch(() => false);
    await touch(cdp, "touchEnd");
    await page.waitForTimeout(300);
    if (ok) return;
  }
  const s = await stickGeometry(page);
  const diag = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const overlays = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-testid*="quiz"], [data-testid*="rotate"], [data-testid*="gate"]'))
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => (e as HTMLElement).dataset.testid ?? e.getAttribute("role") ?? e.tagName);
      return { under: el ? `${el.tagName}[data-testid=${(el as HTMLElement).dataset.testid ?? ""}]` : "semmi", overlays };
    },
    { x: s.cx, y: s.cy },
  );
  await page.screenshot({ path: test.info().outputPath(`${g.case.id}-no-input.png`) });
  throw new Error(`${g.case.id}: a tárcsa húzása nem jut el a játékhoz (${g.input} nem változik). A tárcsa közepe alatt: ${diag.under}; látható fedőrétegek: ${JSON.stringify(diag.overlays)}`);
}

const median = (a: number[]) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

function frameMs(frames: Frame[]): number {
  const d: number[] = [];
  for (let i = 1; i < frames.length; i++) d.push(frames[i]!.t - frames[i - 1]!.t);
  return median(d);
}

type Step = {
  frameMs: number;
  /** Az érintés-esemény keletkezése → a lap kezelője megkapja (a böngésző képkockához igazított bemenet-kézbesítése). */
  dispatchMs: number;
  /** Az érintés-esemény → az első képkocka, amelyben a gomb / a bemenet / a mozgás megváltozott (ms). */
  knobMs: number;
  inputMs: number;
  motionMs: number;
  input63Ms: number;
  input90Ms: number;
  motion63Ms: number;
  motion90Ms: number;
  steadyInput: number;
  steadyMotion: number;
};

/** Lépcső-elemzés: `t0` a lépcső érintés-eseményének időbélyege. */
function analyseStep(rec: Rec, g: GameSpec, t0: number, sign: number, d0 = NaN): Step {
  const fr = rec.frames;
  const fm = frameMs(fr);
  const after = fr.filter((f) => f.t >= t0);
  const before = fr.filter((f) => f.t < t0);
  const base = before[before.length - 1] ?? after[0]!;
  const motions: Array<{ t: number; v: number }> = [];
  for (let i = 1; i < fr.length; i++) if (fr[i]!.t >= t0) motions.push({ t: fr[i]!.t, v: sign * g.motion(fr[i - 1]!, fr[i]!) });
  const baseMotion = (() => {
    const pre: number[] = [];
    for (let i = Math.max(1, before.length - 6); i < before.length; i++) pre.push(sign * g.motion(fr[i - 1]!, fr[i]!));
    return pre.length ? median(pre) : 0;
  })();
  const end = after[after.length - 1]!.t;
  const tail = (from: number) => after.filter((f) => f.t >= from);
  const steadyWin = Math.max(200, 3 * fm);
  const steadyFrames = tail(end - steadyWin);
  const steadyInput = median(steadyFrames.map((f) => sign * f[g.input]!));
  const steadyMotion = median(motions.filter((m) => m.t >= end - steadyWin).map((m) => m.v));
  const firstT = (pred: (f: Frame) => boolean) => after.find(pred)?.t ?? NaN;
  const knobMs = firstT((f) => Math.abs(f.knobX - base.knobX) > 0.5) - t0;
  const inputMs = firstT((f) => Math.abs(f[g.input]! - base[g.input]!) > 1e-6) - t0;
  const eps = Math.max(1e-6, Math.abs(steadyMotion - baseMotion) * 0.03);
  const motionMs = (motions.find((m) => Math.abs(m.v - baseMotion) > eps)?.t ?? NaN) - t0;
  const reach = (vals: Array<{ t: number; v: number }>, from: number, to: number, frac: number) =>
    (vals.find((m) => (to - from) * (m.v - from) >= frac * (to - from) * (to - from))?.t ?? NaN) - t0;
  const inputVals = after.map((f) => ({ t: f.t, v: sign * f[g.input]! }));
  const baseInput = sign * base[g.input]!;
  return {
    frameMs: fm,
    dispatchMs: d0 - t0,
    knobMs,
    inputMs,
    motionMs,
    input63Ms: reach(inputVals, baseInput, steadyInput, 0.63),
    input90Ms: reach(inputVals, baseInput, steadyInput, 0.9),
    motion63Ms: reach(motions, baseMotion, steadyMotion, 0.63),
    motion90Ms: reach(motions, baseMotion, steadyMotion, 0.9),
    steadyInput,
    steadyMotion,
  };
}

/**
 * A játék közben felugró kérdést (Tornado „viharkérdés”, Aszteroida „Vészhelyzet”) helyes válasszal elhárítjuk — a mérés
 * a vezetésről szól. #58 (run 43916330845): ha a kérdés épp a lépcső érintése alá nyílt, az érintés egy rossz választ
 * koppintott; ilyenkor a válaszgombok letiltva maradnak, amíg a magyarázókártyát be nem zárják — a korábbi feltétlen
 * `click()` a letiltott gombra 180 s-ig várt. Most: kártya bezárása, csak engedélyezett gombra kattintás, korlátos körök.
 */
async function clearQuiz(page: Page, g: GameSpec): Promise<boolean> {
  const card = page.getByTestId("quiz-feedback-dismiss");
  const correct = page.locator(`${g.case.quizScope} [data-correct="true"]`).first();
  let acted = false;
  for (let round = 0; round < 4; round++) {
    if (await card.isVisible().catch(() => false)) {
      await card.click({ timeout: 5_000 });
      acted = true;
      await page.waitForTimeout(500);
      continue;
    }
    if (!(await correct.isVisible().catch(() => false))) break;
    if (!(await correct.isEnabled().catch(() => false))) {
      // Kiértékelés alatt (a helyes válasz kiemelve, a gombok letiltva): megvárjuk a következő állapotot.
      await page.waitForTimeout(500);
      continue;
    }
    await correct.click({ timeout: 5_000 });
    acted = true;
    await page.waitForTimeout(1500);
  }
  return acted;
}

/**
 * #58 (run 43916330845): a mérés valós ideje terhelés alatt nő, és a lövés nélkül vezetett Aszteroida-hajó közben
 * elfogyhat („Kör vége”) — a tárcsa eltűnik, és a `boundingBox` 180 s-ig várt rá. A kör vége nem mérési eredmény:
 * új kört indítunk (ugyanaz az indítási út, mint a teszt elején), és a mérés folytatódik.
 */
async function ensurePlaying(page: Page, g: GameSpec): Promise<void> {
  // Gyors út EGY lap-hívással: a CI szoftveres WebGL-jén minden Playwright-hívás egy képkockára (Kockavadász ~0,7 s) vár,
  // ezért lépcsőnként több `isVisible` a 180 s-os keretet fogyasztaná (PR #470 első CI-futása: block-craft időtúllépés).
  const state = await page.evaluate(
    ({ scope }) => {
      const vis = (el: Element | null) => !!el && el.getClientRects().length > 0;
      return {
        card: vis(document.querySelector('[data-testid="quiz-feedback-dismiss"]')),
        quiz: vis(document.querySelector(`${scope} [data-correct="true"]`)),
        stick: vis(document.querySelector('[data-testid="virtual-joystick"]')),
      };
    },
    { scope: g.case.quizScope ?? "[data-joy-no-quiz]" },
  );
  if (state.stick && !state.card && !state.quiz) return;
  stickCache.delete(page);
  await clearQuiz(page, g);
  const stick = page.getByTestId("virtual-joystick");
  if (await stick.isVisible().catch(() => false)) return;
  const again = page.getByRole("button", { name: "Új kör" });
  if (await again.isVisible().catch(() => false)) {
    await again.click({ timeout: 5_000 });
    await g.case.playReady(page);
  }
  await expect(stick, `${g.case.id}: a tárcsa nem látszik (se játék, se kör vége)`).toBeVisible({ timeout: 15_000 });
}

/** Egy lépcső: ujj le a tárcsa közepén, (gáz), majd egy mozdulattal `fx`-nyi vízszintes kitérés, tartás, fel. */
async function stepRun(page: Page, cdp: CDPSession, g: GameSpec, fx: number): Promise<{ rec: Rec; t0: number; d0: number }> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await stepOnce(page, cdp, g, fx);
    } catch (err) {
      // Bezárt oldalon (időtúllépés, összeomlás) nincs mit mérni: az eredeti hibát adjuk tovább, nem egy CDP-hibát.
      if (page.isClosed()) throw err;
      // Mérés közben felugró kérdés: elhárítjuk és megismételjük (legfeljebb háromszor).
      // #58: a kör vége is ide tartozik (ensurePlaying új kört indít).
      if (attempt >= 3) throw err;
      const quizCleared = await clearQuiz(page, g);
      const stickGone = !(await page.getByTestId("virtual-joystick").isVisible().catch(() => false));
      if (!quizCleared && !stickGone) throw err;
      await ensurePlaying(page, g);
    }
  }
}

async function stepOnce(page: Page, cdp: CDPSession, g: GameSpec, fx: number): Promise<{ rec: Rec; t0: number; d0: number }> {
  await ensurePlaying(page, g);
  const s = await stickGeometry(page);
  const y = s.cy + g.dy * s.r;
  await touch(cdp, "touchStart", s.cx, s.cy);
  await page.waitForTimeout(60);
  if (g.dy !== 0) {
    await touch(cdp, "touchMove", s.cx, y);
    await page.waitForTimeout(g.prerollMs);
  } else {
    await page.waitForTimeout(150);
  }
  await readRec(page); // a lépcső előtti rész eldobva — de az utolsó néhány képkocka kell az alapértékhez:
  await page.waitForTimeout(120);
  await waitFrames(page, 3);
  await touch(cdp, "touchMove", s.cx + fx * s.r, y);
  await page.waitForTimeout(g.holdMs);
  // A CI szoftveres WebGL-je lassú (Kockavadász ~10 fps): a tartás legalább 15 képkockáig tart, hogy az állandósult
  // érték és a 63 / 90%-os pont mérhető legyen.
  await waitFrames(page, 18);
  const rec = await readRec(page, g.case.quizScope);
  await touch(cdp, "touchEnd");
  await page.waitForTimeout(400);
  const moves = rec.events.filter((e) => e.type === "pointermove");
  const t0 = moves[moves.length - 1]?.t ?? NaN;
  const d0 = moves[moves.length - 1]?.d ?? NaN;
  if (!Number.isFinite(t0) || rec.frames.length < 5 || rec.quizOpen) {
    // A rögzítő a lépcső ELŐTT ürül (a lenyomás és a gáz eldobva), ezért itt csak a lépcső `pointermove`-ja várható.
    throw new Error(`${g.case.id}: nincs mérhető lépcső (a lépcső óta: események ${JSON.stringify(rec.events.map((e) => e.type))}, képkockák ${rec.frames.length})`);
  }
  return { rec, t0, d0 };
}

async function measureGame(page: Page, g: GameSpec, cpu: number) {
  const cdp = await page.context().newCDPSession(page);
  await installRecorder(page, g.probe);
  if (cpu === 1) await assertStickReachesGame(page, cdp, g);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const steps: Step[] = [];
  for (let i = 0; i < 2; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const { rec, t0, d0 } = await stepRun(page, cdp, g, sign * 0.95);
    steps.push(analyseStep(rec, g, t0, sign, d0));
  }
  const fine: Array<{ pct: number; input: number; motion: number }> = [];
  if (MEASURE || cpu === 1) {
    for (const pct of [5, 10, 20, 30, 40, 55, 70, 100]) {
      const sign = pct % 2 === 0 ? 1 : -1;
      const { rec, t0 } = await stepRun(page, cdp, g, (sign * pct) / 100);
      const a = analyseStep(rec, g, t0, sign);
      fine.push({ pct, input: a.steadyInput, motion: a.steadyMotion });
    }
  }
  // Render-szám: ugyanolyan hosszú, ugyanolyan kitérésű tartás kétszer — egyszer 30, kis amplitúdóval rezgő mozgással,
  // egyszer álló ujjal (2 esemény). A játék mozgása (és vele a HUD / állapot-renderek) mindkettőben azonos, így a
  // különbség az eseményenkénti render.
  // E2E-ingadozók 3. kör (kanban #76): a két szakasznak a valós időben is azonos hosszúnak kell lennie. A rezgő szakaszban
  // minden CDP-érintés megvárja, hogy a lap feldolgozza (szoftveres WebGL-en egy képkocka), az álló szakasz csak 30 × 16 ms-ot
  // vár — a régi álló szakasz így jóval rövidebb volt (helyben, CI-azonos úton mérve 1,2 s a rezgő 11 s mellett), és a kis
  // álló darabszám (0–2) egy ~9–30-szoros szorzóval arányosítódott. Egy render többé-kevésbé az álló ablakban a „többletet”
  // ±9…30-cal tolta el (main CI 44049286407: tárcsa 23 > 6, a korábbi futásokban ugyanott −12 és −6). Most előbb a rezgő
  // szakasz fut, és az álló legalább ugyanannyi ideig tart (a nyers számok a JOY_RESULT-ban); a küszöb (≤ 6) változatlan.
  const s = await stickGeometry(page);
  const hold = async (jiggle: boolean, minMs = 0): Promise<{ counts: Record<string, number>; ms: number }> => {
    await ensurePlaying(page, g);
    const y = s.cy + g.dy * s.r;
    await touch(cdp, "touchStart", s.cx, s.cy);
    await touch(cdp, "touchMove", s.cx + 0.8 * s.r, y);
    const a = await renders(page);
    const t0 = Date.now();
    for (let i = 1; i <= 30 || Date.now() - t0 < minMs; i++) {
      if (jiggle && i <= 30) await touch(cdp, "touchMove", s.cx + (i % 2 === 0 ? 0.75 : 0.85) * s.r, y);
      await page.waitForTimeout(16);
    }
    const b = await renders(page);
    const ms = Date.now() - t0;
    // Képernyőkép húzás közben (a gomb az ujj alatt), ha kérik: JOY_SHOT_DIR=<mappa>.
    if (jiggle && process.env.JOY_SHOT_DIR) {
      const vp = page.viewportSize();
      await page.screenshot({
        path: `${process.env.JOY_SHOT_DIR}/${g.case.id}-${vp?.width}x${vp?.height}-joystick.jpg`,
        type: "jpeg",
        quality: 70,
        scale: "css",
      });
    }
    await touch(cdp, "touchEnd");
    await page.waitForTimeout(300);
    const counts: Record<string, number> = {};
    for (const k of Object.keys(b)) counts[k] = (b[k] ?? 0) - (a[k] ?? 0);
    return { counts, ms };
  };
  const moving = await hold(true);
  const still = await hold(false, moving.ms);
  const renderDelta: Record<string, number> = {};
  const renderDrag = moving.counts;
  for (const k of Object.keys(moving.counts)) {
    // A két szakasz hossza a CDP-hívások miatt eltérhet: az álló szakasz számát a mozgó hosszára arányosítjuk.
    renderDelta[k] = moving.counts[k]! - Math.round(((still.counts[k] ?? 0) * moving.ms) / Math.max(1, still.ms));
  }
  const dragMs = moving.ms;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  // A JOY_RESULT-sorban az álló szakasz nyers száma és hossza is látszik (ingadozás-elemzéshez).
  return { steps, fine, renderDelta, renderDrag, dragMs, renderStill: still.counts, stillMs: still.ms, radius: s.r };
}

const PAGE_RENDER_KEY: Record<string, string> = {
  tornado: "tornado-play",
  space: "space-page",
  tsunami: "tsunami-page",
  blockcraft: "blockcraft-page",
};

/**
 * Elfogadás (képkockában, hogy a CI lassú szoftveres megjelenítésén is stabil legyen):
 *  - a lap kezelője → a játék bemenete ≤ 2 képkocka (nincs hozzáadott késleltetés / simítás a bemeneten);
 *  - a tárcsa gombja nem később látszik, mint ahogy a játék a bemenetet megkapja;
 *  - a bemenet lépcsőválaszának 90%-a ≤ 3 képkocka a kezelőtől;
 *  - folytonos, finom görbe: 20–40%-os kitérés már mozgat, de a teljesnél kevésbé; 10%-nál ≤ a maximum 10%-a;
 *  - a húzás nem renderel eseményenként: 30 mozgás-esemény a lapon és a tárcsán legfeljebb 6 többlet-rendert okoz
 *    (az álló ujjhoz képest), és a tárcsa legfeljebb 2-vel többször renderel, mint a lap.
 */
function assertAccepted(g: GameSpec, m: Awaited<ReturnType<typeof measureGame>>): void {
  for (const st of m.steps) {
    const f = st.frameMs;
    expect(st.inputMs - st.dispatchMs, `${g.case.id}: kezelő → bemenet (${f.toFixed(1)} ms/kk)`).toBeLessThanOrEqual(2 * f + 4);
    expect(st.knobMs, `${g.case.id}: a gomb a bemenet után rajzolódik`).toBeLessThanOrEqual(st.inputMs + 0.5 * f);
    expect(st.input90Ms - st.dispatchMs, `${g.case.id}: bemenet 90%`).toBeLessThanOrEqual(3 * f + 4);
  }
  const at = (pct: number) => m.fine.find((x) => x.pct === pct)!.input;
  const full = at(100);
  expect(full, `${g.case.id}: teljes kitérés`).toBeGreaterThan(0);
  expect(at(10) / full, `${g.case.id}: 10% kitérés`).toBeLessThanOrEqual(0.1);
  for (const pct of [30, 40, 55]) {
    expect(at(pct) / full, `${g.case.id}: ${pct}% kitérés már mozgat`).toBeGreaterThan(0.02);
    expect(at(pct) / full, `${g.case.id}: ${pct}% kitérés nem teljes`).toBeLessThan(0.8);
  }
  const pageKey = PAGE_RENDER_KEY[g.probe]!;
  const joy = m.renderDrag.joystick ?? 0;
  const pageDrag = m.renderDrag[pageKey] ?? 0;
  expect(joy, `${g.case.id}: a tárcsa a húzás alatt eseményenként renderel`).toBeLessThanOrEqual(pageDrag + 2);
  // A 30 mozgás-esemény okozta többlet-render a lapon (rezgő ujj − álló ujj, azonos kitérés és idő): eseményenkénti
  // renderelésnél ~30 lenne; a HUD 10 Hz-es pillanatképe és a Szökőár 24 Hz-es állapota mindkét szakaszban ugyanaz.
  expect(m.renderDelta[pageKey] ?? 0, `${g.case.id}: a mozgás-események többlet-renderje a lapon`).toBeLessThanOrEqual(6);
  expect(m.renderDelta.joystick ?? 0, `${g.case.id}: a mozgás-események többlet-renderje a tárcsán`).toBeLessThanOrEqual(6);
}

for (const g of GAMES) {
  test(`joystick-reakció: ${g.case.id}`, async ({ page }) => {
    // E2E-ingadozók 3. kör: a javított render-mérés álló szakasza a rezgővel azonos hosszú (a CI-n a rezgő 17,6–22,6 s volt).
    // Mérve (main CI 44049286407, a Kockavadász nyomkövetés nélküli kísérletei): 134 s és 145 s a javítás ELŐTT; +17,6…22,6 s
    // → 152–168 s, a 180 s-os keret 84–93%-a. A keret ezért 240 s (a lépések nem lassabbak, csak eggyel több szükséges lépés van).
    test.setTimeout(MEASURE ? 300_000 : 240_000);
    await startGame(page, g);
    const cpus = MEASURE ? [1, 4, 6] : [1];
    for (const cpu of cpus) {
      const m = await measureGame(page, g, cpu);
      // eslint-disable-next-line no-console
      console.log(`JOY_RESULT ${JSON.stringify({ game: g.case.id, cpu, ...m })}`);
      if (cpu === 1) assertAccepted(g, m);
    }
  });
}
