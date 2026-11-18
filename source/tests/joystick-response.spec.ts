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
  /**
   * A render-ablak darabjainak száma (alap: 1 = egy 30 eseményes ablak). Ütemezett kérdésű játéknál a kérdés nélküli szakasz
   * rövidebb lehet egy 30 eseményes ablaknál (`docs/specs/2026-11-18-joystick-tsunami-stabil.md`): a 30 esemény ennyi egyenlő
   * darabban megy le, a számlálók és a hosszak összeadódnak. A 30 osztója legyen.
   */
  renderChunks?: number;
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
    // A Szökőár 8,2–10,9 mp-enként kapukérdést indít (`tsunamiDirectorConfig`); a CI-n egy 30 eseményes ablak 2,8–7 mp, a
    // helyesen megválaszolt kérdés utáni kérdés nélküli szakasz ~5,8–8,5 mp — a 10 eseményes darab biztosan belefér.
    renderChunks: 3,
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
async function readRec(page: Page, quizScope?: string): Promise<Rec & { quizOpen: boolean; stickGone: boolean }> {
  return page.evaluate((scope) => {
    const rec = (window as unknown as { __joyRec: Rec }).__joyRec;
    const out = { frames: rec.frames.slice(), events: rec.events.slice() };
    rec.frames.length = 0;
    rec.events.length = 0;
    const q = scope ? document.querySelector(scope) : null;
    // A tárcsa csak élő kör alatt van a lapon: ha a lépcső végére eltűnt, a kör a mérés ALATT ért véget (nem mérési eredmény).
    const stick = document.querySelector('[data-testid="virtual-joystick"]');
    return { ...out, quizOpen: !!q && q.getClientRects().length > 0, stickGone: !stick || stick.getClientRects().length === 0 };
  }, quizScope ?? null);
}

/**
 * Látható kérdés-jel (a játék saját kérdés-rétege, a közös kérdés-sáv időzítője, a magyarázókártya). Kérdés alatt a játékok
 * hurka megáll / másképp renderel (Szökőár: a 24 Hz-es hurok helyett csak az 1 mp-es visszaszámláló), ezért az ilyen ablak
 * render-száma nem vethető össze a kérdés nélkülivel.
 */
const quizSelector = (g: GameSpec) =>
  [g.case.quizScope, '[data-testid="play-question-timer"]', '[data-testid="quiz-feedback"]'].filter(Boolean).join(", ");

/**
 * Render-ablak (E2E-ingadozók 3. kör, kanban #106): a kezdő olvasás képkockánkénti figyelőt indít, amely jelzi, ha az ablak alatt
 * BÁRMIKOR látszott kérdés-jel; a záró olvasás ugyanabban a lap-hívásban adja a számlálókat és ezt a jelzőt (C-64).
 * 2026-11-18 (`docs/specs/2026-11-18-joystick-tsunami-stabil.md`): a figyelő azt is jelzi, ha a tárcsa az ablak alatt eltűnt
 * (`gone` — a kör véget ért): álló játékon mért ablak nem vethető össze élő játékon mérttel.
 */
type RenderWin = { quiz: boolean; gone: boolean; on: boolean };

async function rendersOpen(page: Page, quizSel: string): Promise<Record<string, number>> {
  return page.evaluate((sel) => {
    const w = window as unknown as InputWindow & { __joyWin?: RenderWin };
    const win: RenderWin = { quiz: false, gone: false, on: true };
    w.__joyWin = win;
    const vis = (s: string) => Array.from(document.querySelectorAll(s)).some((el) => el.getClientRects().length > 0);
    const tick = () => {
      if (!win.on) return;
      if (vis(sel)) win.quiz = true;
      if (!vis('[data-testid="virtual-joystick"]')) win.gone = true;
      requestAnimationFrame(tick);
    };
    tick();
    return { ...(w.__websuliInput?.renders ?? {}) };
  }, quizSel);
}

async function rendersClose(page: Page, quizSel: string): Promise<{ counts: Record<string, number>; quiz: boolean; gone: boolean }> {
  return page.evaluate((sel) => {
    const w = window as unknown as InputWindow & { __joyWin?: RenderWin };
    const win: RenderWin = w.__joyWin ?? { quiz: true, gone: false, on: false };
    win.on = false;
    const vis = (s: string) => Array.from(document.querySelectorAll(s)).some((el) => el.getClientRects().length > 0);
    return { counts: { ...(w.__websuliInput?.renders ?? {}) }, quiz: win.quiz || vis(sel), gone: win.gone || !vis('[data-testid="virtual-joystick"]') };
  }, quizSel);
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

/** E2E-ingadozók 3. kör: a `touchMove` CDP-hívások mért ideje (darab, összes ms) — az álló render-szakasz hosszához. */
const touchMoveCost = new WeakMap<CDPSession, { n: number; ms: number }>();

/**
 * CI-reprodukció: a CI-n egy Playwright / CDP-hívás 0,5–1,3 s, a lap órája közben a falióra szerint halad. `JOY_CI_LAG_MS=<ms>`
 * ezt a késést teszi minden érintés után helyben; `JOY_CPU=<n>` CPU-lassítás a mérés alatt (mindkettő alapból kikapcsolva).
 */
const CI_LAG_MS = Number(process.env.JOY_CI_LAG_MS ?? 0);
const JOY_CPU = Number(process.env.JOY_CPU ?? 1);

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", x?: number, y?: number) {
  const t0 = Date.now();
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x: x!, y: y!, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
  });
  if (CI_LAG_MS > 0) await new Promise<void>((r) => setTimeout(r, CI_LAG_MS));
  if (type === "touchMove") {
    const c = touchMoveCost.get(cdp) ?? { n: 0, ms: 0 };
    c.n += 1;
    c.ms += Date.now() - t0;
    touchMoveCost.set(cdp, c);
  }
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
 *
 * 2026-11-18 (`docs/specs/2026-11-18-joystick-tsunami-stabil.md`, CI 44301362954): a „látható és engedélyezett?” ellenőrzés és
 * a kattintás két külön hívás volt — közben a Szökőár kérdése lejárt, a sáv megoldás-kijelzésbe váltott, a gomb letiltódott,
 * majd lecserélődött, és a kattintás 5 s után időtúllépéssel buktatta a tesztet. Most a kattintás CSAK megválaszolható gombra
 * megy; ha a kérdés közben eldől, az nem hiba (a kör újraolvassa az állapotot), és a várakozások állapotra várnak, nem időre.
 */
const correctSel = (g: GameSpec) => `${g.case.quizScope} [data-correct="true"]`;
/** Megválaszolható jó válasz: a kérdés nyitott és élesített (a gomb látható, nem `aria-disabled`, nem `disabled`). */
const answerableSel = (g: GameSpec) => `${correctSel(g)}:not([aria-disabled="true"]):not(:disabled)`;

type QuizEvent = "answerable" | "closed" | "card";

/**
 * Várakozás a kérdés-réteg állapotára: `answerable` — megválaszolható jó válasz látszik; `closed` — a kérdés jó válasza már nem
 * látszik; `card` — a magyarázókártya látszik. A felsoroltak bármelyike elég. Korlátos; a lejárat nem hiba (`false`).
 */
async function waitQuiz(page: Page, g: GameSpec, any: QuizEvent[], timeout: number): Promise<boolean> {
  return page
    .waitForFunction(
      ({ correct, answerable, events }) => {
        const vis = (sel: string) =>
          Array.from(document.querySelectorAll(sel)).some((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
        return (
          (events.includes("answerable") && vis(answerable)) ||
          (events.includes("closed") && !vis(correct)) ||
          (events.includes("card") && vis('[data-testid="quiz-feedback-dismiss"]'))
        );
      },
      { correct: correctSel(g), answerable: answerableSel(g), events: any },
      { timeout, polling: 50 },
    )
    .then(() => true, () => false);
}

async function clearQuiz(page: Page, g: GameSpec): Promise<boolean> {
  const card = page.getByTestId("quiz-feedback-dismiss");
  const correct = page.locator(correctSel(g)).first();
  const answerable = page.locator(answerableSel(g)).first();
  let acted = false;
  for (let round = 0; round < 4; round++) {
    if (await card.isVisible().catch(() => false)) {
      const t = Date.now();
      await card.click({ timeout: 5_000 });
      acted = true;
      await card.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => undefined);
      await settle(page, t, 500);
      continue;
    }
    if (!(await correct.isVisible().catch(() => false))) break;
    if (!(await answerable.isVisible().catch(() => false))) {
      // Kiértékelés / megoldás-kijelzés alatt (a helyes válasz kiemelve, a gombok letiltva): a KÖVETKEZŐ állapotra várunk.
      await waitQuiz(page, g, ["answerable", "closed", "card"], 3_000);
      continue;
    }
    // A kérdés a kattintás előtt eldőlhet (lejárat, tétlen átfutás): ilyenkor a gomb már nem megválaszolható — újraolvasunk.
    const t = Date.now();
    const clicked = await answerable.click({ timeout: 2_000 }).then(() => true, () => false);
    if (!clicked) continue;
    acted = true;
    // A megválaszolt kérdés lezárulására várunk (eltűnik, vagy hibás koppintásnál a magyarázókártya jön).
    await waitQuiz(page, g, ["closed", "card"], 3_000);
    await settle(page, t, 1500);
  }
  return acted;
}

/**
 * A mérés feltételei ne változzanak: a kérdés lezárulása után a játék (turbó, feliratok) ugyanannyit nyugszik, mint a korábbi
 * rögzített várakozásnál — az állapotra várás UTÁN a `since` óta eltelt időt `minMs`-ig kiegészítjük (soha nem indulunk
 * korábban, mint eddig; az állapot miatt legfeljebb később).
 */
async function settle(page: Page, since: number, minMs: number): Promise<void> {
  const rest = minMs - (Date.now() - since);
  if (rest > 0) await page.waitForTimeout(rest);
}

/** A következő ütemezett kérdésre legfeljebb ennyit várunk (a Szökőár ütemezőjének legnagyobb köze 15 mp, + 1 mp). */
const QUIZ_WAIT_MS = 16_000;

/**
 * Igazítás a kérdés nélküli szakaszhoz (`docs/specs/2026-11-18-joystick-tsunami-stabil.md`, CI 44317537385: „5 próbából sincs
 * kérdés nélküli álló ablak”). Ütemezett kérdésű játéknál a megválaszolatlan kérdés utáni kérdés nélküli szakasz rövid
 * (Szökőár: 0,6–3,3 mp), a helyesen megválaszolt kérdés utáni a leghosszabb (~5,8–8,5 mp). A render-ablak darabja ezért nem
 * véletlen pillanatban indul: megvárjuk a KÖVETKEZŐ megválaszolható kérdést, helyesen megválaszoljuk, megvárjuk, hogy a
 * kérdés-jel eltűnjön — innen indul a darab. Ha a korláton belül nem jön kérdés (pl. új kör bemelegítése), a darab így is
 * elindul; a kérdéssel érintett darabot a hívó megismétli.
 */
async function alignToQuizGap(page: Page, g: GameSpec, quizSel: string): Promise<void> {
  if (!(await waitQuiz(page, g, ["answerable"], QUIZ_WAIT_MS))) return;
  await clearQuiz(page, g);
  await page
    .waitForFunction((sel) => !Array.from(document.querySelectorAll(sel)).some((el) => el.getClientRects().length > 0), quizSel, {
      timeout: 6_000,
      polling: 50,
    })
    .catch(() => undefined);
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
  // E2E-ingadozók 3. kör: a kör győzelemmel is véget érhet (a kérdéseket a `clearQuiz` helyesen válaszolja meg — Szökőár
  // lassítva: „Sikerült elmenekülni!”, „Következő kör”), a #483 Szökőárában a vereség gombja „Újra”; ez sem mérési eredmény.
  const again = page.getByRole("button", { name: /^(Új kör|Következő kör|Újra)$/ });
  if (await again.isVisible().catch(() => false)) {
    await again.click({ timeout: 5_000 });
    await g.case.playReady(page);
  }
  await expect(stick, `${g.case.id}: a tárcsa nem látszik (se játék, se kör vége)`).toBeVisible({ timeout: 15_000 });
}

/**
 * A lépcső mérési ablakában látható kérdés volt, vagy a kör a lépcső alatt véget ért (a tárcsa eltűnt): a lépcsőt meg kell
 * ismételni (nem mérési eredmény).
 */
class StepQuizError extends Error {}

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
      // E2E-ingadozók 3. kör (#483 CI 44124385498: „nincs mérhető lépcső … képkockák 22”): a lépcső ablakába kérdés lógott, de
      // mire a `clearQuiz` ránézett, a kérdés magától (lejárattal) bezárult — ez is kérdéssel érintett ablak, ismételni kell.
      const quizTouched = err instanceof StepQuizError;
      if (!quizCleared && !stickGone && !quizTouched) throw err;
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
  if (!Number.isFinite(t0) || rec.frames.length < 5 || rec.quizOpen || rec.stickGone) {
    // A rögzítő a lépcső ELŐTT ürül (a lenyomás és a gáz eldobva), ezért itt csak a lépcső `pointermove`-ja várható.
    if (rec.quizOpen) throw new StepQuizError(`${g.case.id}: a lépcső ablakában kérdés nyílt (képkockák ${rec.frames.length})`);
    // 2026-11-18 (CI 44301362954, „teljes kitérés: 0”): a kör a lépcső ALATT ért véget — a tárcsa lecsatolódott, a bemenet 0.
    if (rec.stickGone) throw new StepQuizError(`${g.case.id}: a kör a lépcső alatt véget ért (a tárcsa eltűnt; képkockák ${rec.frames.length})`);
    throw new Error(`${g.case.id}: nincs mérhető lépcső (a lépcső óta: események ${JSON.stringify(rec.events.map((e) => e.type))}, képkockák ${rec.frames.length})`);
  }
  return { rec, t0, d0 };
}

async function measureGame(page: Page, g: GameSpec, cpu: number) {
  const cdp = await page.context().newCDPSession(page);
  await installRecorder(page, g.probe);
  if (cpu === 1) await assertStickReachesGame(page, cdp, g);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu === 1 ? JOY_CPU : cpu });
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
  // E2E-ingadozók 3. kör (kanban #76): a két szakasznak a valós időben is közel azonos hosszúnak kell lennie. A rezgő szakaszban
  // minden CDP-érintés megvárja, hogy a lap feldolgozza (szoftveres WebGL-en képkockányi idő), az álló szakasz csak 30 × 16 ms-ot
  // várt — a régi álló szakasz így jóval rövidebb volt (helyben, CI-azonos úton mérve 1,2 s a rezgő 11 s mellett), és a kis
  // álló darabszám (0–2) egy ~9–30-szoros szorzóval arányosítódott. Egy render többé-kevésbé az álló ablakban a „többletet”
  // ±9…30-cal tolta el (main CI 44049286407: tárcsa 23 > 6, a korábbi futásokban ugyanott −12 és −6). Most az álló szakasz a 30
  // várakozás után még 30 × (a lépcsőkben MÉRT átlagos érintés-idő)-t tart, így a hossza a rezgőével összemérhető. A sorrend
  // marad (álló, majd rezgő): fordított sorrendben a Szökőárnál az utána következő álló szakasz lap-renderje a felére esett
  // (16–30 a rezgő 48–59-ével szemben, azonos hosszon) — a „mindkét szakaszban azonos mozgás” feltétel sérült.
  // A küszöb (≤ 6) változatlan; a nyers álló számok a JOY_RESULT-ban.
  const s = await stickGeometry(page);
  const cost = touchMoveCost.get(cdp);
  const perTouchMs = cost && cost.n > 0 ? cost.ms / cost.n : 0;
  const quizSel = quizSelector(g);
  // 2026-11-18 (`docs/specs/2026-11-18-joystick-tsunami-stabil.md`): egy `hold` egy DARAB — `events` mozgás-esemény (vagy
  // ugyanennyi 16 ms-os várakozás állva + `extraMs`). A számláló a lenyomás és az első elmozdulás UTÁN nyit és a felengedés
  // ELŐTT zár, ezért a darabolás nem ad a mérésbe húzás-kezdeti / -végi rendert; a darabok számlálói és hossza összeadódnak.
  const hold = async (
    jiggle: boolean,
    events: number,
    extraMs = 0,
  ): Promise<{ counts: Record<string, number>; ms: number; quiz: boolean; gone: boolean }> => {
    await ensurePlaying(page, g);
    // Új kör után (`ensurePlaying` lassú útja) a tárcsa helye újramérve jön a gyorsítótárból.
    const st = await stickGeometry(page);
    const y = st.cy + g.dy * st.r;
    await touch(cdp, "touchStart", st.cx, st.cy);
    await touch(cdp, "touchMove", st.cx + 0.8 * st.r, y);
    const a = await rendersOpen(page, quizSel);
    const t0 = Date.now();
    for (let i = 1; i <= events; i++) {
      if (jiggle) await touch(cdp, "touchMove", st.cx + (i % 2 === 0 ? 0.75 : 0.85) * st.r, y);
      await page.waitForTimeout(16);
    }
    if (extraMs > 0) await page.waitForTimeout(extraMs);
    const { counts: b, quiz, gone } = await rendersClose(page, quizSel);
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
    return { counts, ms, quiz, gone };
  };
  // E2E-ingadozók 3. kör (kanban #106): ha az álló VAGY a rezgő ablakba kérdés lógott (a Szökőárnál kérdés alatt a 24 Hz-es
  // hurok áll, csak az 1 mp-es visszaszámláló renderel — #483 CI 44124385498: többlet 11 és 34), az ablakpár nem összevethető:
  // megismételjük (ablakonként legfeljebb 5×), nem arányosítjuk. Ha 5 próbából sincs tiszta ablak, a teszt érthető üzenettel bukik.
  // Ablakonként ismétlünk (nem páronként): a Szökőár ~9,5 mp-enként kérdez, egy teljes pár ennél hosszabb is lehet.
  // 2026-11-18: az ablak `renderChunks` darabban megy le (Szökőár: 3 × 10 esemény; a többi játék: 1 × 30, a korábbi menet). Nem
  // mérési eredmény az a darab sem, amely alatt a kör véget ért (`gone`: álló játékon mért render-szám — helyben, CI-szerű
  // késéssel: álló 33 ↔ rezgő 95, „többlet” 64; a CI 44317092042 futásban rezgő 2 ↔ álló 29, hamis zöld). A darabolt játéknál
  // minden darab egy megválaszolt kérdés utáni szakaszra igazodik (`alignToQuizGap`). Az 5 próba darabonként értendő.
  const MAX_TRIES = 5;
  const RENDER_EVENTS = 30;
  let pairs = 0;
  const chunks = g.renderChunks ?? 1;
  const cleanChunk = async (jiggle: boolean, events: number, extraMs: number) => {
    for (let i = 1; ; i++) {
      // Ütemezett kérdésű játéknál MINDEN darab ugyanabban a fázisban indul (közvetlenül egy helyesen megválaszolt kérdés után):
      // így a darab belefér a kérdés nélküli szakaszba, és az álló / rezgő darabok alatt a játék ugyanazt csinálja.
      if (chunks > 1) await alignToQuizGap(page, g, quizSel);
      pairs += 1;
      const w = await hold(jiggle, events, extraMs);
      if (!w.quiz && !w.gone) return w;
      if (i >= MAX_TRIES) {
        throw new Error(
          `${g.case.id}: ${MAX_TRIES} próbából sincs kérdés nélküli ${jiggle ? "rezgő" : "álló"} ablak — a render-szám nem mérhető (utolsó ok: ${w.quiz ? "kérdés" : "a kör véget ért"})`,
        );
      }
    }
  };
  const cleanHold = async (jiggle: boolean, extraMsPerEvent = 0) => {
    const events = RENDER_EVENTS / chunks;
    if (!Number.isInteger(events)) throw new Error(`${g.case.id}: a renderChunks (${chunks}) nem osztója a ${RENDER_EVENTS} eseménynek`);
    const total: { counts: Record<string, number>; ms: number } = { counts: {}, ms: 0 };
    for (let c = 0; c < chunks; c++) {
      const w = await cleanChunk(jiggle, events, events * extraMsPerEvent);
      for (const k of Object.keys(w.counts)) total.counts[k] = (total.counts[k] ?? 0) + w.counts[k]!;
      total.ms += w.ms;
    }
    return total;
  };
  const still = await cleanHold(false, perTouchMs);
  const moving = await cleanHold(true);
  const renderDelta: Record<string, number> = {};
  const renderDrag = moving.counts;
  for (const k of Object.keys(moving.counts)) {
    // A két szakasz hossza a CDP-hívások miatt eltérhet: az álló szakasz számát a mozgó hosszára arányosítjuk.
    renderDelta[k] = moving.counts[k]! - Math.round(((still.counts[k] ?? 0) * moving.ms) / Math.max(1, still.ms));
  }
  const dragMs = moving.ms;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  // A JOY_RESULT-sorban az álló szakasz nyers száma és hossza is látszik (ingadozás-elemzéshez).
  return { steps, fine, renderDelta, renderDrag, dragMs, renderStill: still.counts, stillMs: still.ms, renderWindows: pairs, radius: s.r };
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
    // E2E-ingadozók 3. kör: a javított render-mérés álló szakasza a rezgővel összemérhető hosszú (a CI-n a rezgő 17,6–22,6 s volt;
    // helyben, CI-azonos úton az új álló szakasz a rezgő 1,0–1,7-szerese). Mérve (main CI 44049286407, a Kockavadász nyomkövetés
    // nélküli kísérletei): 134 s és 145 s a javítás ELŐTT; + legfeljebb 1,7 × 22,6 ≈ 38 s → ~183 s, a 180 s-os kereten túl. A keret
    // ezért 240 s (a lépések nem lassabbak, csak a mérés egy szükséges szakasza hosszabb).
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
