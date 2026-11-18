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
