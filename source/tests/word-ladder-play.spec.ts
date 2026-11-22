import { expect, test, type Page } from "@playwright/test";

/**
 * J2a — Szikla-verseny, TESZT-KAMPÓ NÉLKÜL, valódi érintéssel (végrehajtás J2a 7., K.4/14, terv J9, J16).
 *
 * A teszt úgy játszik, ahogy egy gyerek: koppint a falon lévő kapaszkodókra (`locator.tap()` — érintés-esemény, nem
 * egérkattintás), nem használja a `forceState` / `probe` kampót és a `data-correct` jelölést sem. Amit lát, az a kép:
 * a hibás fogás után a helyes kapaszkodó zölden (`data-state="correct"`) világít — ebből tanul (a rosszul tudott szó a
 * menetben 3–6 kérdésen belül visszatér, és akkor már tudja). Egy teljes menetet visz végig az eredményképernyőig
 * (győzelem vagy vereség — a rivális miatt mindkettő lehetséges), és ellenőrzi: menet közben nincs blokkoló párbeszédablak,
 * a mászás és a rivális látszik, a végén az eredmény a „Gyakorold még” listával és visszavágóval jön, automatikus
 * újraindítás nélkül.
 *
 * SPEC-VÁLTOZÁS 2026-11-17 (szoletra-olvashatosag, terv F — determinisztikussá tétel, a mérce változatlan):
 * - gyökérok 1: a menet aszinkron véget érhet (a rivális felér → azonnal eredményképernyő, `role="dialog"`) a ciklus eleji
 *   `result.isVisible()` és a ciklus végi párbeszédablak-számlálás között → hamis „blokkoló kártya” (main CI 44028107372,
 *   „Expected 0, Received 1”). Most egyetlen `page.evaluate` olvassa az állapotot (C-64): az eredményképernyőn
 *   (`[data-game-result]`) kívüli párbeszédablak száma 0, és ha az eredmény már látszik, a ciklus kilép.
 * - gyökérok 2: a menet falióra-hossza nem volt korlátos — a világ képkockánként ≤ 5 fix lépést tesz, így lassú CI-n
 *   (szoftveres WebGL) a rivális a falióránál lassabban halad, a 24–35 fokos menet 300 s fölé nyúlt („Test timeout of
 *   330000ms”). Most rögzített seeddel (`?seed=`) és rövid fallal (`?wall=4`, csak teszt-kampós buildben) fut: a menet
 *   játékidőben korlátos. A fogás az előjelzés (600 ms) után élesedik — a teszt az engedélyezett fogásra vár.
 * - a „játékos” lassú gépen se maradjon le a saját oda-vissza útjai miatt: körönként két `page.evaluate` (állapot, majd a
 *   megoldás-kijelzés), nem tíz automatikusan váró lokátorhívás. 6× CPU-lassítással a régi, sok-hívásos ciklus a Nyugodt
 *   tempón 10-ből 1-szer 330 s fölé nyúlt, a Gyors tempón 10-ből 1-szer egyetlen jó fogás nélkül veszített (kevés kérdés
 *   jutott a rövid menetre). A teszt a lap alap (Nyugodt) tempóján fut.
 * - helyi lassú-gép próba: `E2E_CPU_THROTTLE=6` (CDP CPU-lassítás) — a CI-ben nincs megadva.
 */

test.use({ serviceWorkers: "block", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function stubApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "5");
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


test("Szikla-verseny: egy teljes menet valódi érintéssel, kampó nélkül — mászás, megcsúszás, eredmény, visszavágó", async ({ page }) => {
  test.setTimeout(330_000);
  const throttle = Number(process.env.E2E_CPU_THROTTLE ?? 0);
  if (throttle > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await stubApi(page);
  await page.goto("/games/word-ladder-hu-en?seed=7&wall=4");
  await page.getByTestId("wl-start").tap();

  // A verseny-jelenet, a HUD-ban a két versenyző és a tanító sor (K.4/25) látszik.
  await expect(page.getByTestId("wl-race")).toBeVisible();
  await expect(page.getByTestId("wl-teach")).toBeVisible();
  await expect(page.getByTestId("wl-rung")).toHaveText(/^0\/\d+$/);

  const known = new Map<string, string>();
  const holds = page.locator('[data-testid^="wl-option-"]');
  const result = page.getByTestId("wl-won");
  let climbed = false;
  let slipped = false;
  /** Egyetlen olvasás (C-64): menetvég, párbeszédablak, a nyitott kérdés és a fok — automatikusan váró lokátor nélkül. */
  const readState = () =>
    page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-testid^="wl-option-"]'));
      return {
        result: document.querySelector('[data-testid="wl-won"]') !== null,
        dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => !d.closest("[data-game-result]")).length,
        enabled: opts.filter((b) => !b.disabled).length,
        qid: document.querySelector<HTMLElement>('[data-testid="wl-question"]')?.dataset.questionId ?? "",
        prompt: (document.querySelector<HTMLElement>('[data-testid="wl-prompt"]')?.innerText ?? "").trim(),
        labels: opts.map((b) => (b.querySelector<HTMLElement>(".wl-hold-label")?.innerText ?? "").trim()),
        rung: (document.querySelector<HTMLElement>('[data-testid="wl-rung"]')?.innerText ?? "").trim(),
      };
    });
  /** A kép a koppintás után: a zöld (helyes) kapaszkodó felirata és a megfogott fogás állapota (vagy null, ha még nincs). */
  const readReveal = (idx: number) =>
    page.evaluate((i) => {
      const green = document.querySelector<HTMLElement>('[data-testid^="wl-option-"][data-state="correct"]');
      if (!green) return null;
      return {
        label: (green.querySelector<HTMLElement>(".wl-hold-label")?.innerText ?? "").trim(),
        picked: document.querySelector<HTMLElement>(`[data-testid="wl-option-${i}"]`)?.dataset.state ?? "",
      };
    }, idx);
  const deadline = Date.now() + 300_000;
  let lastQid = "";
  while (Date.now() < deadline) {
    const s = await readState();
    // Menet közben soha nincs blokkoló kártya (a „Miért?” nélkül); az eredményképernyő a menet vége.
    expect(s.dialogs, "menet közben nincs blokkoló párbeszédablak").toBe(0);
    if (s.result) break;
    if (s.enabled !== 4 || s.qid === lastQid) {
      await page.waitForTimeout(100);
      continue;
    }
    lastQid = s.qid;
    const want = known.get(s.prompt);
    let idx = want ? s.labels.findIndex((l) => l === want) : -1;
    if (idx < 0) idx = 0;
    await holds.nth(idx).tap({ timeout: 2_000 }).catch(() => undefined);
    // A kép: a helyes kapaszkodó zöld (jó fogásnál a megfogott, rossznál a másik).
    let rev: Awaited<ReturnType<typeof readReveal>> = null;
    for (let k = 0; k < 20 && !rev; k++) {
      rev = await readReveal(idx);
      if (!rev) await page.waitForTimeout(100);
    }
    if (!rev) continue;
    if (s.prompt && rev.label) known.set(s.prompt, rev.label);
    if (rev.picked === "wrong") slipped = true;
    if (rev.picked === "correct") {
      // A HUD ≤ 10 Hz-cel frissül: a fok-szám a következő pillanatképben nő.
      for (let k = 0; k < 15 && !climbed; k++) {
        if ((await readState()).rung !== s.rung) climbed = true;
        else await page.waitForTimeout(100);
      }
    }
  }

  await expect(result).toBeVisible();
  expect(climbed, "egy jó fogás feljebb vitt").toBe(true);
  expect(slipped, "egy rossz fogás megcsúszást mutatott").toBe(true);
  const title = (await result.locator("h2").first().innerText()).trim();
  expect(title).toMatch(/Elérted a csúcsot|Majdnem! \d+ fok hiányzott\./);
  // J16: a hibázott tételek a helyes válasszal („Gyakorold még”).
  await expect(page.getByTestId("result-review")).toBeVisible();
  await expect(page.getByTestId("result-review-item").first()).toBeVisible();
  // J9: az eredményképernyőn megáll — 5 mp-ig nincs új menet magától.
  await page.waitForTimeout(5_000);
  await expect(result).toBeVisible();
  // Visszavágó / új menet csak koppintásra.
  await page.getByTestId("wl-restart").tap();
  await expect(result).toBeHidden();
  await expect(page.getByTestId("wl-rung")).toHaveText(/^0\/\d+$/);
});

/**
 * Szintezés — terv docs/specs/2026-11-22-szoletra-szintezes.md, A9: egy 3. évfolyamos az 1. pályán végig helyesen válaszol.
 * Az első kérdés a 0. szintről jön, egyik sem 1. szint fölötti (fokozat ≤ 5), és a helyes sorozatokkal a fokozat emelkedik.
 * A helyes fogást a teszt-kampós `data-correct` jelöli; a fokozatot a probe `questionStep` / `ladderStep` mezője adja.
 */
test("Szintezés A9: 3. évfolyam, 1. pálya, végig helyes válasz — 0. szintről indul, legfeljebb 1. szint, fokozatosan nehezedik", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "3");
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
  await page.goto("/games/word-ladder-hu-en?seed=5&wall=60");
  await expect(page.getByTestId("wl-grade-picker")).toContainText("3.");
  await page.getByTestId("wl-start").tap();
  await expect(page.getByTestId("wl-race")).toBeVisible();

  type Probe = { questionOpen: number; questionId: number | null; questionStep: number; ladderStep: number; clock: number; armedAt: number | null; reveal: number; phase: string };
  const probe = () => page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => Probe } }).__websuliGame.probe());
  const steps: number[] = [];
  const runSteps: number[] = [];
  let lastId: number | null = null;
  const deadline = Date.now() + 200_000;
  while (steps.length < 12 && Date.now() < deadline) {
    const p = await probe();
    if (p.phase !== "play") break;
    if (!p.questionOpen || p.questionId === lastId || p.reveal || p.armedAt === null || p.clock < p.armedAt) {
      await page.waitForTimeout(80);
      continue;
    }
    lastId = p.questionId;
    steps.push(p.questionStep);
    runSteps.push(p.ladderStep);
    await page.locator('[data-testid^="wl-option-"][data-correct="true"]').first().tap({ timeout: 3_000 }).catch(() => undefined);
    await expect.poll(async () => (await probe()).reveal, { timeout: 5_000 }).toBe(1).catch(() => undefined);
  }
  console.log(`A9|kérdés-fokozatok: ${steps.join(",")} | futás-fokozat: ${runSteps.join(",")}`);
  expect(steps.length, "legalább 12 megválaszolt kérdés").toBeGreaterThanOrEqual(12);
  expect(steps.every((s) => s >= 0), "minden kérdés az osztályozott bankból jön").toBe(true);
  expect(steps[0]!, "az első kérdés a 0. szintről").toBeLessThanOrEqual(2);
  expect(Math.max(...steps), "3. évfolyamon legfeljebb 1. szint (fokozat ≤ 5)").toBeLessThanOrEqual(5);
  expect(runSteps[runSteps.length - 1]!, "a helyes sorozatokkal a futás fokozata nő").toBeGreaterThan(runSteps[0]!);
  expect(Math.max(...steps.slice(-4)), "a futás végén nehezebb kérdés jön, mint az elején").toBeGreaterThan(steps[0]!);
});
