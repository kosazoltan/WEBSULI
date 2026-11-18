import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { devices, expect, test, type CDPSession, type Page } from "@playwright/test";

import { CASE as blockCraft } from "./game-mobile-cases/block-craft-quiz";
import { CASE as brainRot } from "./game-mobile-cases/brain-rot-steal";
import { CASE as spaceAsteroid } from "./game-mobile-cases/space-asteroid-quiz";
import { CASE as tornado } from "./game-mobile-cases/tornado-hunter-200";
import { CASE as tsunami } from "./game-mobile-cases/tsunami-english";
import { MOBILE_VIEWPORTS, type GameMobileCase } from "./support/game-mobile-quality";

/**
 * A joystick oldala (`docs/specs/2026-11-18-joystick-jobb-kez.md`, A1–A4).
 *
 * A tulajdonos kérése: a képernyő-joystick alapból a JOBB kézre essen, a tűzgomb és a többi akciógomb a BALra; a
 * balkezes tanuló egy kapcsolóval megfordíthatja, és az eszköz megjegyzi.
 *
 * Minden mérés a TÉNYLEGES elem-dobozokból számol (nem osztálynévből, nem attribútumból), mind az öt joystickos
 * játékban, a közös mobil mérő három nézetén (360×640, 390×844, 844×390):
 *  - alapértéknél a joystick közepe a képernyő jobb felén, minden akciógomb közepe a bal felén;
 *  - a szünet menü kapcsolója megfordítja (újratöltés nélkül), és a választás újratöltés után megmarad;
 *  - a vezérlők a nézeten belül maradnak, egymást és a HUD szünet gombját nem takarják;
 *  - joystick + második ujj egyszerre: mindkét hatás mérve (Szökőár: ugrás, Aszteroida: tűz, Kockavadász: körbenézés).
 *
 * Képernyőkép: a `JOYSTICK_SIDE_SHOT_DIR` mappába `<játék>-<szélesség>x<magasság>-<oldal>.png`.
 */

test.use({ serviceWorkers: "block", ...devices["Pixel 7"] });

const SETTINGS_KEY = "websuli.gameSettings.v1";

type Side = "right" | "left";
type Box = { x: number; y: number; w: number; h: number; name: string };
type Layout = { vw: number; vh: number; joystick: Box; actions: Box[]; pause: Box | null; attr: string | null };

type SideGame = {
  case: GameMobileCase;
  /** Az akciógombok (vagy a Brain Rot kísérő sávja): a joystickkal ELLENTÉTES félen kell állniuk. */
  actions: string;
  /** Hány akcióelem látszik legalább (0: a nézetben nincs oldalra tehető kísérő elem). */
  minActions: (vp: { width: number; height: number }) => number;
};

const GAMES: SideGame[] = [
  { case: tsunami, actions: '[data-testid="tsunami-touch-controls"] button', minActions: () => 1 },
  { case: tornado, actions: '[data-testid="tornado-touch-controls"] button', minActions: () => 2 },
  { case: spaceAsteroid, actions: '[data-testid="sa-touch-controls"] button', minActions: () => 2 },
  { case: blockCraft, actions: '[data-testid="bc-touch-controls"] button', minActions: () => 3 },
  // Brain Rot: akciógomb nincs; álló nézetben a súgó / állapot sáv áll a joystick mellett. Fekvőben a teljes
  // vezérlő-oszlop a tábla egyik oldalán van (a sáv a joystick FÖLÖTT), ott csak a joystick oldalát mérjük.
  { case: brainRot, actions: ".br-controls-side", minActions: (vp) => (vp.width < vp.height ? 1 : 0) },
];

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

async function startGame(page: Page, g: SideGame): Promise<void> {
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
  // A belépő animációk lecsengése (a dobozok beállnak).
  await page.waitForTimeout(600);
}

/** A vezérlők tényleges dobozai (CSS px). Az akcióelemek közül csak a látható, nem nulla méretűek számítanak. */
async function layout(page: Page, g: SideGame): Promise<Layout> {
  return page.evaluate((actionsSelector) => {
    const box = (el: Element, name: string) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, name };
    };
    const joystick = document.querySelector('[data-testid="virtual-joystick"]')!;
    const actions = Array.from(document.querySelectorAll(actionsSelector))
      .filter((el) => !joystick.contains(el))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
      })
      .map((el) => box(el, el.getAttribute("aria-label") ?? el.getAttribute("data-testid") ?? el.className.toString().slice(0, 40)));
    const pause = document.querySelector('[data-testid="game-pause"]');
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      joystick: box(joystick, "joystick"),
      actions,
      pause: pause ? box(pause, "szünet gomb") : null,
      attr: document.querySelector("[data-joystick-side]")?.getAttribute("data-joystick-side") ?? null,
    };
  }, g.actions);
}

const centerX = (b: Box) => b.x + b.w / 2;
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

function expectSide(l: Layout, side: Side, g: SideGame, vp: { width: number; height: number }): void {
  const half = l.vw / 2;
  const where = `${g.case.id} ${vp.width}x${vp.height}, joystick: ${side}`;
  expect(l.attr, `${where}: a keret hirdeti a beállítást`).toBe(side);
  if (side === "right") expect(centerX(l.joystick), `${where}: a joystick közepe a JOBB félen`).toBeGreaterThan(half);
  else expect(centerX(l.joystick), `${where}: a joystick közepe a BAL félen`).toBeLessThan(half);

  expect(l.actions.length, `${where}: akcióelemek száma`).toBeGreaterThanOrEqual(g.minActions(vp));
  // Fekvő Brain Rot (minActions 0): a sáv a joystick fölött áll, nem oldalra — ott nem mérünk oldalt.
  const sided = g.minActions(vp) > 0 ? l.actions : [];
  for (const a of sided) {
    if (side === "right") expect(centerX(a), `${where}: „${a.name}” közepe a BAL félen`).toBeLessThan(half);
    else expect(centerX(a), `${where}: „${a.name}” közepe a JOBB félen`).toBeGreaterThan(half);
    expect(overlap(a, l.joystick), `${where}: „${a.name}” nem fedi a joystickot`).toBe(0);
  }
  for (const b of [l.joystick, ...sided]) {
    expect(b.x, `${where}: „${b.name}” bal széle a nézeten belül`).toBeGreaterThanOrEqual(0);
    expect(b.x + b.w, `${where}: „${b.name}” jobb széle a nézeten belül`).toBeLessThanOrEqual(l.vw + 0.5);
    expect(b.y + b.h, `${where}: „${b.name}” alja a nézeten belül`).toBeLessThanOrEqual(l.vh + 0.5);
    if (l.pause) expect(overlap(b, l.pause), `${where}: „${b.name}” nem fedi a szünet gombot`).toBe(0);
  }
}

/** A szünet menü közös kapcsolójával vált oldalt, majd folytatja a játékot. */
async function switchSide(page: Page, side: Side): Promise<void> {
  await page.getByTestId("game-pause").first().click();
  await expect(page.getByTestId("game-pause-menu")).toBeVisible();
  const btn = page.getByTestId("game-pause-menu").getByTestId(`joystick-side-${side}`);
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("game-resume").click();
  await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
  await expect(page.getByTestId("virtual-joystick")).toBeVisible();
  await page.waitForTimeout(400);
}

async function shot(page: Page, g: SideGame, vp: { width: number; height: number }, state: string): Promise<void> {
  const dir = process.env.JOYSTICK_SIDE_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${g.case.id}-${vp.width}x${vp.height}-${state}.png`), scale: "css" });
}

const storedSide = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? ((JSON.parse(raw) as { joystickSide?: string }).joystickSide ?? null) : null;
  }, SETTINGS_KEY);

for (const g of GAMES) {
  for (const vp of MOBILE_VIEWPORTS) {
    test(`${g.case.id} ${vp.width}x${vp.height}: alapból joystick jobbra, akciógombok balra; a kapcsoló megfordítja és megmarad`, async ({ page }) => {
      await page.setViewportSize(vp);
      await startGame(page, g);
      expect(await storedSide(page), "nincs tárolt oldal: az alapérték érvényes").toBeNull();

      // A1: alapérték.
      expectSide(await layout(page, g), "right", g, vp);
      await shot(page, g, vp, "alap-jobb");

      // A2: a szünet menü kapcsolója újratöltés nélkül megfordítja.
      await switchSide(page, "left");
      expectSide(await layout(page, g), "left", g, vp);
      await shot(page, g, vp, "atkapcsolva-bal");
      expect(await storedSide(page), "a választás a közös játékbeállításokban").toBe("left");

      // A2: újratöltés után is megmarad.
      await startGame(page, g);
      expectSide(await layout(page, g), "left", g, vp);

      // Vissza az alapértékre: ugyanaz a jobb oldali elrendezés.
      await switchSide(page, "right");
      expectSide(await layout(page, g), "right", g, vp);
      expect(await storedSide(page)).toBe("right");
    });
  }
}

const PAUSE_CASES: Array<{ game: SideGame; vp: { width: number; height: number } }> = [
  { game: GAMES[2]!, vp: { width: 844, height: 390 } },
  // A Tornádó szünet menüje a leghosszabb (saját grafika-beállítás is van benne): álló és fekvő nézetben is.
  { game: GAMES[1]!, vp: { width: 844, height: 390 } },
  { game: GAMES[1]!, vp: { width: 360, height: 640 } },
];
for (const { game, vp } of PAUSE_CASES) {
  test(`${game.case.id} ${vp.width}x${vp.height}: a szünet menü kapcsolója látszik, a nézeten belül elérhető, gombjai ≥ 48 px`, async ({ page }) => {
    await page.setViewportSize(vp);
    await startGame(page, game);
    await page.getByTestId("game-pause").first().click();
    const menu = page.getByTestId("game-pause-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId("joystick-side-right"), "alapérték: jobb oldal").toHaveAttribute("aria-pressed", "true");
    await expect(menu.getByTestId("joystick-side-left")).toHaveAttribute("aria-pressed", "false");
    for (const side of ["right", "left"] as const) {
      const btn = menu.getByTestId(`joystick-side-${side}`);
      await btn.scrollIntoViewIfNeeded();
      const b = (await btn.boundingBox())!;
      expect(Math.min(b.width, b.height), `„${side}” gomb mérete`).toBeGreaterThanOrEqual(48);
      expect(b.x, `„${side}” gomb a nézeten belül (bal)`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `„${side}” gomb a nézeten belül (jobb)`).toBeLessThanOrEqual(vp.width + 0.5);
      expect(b.y + b.height, `„${side}” gomb a nézeten belül (alul)`).toBeLessThanOrEqual(vp.height + 0.5);
    }
    // A párbeszéd nem lóg ki oldalra (a tartalma legfeljebb függőlegesen görgethető).
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowX, "nincs oldalgörgetés a szünet menü alatt").toBeLessThanOrEqual(0);
    await shot(page, game, vp, "szunet-menu");
  });
}

/* ------------------------------ két ujj egyszerre (A3) ------------------------------ */

type Pt = { x: number; y: number; id: number };
async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", points: Pt[]): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })),
  });
}
const mid = (b: { x: number; y: number; width: number; height: number }) => ({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) });

type InputWindow = { __websuliInput?: { probes: Record<string, () => Record<string, number>> } };
type GameWindow = { __websuliGame?: { probe: () => Record<string, number> } };

test.describe("joystick (jobb hüvelykujj) + második ujj (bal) egyszerre, alapértékkel, 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Aszteroida: a joystick jobbra visz, miközben a bal oldali Tűz gomb tüzel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startGame(page, GAMES[2]!);
    await page.waitForFunction(() => Boolean((window as unknown as InputWindow).__websuliInput?.probes.space));
    const read = () => page.evaluate(() => (window as unknown as InputWindow).__websuliInput!.probes.space!());
    const joy = (await page.getByTestId("virtual-joystick").boundingBox())!;
    const fire = (await page.getByRole("button", { name: "Tűz" }).boundingBox())!;
    expect(mid(fire).x, "a Tűz gomb a bal félen").toBeLessThan(390 / 2);
    expect(mid(joy).x, "a joystick a jobb félen").toBeGreaterThan(390 / 2);
    const before = await read();
    expect(before.fire).toBe(0);
    expect(before.inX).toBe(0);

    const cdp = await page.context().newCDPSession(page);
    const j = { ...mid(joy), id: 1 };
    const moved = { x: j.x + Math.round(joy.width * 0.45), y: j.y, id: 1 };
    await touch(cdp, "touchStart", [j]);
    await touch(cdp, "touchMove", [moved]);
    await touch(cdp, "touchStart", [moved, { ...mid(fire), id: 2 }]);
    await page.waitForTimeout(250);
    const during = await read();
    await touch(cdp, "touchEnd", []);
    expect(during.inX, "a joystick bemenete a tűz alatt is él").toBeGreaterThan(0.5);
    expect(during.fire, "a tűzgomb a joystick mellett is tüzel").toBe(1);
    await page.waitForTimeout(150);
    const after = await read();
    expect(after.inX, "felengedés után a joystick nulla").toBe(0);
    expect(after.fire, "felengedés után a tűz leáll").toBe(0);
  });

  test("Szökőár: a joystick jobbra kormányoz, miközben a bal oldali Ugrás gomb ugrik", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${tsunami.path}?seed=5`);
    await page.getByTestId("button-tsunami-start").click();
    await expect(page.getByTestId("virtual-joystick")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const read = () => page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.probe());
    const joy = (await page.getByTestId("virtual-joystick").boundingBox())!;
    const jump = (await page.getByRole("button", { name: "Ugrás" }).boundingBox())!;
    expect(mid(jump).x, "az Ugrás gomb a bal félen").toBeLessThan(390 / 2);
    expect(mid(joy).x, "a joystick a jobb félen").toBeGreaterThan(390 / 2);

    const cdp = await page.context().newCDPSession(page);
    const j = { ...mid(joy), id: 1 };
    const moved = { x: j.x + Math.round(joy.width * 0.45), y: j.y, id: 1 };
    const p0 = await read();
    await touch(cdp, "touchStart", [j]);
    await touch(cdp, "touchMove", [moved]);
    await touch(cdp, "touchStart", [moved, { ...mid(jump), id: 2 }]);
    await page.waitForTimeout(350);
    const p1 = await read();
    await touch(cdp, "touchEnd", []);
    expect(p1.x!, "a tárcsa jobbra vitte a futót").toBeGreaterThan(p0.x! + 0.1);
    expect(p1.jumps!, "a második ujj ugrott").toBeGreaterThan(p0.jumps!);
  });

  test("Kockavadász: a joystick előre visz, miközben a bal hüvelykujj a vászon bal részén körbenéz", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startGame(page, GAMES[3]!);
    await page.waitForFunction(() => typeof (window as unknown as GameWindow).__websuliGame?.probe === "function");
    await page.waitForTimeout(600);
    const read = () => page.evaluate(() => (window as unknown as GameWindow).__websuliGame!.probe());
    const joy = (await page.getByTestId("virtual-joystick").boundingBox())!;
    const canvas = (await page.locator("canvas").first().boundingBox())!;
    const j = { ...mid(joy), id: 1 };
    // A körbenézés a joystickkal ELLENTÉTES 60%-on indul: alapértéknél a vászon bal része (25% szélesség).
    const c = { x: Math.round(canvas.x + canvas.width * 0.25), y: Math.round(canvas.y + canvas.height * 0.45), id: 2 };
    const before = await read();

    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, "touchStart", [j]);
    await touch(cdp, "touchStart", [j, c]);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await touch(cdp, "touchMove", [
        { x: j.x, y: j.y - Math.round((40 * i) / steps), id: 1 },
        { x: c.x + Math.round((80 * i) / steps), y: c.y, id: 2 },
      ]);
    }
    await page.waitForTimeout(300);
    const during = await read();
    await touch(cdp, "touchEnd", []);
    expect(during.moveFwd, "a joystick előre-jelzése a második ujj mellett is él").toBe(1);
    expect(Math.abs(during.yaw! - before.yaw!), "a körbenézés a joystick mellett is él (80 px × 0,006 rad/px)").toBeGreaterThan(0.2);
  });
});
