import { devices, expect, test, type Page } from "@playwright/test";

/**
 * Kockavadász `?perf=1` mérőpanel (terv: docs/specs/2026-11-17-kockavadasz-telefon.md, 6. szakasz, E-1 … E-8) és a telefonos
 * szint olcsóbb megjelenítése (terv: docs/specs/2026-11-17-kockavadasz-telefon-gyors.md, G-1, G-4, G-5, G-8).
 *
 * Nézet: a kihajtott hajlítható telefon osztálya (827×896 CSS, dpr 2,625, érintés). A `look=medium` a telefonok szintjét
 * kényszeríti (a CI szoftveres WebGL-je különben „low”); a `look=high` az asztali szintet, ahol az árnyéktérkép megmarad.
 */
test.use({ serviceWorkers: "block", ...devices["Pixel 7"], viewport: { width: 827, height: 896 } });

type Toggles = { shadows: boolean; resolution: number; simpleMaterials: boolean; fog: boolean };
type Snapshot = {
  running: boolean;
  renderedFrames: number;
  cssHeight: number;
  bufferHeight: number;
  tier: string;
  frame: { frames: number } | null;
  calls: number;
  triangles: number;
  bufferWidth: number;
  cssWidth: number;
  pixelRatio: number;
  toggles: Toggles;
};
type PerfWindow = { __websuliPerf?: { snapshot: () => Snapshot } };

test.beforeEach(async ({ page }) => {
  // CI-reprodukció (mint a `blockcraft-play`-ben): `BC_CPU_THROTTLE=<n>` → n-szeres CPU-lassítás. Alapból nincs.
  const throttle = Number(process.env.BC_CPU_THROTTLE ?? 0);
  if (throttle > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "5");
    // Review F6: a „könnyű grafika” a memóriától is függ (≤ 4 GB) — a futtató gépe ne döntsön; 8 GB-os telefon rögzítve.
    Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 8 });
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

async function startGame(page: Page, query: string): Promise<void> {
  await page.goto(`/games/block-craft-quiz?seed=11${query}`);
  await page.getByTestId("bc-start").click();
  await expect(page.getByTestId("bc-touch-controls")).toBeVisible({ timeout: 20_000 });
}

const snapshot = (page: Page) => page.evaluate(() => (window as unknown as PerfWindow).__websuliPerf!.snapshot());

/**
 * A kapcsoló után a jelenet az új beállítással legalább 3 képkockát kirajzol (review F1: a `renderedFrames` a statisztikából
 * kihagyott, 1 s-nál lassabb CI-képkockákat is számolja, így a szoftveres WebGL-en sem a mintaablak üressége dönt).
 */
async function expectFramesAfterToggle(page: Page): Promise<void> {
  const before = (await snapshot(page)).renderedFrames;
  await expect.poll(async () => (await snapshot(page)).renderedFrames - before, { timeout: 30_000 }).toBeGreaterThan(2);
}

test("perf=1: a panel megjelenik a mért sorokkal, és a négy kapcsoló hat a jelenetre", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await startGame(page, "&perf=1&look=medium");
  const panel = page.getByTestId("bc-perf-panel");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await snapshot(page)).calls, { timeout: 30_000 }).toBeGreaterThan(0);

  // E-1: a panel sorai.
  const text = page.getByTestId("bc-perf-text");
  for (const key of ["FPS", "1% low", "JS", "render()", "GPU", "hívás", "háromszög", "vászon", "dpr", "hosszú feladat", "React-render", "szint: medium"]) {
    await expect(text).toContainText(key);
  }
  const first = await snapshot(page);
  expect(first.tier).toBe("medium");
  expect(first.triangles).toBeGreaterThan(0);
  // G-1: telefonos szinten nincs árnyéktérkép; G-5: a felbontás alapértéke a szint dpr-plafonja (827 × 1,5), nem kevesebb.
  expect(first.toggles).toEqual({ shadows: false, resolution: 1, simpleMaterials: false, fog: true });
  expect(first.pixelRatio).toBe(1.5);
  expect(first.bufferWidth).toBe(1240);

  // E-7: a kapcsolók alatt a panel nem indít kérést (a játék saját, csonkolt /api hívásain kívül semmi nem megy ki).
  const origin = new URL(page.url()).origin;
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));

  // E-4: felbontás 100 → 75 → 50 → 100 %; a CSS-méret nem változik.
  const res = page.getByTestId("bc-perf-res");
  await res.click();
  await expect(res).toHaveText("Felbontás: 75%");
  await expect.poll(async () => (await snapshot(page)).bufferWidth, { timeout: 15_000 }).toBeLessThan(first.bufferWidth * 0.76 + 2);
  const at75 = await snapshot(page);
  expect(Math.abs(at75.bufferWidth - first.bufferWidth * 0.75)).toBeLessThanOrEqual(2);
  expect(at75.cssWidth).toBe(first.cssWidth);
  await res.click();
  await expect(res).toHaveText("Felbontás: 50%");
  await expect.poll(async () => Math.abs((await snapshot(page)).bufferWidth - first.bufferWidth * 0.5), { timeout: 15_000 }).toBeLessThanOrEqual(2);
  await res.click();
  await expect(res).toHaveText("Felbontás: 100%");
  await expect.poll(async () => (await snapshot(page)).bufferWidth, { timeout: 15_000 }).toBe(first.bufferWidth);

  // G-1: az árnyék-kapcsoló telefonos szinten nem él (nincs mit kikapcsolni).
  const shadow = page.getByTestId("bc-perf-shadow");
  await expect(shadow).toHaveText("Árnyék: nincs");
  await expect(shadow).toBeDisabled();

  // E-5: anyagkészlet-váltás (telefonon az alap a Lambert; a kapcsoló a PBR-re vált, hogy a csere hatása visszamérhető legyen).
  const mat = page.getByTestId("bc-perf-mat");
  await expect(mat).toHaveText("Anyag: Lambert");
  await mat.click();
  await expect(mat).toHaveText("Anyag: PBR");
  expect((await snapshot(page)).toggles.simpleMaterials).toBe(true);
  await expectFramesAfterToggle(page);

  // E-6: köd ki.
  const fog = page.getByTestId("bc-perf-fog");
  await fog.click();
  await expect(fog).toHaveText("Köd: ki");
  expect((await snapshot(page)).toggles.fog).toBe(false);
  await expectFramesAfterToggle(page);
  const last = await snapshot(page);
  expect(last.running).toBe(true);
  expect(last.calls).toBeGreaterThan(0);

  // Összecsukás: a szöveg eltűnik, a panel gombja marad.
  await page.getByTestId("bc-perf-collapse").click();
  await expect(text).toBeHidden();
  await expect(page.getByTestId("bc-perf-collapse")).toBeVisible();

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  const foreign = requests.filter((u) => !u.startsWith(`${origin}/api/`));
  expect(foreign, `váratlan kérés a kapcsolók alatt: ${foreign.join(", ")}`).toEqual([]);
});

test("high szinten az árnyéktérkép megmarad, és a panelről kapcsolható", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await startGame(page, "&perf=1&look=high");
  await expect(page.getByTestId("bc-perf-panel")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await snapshot(page)).calls, { timeout: 60_000 }).toBeGreaterThan(0);
  // G-4: asztali szinten van árnyéktérkép, az alap anyag a PBR.
  const shadow = page.getByTestId("bc-perf-shadow");
  await expect(shadow).toHaveText("Árnyék: be");
  await expect(shadow).toBeEnabled();
  await expect(page.getByTestId("bc-perf-mat")).toHaveText("Anyag: PBR");
  expect((await snapshot(page)).toggles.shadows).toBe(true);
  // E-3: árnyék ki, majd vissza — a jelenet mindkét állapotban rajzol.
  await shadow.click();
  await expect(shadow).toHaveText("Árnyék: ki");
  await expectFramesAfterToggle(page);
  await shadow.click();
  await expect(shadow).toHaveText("Árnyék: be");
  await expectFramesAfterToggle(page);
  expect(pageErrors, pageErrors.join(" | ")).toEqual([]);
});

test("perf paraméter nélkül nincs panel és nincs mérő-API", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  await startGame(page, "");
  // Néhány képkocka után sem jelenik meg (a modul be sem töltődik).
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("bc-perf-panel")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as PerfWindow).__websuliPerf === undefined)).toBe(true);
  // E-2: a panel külön darabja (chunk) nem töltődött le.
  expect(scripts.filter((u) => /perfOverlay/i.test(u))).toEqual([]);
});

/** Két téglalap átfedése (CSS px). */
function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test("szünetben a panel „áll”-t mutat azonnal, folytatás után „fut”-ot (a játék jelzője — review #504 L1, L4)", async ({ page }) => {
  test.setTimeout(180_000);
  await startGame(page, "&perf=1&look=medium");
  await expect(page.getByTestId("bc-perf-panel")).toBeVisible({ timeout: 20_000 });
  await expectFramesAfterToggle(page);
  expect((await snapshot(page)).running).toBe(true);
  const text = page.getByTestId("bc-perf-text");

  await page.getByTestId("game-pause").click();
  await expect(page.getByTestId("game-pause-menu")).toBeVisible();
  // Azonnal (nem 1 s / 15 s múlva): a játék maga mondja meg, hogy a hurok áll.
  expect((await snapshot(page)).running).toBe(false);
  const frozen = (await snapshot(page)).renderedFrames;
  await expect(text).toContainText("· áll", { timeout: 3_000 });
  await page.waitForTimeout(1200);
  expect((await snapshot(page)).renderedFrames, "szünetben nincs kirajzolt képkocka").toBe(frozen);

  await page.getByTestId("game-resume").click();
  await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
  await expectFramesAfterToggle(page);
  expect((await snapshot(page)).running).toBe(true);
  await expect(text).toContainText("· fut", { timeout: 3_000 });

  // Rövid folytatás után újra szünet: nem marad „fut”-on (review #504 L1/b).
  await page.getByTestId("game-pause").click();
  await expect(page.getByTestId("game-pause-menu")).toBeVisible();
  expect((await snapshot(page)).running).toBe(false);
});

test("a vászon a szülő méretváltozását követi (G-7, review #504 L4)", async ({ page }) => {
  test.setTimeout(180_000);
  await startGame(page, "&perf=1&look=medium");
  await expect(page.getByTestId("bc-perf-panel")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await snapshot(page)).bufferWidth, { timeout: 30_000 }).toBe(1240);
  const ratio = (await snapshot(page)).pixelRatio;
  for (const size of [{ width: 896, height: 827 }, { width: 600, height: 900 }, { width: 827, height: 896 }]) {
    await page.setViewportSize(size);
    // Tájolásváltáskor a játék magától szünetel (a main viselkedése); szünetben nincs képkocka, ami átméretezne — a G-7 a
    // következő KIRAJZOLT képkockára írja elő a követést, ezért a mérés a folytatás után történik.
    const resume = page.getByTestId("game-resume");
    if (await resume.isVisible({ timeout: 1500 }).catch(() => false)) {
      // A menü a láthatóság-ellenőrzés és a kattintás között magától is bezárulhat — a kattintás rövid időkorláttal próbál,
      // utána a menü tényleges állapota dönt.
      await resume.click({ timeout: 5_000 }).catch(() => undefined);
    }
    await expect(page.getByTestId("game-pause-menu")).toHaveCount(0, { timeout: 15_000 });
    await expect
      .poll(async () => {
        const s = await snapshot(page);
        return Math.abs(s.bufferWidth - Math.round(s.cssWidth * ratio)) <= 1 && Math.abs(s.bufferHeight - Math.round(s.cssHeight * ratio)) <= 1 && s.cssWidth === size.width;
      }, { timeout: 15_000 })
      .toBe(true);
  }
});

for (const view of [
  { name: "fekvő 800×360", width: 800, height: 360 },
  { name: "álló 360×800", width: 360, height: 800 },
  // Review #504 (vak, L2): kis fekvő kijelzők — a panel nem lóghat ki, az összecsukó gomb elérhető.
  { name: "fekvő 640×360", width: 640, height: 360 },
  { name: "fekvő 568×320", width: 568, height: 320 },
]) {
  test(`a nyitott panel nem takarja a vezérlőket és a felső HUD-ot (${view.name}, review #504 L3)`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: view.width, height: view.height });
    await startGame(page, "&perf=1&look=medium");
    const panel = page.getByTestId("bc-perf-panel");
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expectFramesAfterToggle(page);
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.y + panelBox.height, "a panel a nézeten belül").toBeLessThanOrEqual(view.height);
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(view.width);
    // A HUD (pályajelző és fölötte minden) a panel fölött marad.
    const chip = (await page.getByTestId("bc-level-chip").boundingBox())!;
    expect(panelBox.y, "a panel a pályajelző alatt kezdődik").toBeGreaterThanOrEqual(chip.y + chip.height);
    // A játék érintővezérlői (joystick, Bányász, Ugrás, Lerak) — bármelyik oldalon vannak — nem kerülnek a panel alá.
    const controls = page.locator('[data-testid="bc-touch-controls"] button, [data-testid="bc-touch-controls"] [role="slider"], [data-testid="virtual-joystick"]');
    const n = await controls.count();
    let checked = 0;
    for (let i = 0; i < n; i++) {
      const box = await controls.nth(i).boundingBox();
      if (!box || box.width === 0) continue;
      checked++;
      expect(overlaps(panelBox, box), `a panel takarja a(z) ${i}. vezérlőt`).toBe(false);
    }
    expect(checked, "van mért vezérlő").toBeGreaterThan(0);
    // A szövegdoboz nem nyeli el a vászonra szánt érintést (2. vak kör M3): a közepén a találat nem a panel szövege.
    const tb = (await page.getByTestId("bc-perf-text").boundingBox())!;
    const hitId = await page.evaluate(({ x, y }) => (document.elementFromPoint(x, y) as HTMLElement | null)?.dataset.testid ?? "", {
      x: tb.x + tb.width * 0.75,
      y: tb.y + tb.height / 2,
    });
    expect(hitId, "a szövegdoboz átengedi az érintést").not.toBe("bc-perf-text");
    // Az összecsukó gomb teljes egészében a nézetben van, és működik.
    const collapse = page.getByTestId("bc-perf-collapse");
    const cb = (await collapse.boundingBox())!;
    expect(cb.y + cb.height, "az összecsukó gomb nem vágódik le").toBeLessThanOrEqual(view.height);
    expect(cb.x + cb.width).toBeLessThanOrEqual(view.width);
    await collapse.click();
    await expect(page.getByTestId("bc-perf-text")).toBeHidden();
  });
}

test("befagyott képkocka-ciklus mellett a panel „áll”-t mutat (a játék szerint fut — review #504 vak L1)", async ({ page }) => {
  test.setTimeout(180_000);
  await startGame(page, "&perf=1&look=medium");
  await expect(page.getByTestId("bc-perf-panel")).toBeVisible({ timeout: 20_000 });
  await expectFramesAfterToggle(page);
  expect((await snapshot(page)).running).toBe(true);
  // A rAF-ciklus leáll (pl. a meghajtó megakad, vagy a lépés minden képkockán kivételt dob) — a játék szándéka szerint fut tovább.
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  const frozen = (await snapshot(page)).renderedFrames;
  await expect.poll(async () => (await snapshot(page)).running, { timeout: 10_000 }).toBe(false);
  expect((await snapshot(page)).renderedFrames, "valóban nincs új kirajzolt képkocka").toBeLessThanOrEqual(frozen + 1);
  await expect(page.getByTestId("game-pause-menu"), "a játék nem szünetel — a hurok fagyott be").toHaveCount(0);
  // A szöveg is frissül (nem marad befagyva „fut”-on).
  await expect(page.getByTestId("bc-perf-text")).toContainText("· áll", { timeout: 5_000 });
});

test("élő, lassú (GPU-kötött) hurkon a panel nem villog „áll”-ra (nagy nézet; 2. vak kör M2)", async ({ page }) => {
  test.setTimeout(240_000);
  // Nagy vászon a CI szoftveres WebGL-jén: a képkocka-köz ≈ 1 s, a főszál a köz nagy részében tétlen (a vak próba: 10 hamis „áll” / 20 s).
  await page.setViewportSize({ width: 1600, height: 1000 });
  await startGame(page, "&perf=1&look=medium");
  await expect(page.getByTestId("bc-perf-panel")).toBeVisible({ timeout: 30_000 });
  await expectFramesAfterToggle(page);
  // 20 s mintavétel tétlen időben, 50 ms-onként, a lapon belül (C-64): hamis „áll” = running=false, miközben a szünetmenü zárva,
  // és a kirajzolt képkockák száma a következő 3 s-ban nő (a hurok él).
  const samples = await page.evaluate(async () => {
    const api = (window as unknown as PerfWindow).__websuliPerf!;
    const out: { t: number; running: boolean; frames: number; paused: boolean }[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 20_000) {
      const s = api.snapshot();
      out.push({ t: performance.now(), running: s.running, frames: s.renderedFrames, paused: !!document.querySelector('[data-testid="game-pause-menu"]') });
      await new Promise((r) => setTimeout(r, 50));
    }
    return out;
  });
  const falseStops = samples.filter((s, i) => {
    if (s.running || s.paused) return false;
    const later = samples.find((o, j) => j > i && o.t - s.t <= 3_000 && o.frames > s.frames);
    return later !== undefined;
  });
  const frames = samples[samples.length - 1]!.frames - samples[0]!.frames;
  expect(frames, "a hurok élt a mintavétel alatt").toBeGreaterThan(3);
  expect(falseStops.length, `hamis „áll”: ${falseStops.slice(0, 5).map((s) => Math.round(s.t - samples[0]!.t)).join(", ")} ms`).toBe(0);
});
