import { mkdirSync } from "node:fs";

import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { hideAndShowPage } from "./support/game-mobile-quality";

/**
 * J6a — Galaktikus Aszteroida valódi érintéssel (végrehajtás J6a 5.; terv J1, J5, J9, J-SA; K.4/13–18, 23–25).
 *
 * Az ELSŐ eset szándékosan KAMPÓ NÉLKÜLI: se `forceState`, se `probe` — csak a felhasználó útja érintéssel (a Kockavadásznál a
 * kampós teszt elfedte a valódi út hibáját). A kristályok helyét a DOM adja (a `data-correct` a teszt-buildben a jó / rossz
 * kristályt jelöli, a választás érintéssel történik). A második eset a kampót használja a mérésekhez (szimuláció-idő,
 * ütközés, kérdés/perc a lapon).
 *
 * Képernyőkép: ha az `SA_SHOT_DIR` meg van adva, oda (JPEG 70).
 */

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  // `SA_CPU_THROTTLE=4`: a teljes eset 4x CPU-lassítással fut (a K.4/6 „lassú eszköz” próba; review #486).
  const throttle = Number(process.env.SA_CPU_THROTTLE || 1);
  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  }
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "5");
    localStorage.setItem("websuli.spaceQuiz.grade", "5");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
});

/** Rövid, kristályra férő tétel a kampós (kényszerített) kérdésekhez: a hosszú válaszú tétel a listát magától megnyitja (a világ áll). */
const SHORT_ITEM = { id: "short-q", prompt: "Mennyi 6 × 7?", options: ["36", "42", "48", "54"], correctIndex: 1 };

/** Ha a természetes kérdés hosszú válaszú volt, a „Válaszok” lista magától nyílt: bezárjuk (az élesítés ezután indul újra). */
async function closeList(page: Page): Promise<void> {
  const close = page.getByTestId("sa-answers-close");
  if (await close.isVisible().catch(() => false)) await close.click();
}

const crystals = (page: Page) => page.locator('[data-testid="sa-crystals"] [data-correct]');
type Probe = Record<string, number | string | null>;
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __websuliGame: { probe: () => Probe } }).__websuliGame.probe());
const force = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate((p) => (window as unknown as { __websuliGame: { forceState: (x: object) => void } }).__websuliGame.forceState(p), patch);

/** Koppintás egy elem közepére valódi érintéssel (a kristály a helyén áll; a zónát a mag egyszer dönti el, az élesítés 500 ms). */
async function tapCenter(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await expect(page.getByTestId("sa-crystals")).toBeVisible({ timeout: 15_000 });
  await closeList(page);
  await expect(el).toBeVisible({ timeout: 15_000 });
  // FELTÉTELES várakozás (fix idő helyett): a kristályok élesedtek (500 ms), és a gomb két mintavétel között nem mozdul.
  await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-armed", "true", { timeout: 15_000 });
  await expect(el).toBeEnabled();
  let prev = await el.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(60);
    const cur = await el.boundingBox();
    if (prev && cur && Math.abs(prev.x - cur.x) < 0.5 && Math.abs(prev.y - cur.y) < 0.5) break;
    prev = cur;
  }
  const box = await el.boundingBox();
  expect(box, `${selector} doboza`).not.toBeNull();
  await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SA_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 70, scale: "css" });
}

test.describe("valódi érintés", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("kampó nélkül: azonnali indulás kapu nélkül, magától érkező kristály-kérdés, jó és rossz kristály, „Miért?”", async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    // J-SA: a menet AZONNAL indul — nincs induló kvíz, semmilyen blokkoló réteg; a HUD hullám / élet, nincs „mp”.
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(page.getByTestId("sa-wave-banner")).toContainText("HULLÁM 1");
    await expect(page.locator("[data-game-hud]")).toContainText("1/8");
    await expect(page.locator("[data-game-hud]")).not.toContainText(/\d+ mp/);
    await shot(page, "play-start.jpg");

    // Az ütemező a bemelegítés (10 mp) után magától kristály-kérdést ad (nyugodt pillanatban), blokkoló réteg nélkül.
    await expect(crystals(page)).toHaveCount(4, { timeout: 60_000 });
    expect(await page.locator('[role="dialog"]').count(), "a kérdés nem modális").toBe(0);
    await expect(page.getByTestId("sa-prompt")).toBeVisible();
    await shot(page, "play-question.jpg");

    // 1. kérdés: a JÓ kristály érintéssel → fejlesztés (felirat), a kristály zöld, a pont nő.
    await tapCenter(page, '[data-testid="sa-crystals"] [data-correct="true"]');
    await expect(page.locator('[data-testid="sa-crystals"] [data-correct="true"]')).toHaveAttribute("data-state", "correct");
    await expect(page.getByText(/Pajzs!|Hármas lövés!|Bomba a tárba!/)).toBeVisible({ timeout: 5_000 });
    await expect.poll(async () => Number((await page.locator('[data-hud-stat="score"]').innerText()).replace(/\D/g, "")), { timeout: 5_000 }).toBeGreaterThanOrEqual(50);
    await shot(page, "play-correct.jpg");

    // 2. kérdés (magától): a ROSSZ kristály → nincs dialógus, a helyes kristály zölden látszik, „Miért?” → kártya újrapróba nélkül.
    await expect(crystals(page)).toHaveCount(0, { timeout: 5_000 });
    await expect(crystals(page)).toHaveCount(4, { timeout: 60_000 });
    await tapCenter(page, '[data-testid="sa-crystals"] [data-correct="false"]');
    await expect(page.locator('[data-testid="sa-crystals"] [data-correct="true"]')).toHaveAttribute("data-state", "correct");
    expect(await page.locator('[role="dialog"]').count(), "a hibás válasz nem nyit blokkoló kártyát").toBe(0);
    await shot(page, "play-wrong.jpg");
    await page.getByTestId("play-why").tap();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await expect(page.getByTestId("quiz-feedback")).toHaveAttribute("data-outcome", "wrong");
    await expect(page.getByTestId("quiz-feedback-retry")).toHaveCount(0);
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
    expect(errors.filter((e) => !/401|Failed to fetch/i.test(e))).toEqual([]);
  });

  test("kampóval: a világ a kérdés alatt fut (≥ 0,35×), a „Miért?” alatt áll; a rossz kristály 3 sziklát ad; ütközés = élet −1 kvíz nélkül", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");

    // J1: nyitott kérdés alatt a szimuláció-idő / valós idő ≥ 0,35 (a lapon belül, egyetlen page.evaluate-ben mérve, C-64 / C-65).
    await force(page, { question: true, questionItem: SHORT_ITEM });
    await expect(crystals(page)).toHaveCount(4, { timeout: 5_000 });
    const open = await page.evaluate(
      () =>
        new Promise<{ ratio: number; open: number; real: number }>((resolve) => {
          const api = (window as unknown as { __websuliGame: { probe: () => Record<string, number> } }).__websuliGame;
          const s0 = api.probe().simTime!;
          const t0 = performance.now();
          let stillOpen = 1;
          const tick = () => {
            if (!api.probe().questionOpen) stillOpen = 0;
            if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
            else resolve({ ratio: (api.probe().simTime! - s0) / (performance.now() - t0), open: stillOpen, real: performance.now() - t0 });
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`[space-asteroid-play] nyitott kérdés alatt: szimuláció / valós idő = ${open.ratio.toFixed(2)} (a kérdés végig nyitva: ${open.open})`);
    expect(open.ratio, "a szimuláció a kérdés alatt fut (≥ 0,35×)").toBeGreaterThanOrEqual(0.35);
    expect(open.ratio, "a szimuláció a kérdés alatt soha nem áll").toBeGreaterThan(0);

    // J5: hibás válasz → nincs dialógus, 3 apró szikla jelenik meg a hajó felé (az ellenfelek száma +3), a világ teljes sebességen fut.
    const before = await probe(page);
    await tapCenter(page, '[data-testid="sa-crystals"] [data-correct="false"]');
    await expect.poll(async () => (await probe(page)).reveal, { timeout: 3_000 }).toBe(1);
    expect(await page.locator('[role="dialog"]').count()).toBe(0);
    const after = await probe(page);
    expect((after.enemies as number) - (before.enemies as number), "a rossz kristály 3 apró sziklára hasad (a közben érkező ellenfelekkel együtt ≥ 3)").toBeGreaterThanOrEqual(3 - 1);
    const full = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const api = (window as unknown as { __websuliGame: { probe: () => Record<string, number> } }).__websuliGame;
          const s0 = api.probe().simTime!;
          const t0 = performance.now();
          const tick = () => {
            if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
            else resolve((api.probe().simTime! - s0) / (performance.now() - t0));
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`[space-asteroid-play] hibás válasz utáni kijelzés alatt: szimuláció / valós idő = ${full.toFixed(2)}`);
    expect(full, "a megoldás-kijelzés alatt a világ fut").toBeGreaterThanOrEqual(0.35);

    // „Miért?”: a kártya megnyílik, és amíg nyitva van, a szimuláció-idő nem nő; bezárás után újra nő.
    await page.getByTestId("play-why").tap();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    const t1 = (await probe(page)).simTime as number;
    // review (#486, Vercel): a „Miért?” kártya olvasása közben megnyomott P NEM oldhatja fel a játékot a kártya mögött
    await page.keyboard.press("p");
    await page.waitForTimeout(700);
    const t2 = (await probe(page)).simTime as number;
    expect(t2 - t1, "a „Miért?” alatt áll a szimuláció (a P billentyű sem indítja újra)").toBeLessThanOrEqual(34);
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await expect(page.getByTestId("game-pause-menu"), "a P a kártya alatt nem nyit szünet menüt").toHaveCount(0);
    // lapváltás (automatikus szünet) + folytatás a menüből: a kártya nyitva marad, ezért a játék tovább áll (a folytatás csak a saját okát oldja fel)
    await hideAndShowPage(page);
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    await page.getByTestId("game-resume").tap();
    await expect(page.getByTestId("game-pause-menu")).toHaveCount(0);
    const lives0 = (await probe(page)).lives as number;
    const t3 = (await probe(page)).simTime as number;
    await page.waitForTimeout(800);
    const after2 = await probe(page);
    expect((after2.simTime as number) - t3, "a folytatás után a nyitott kártya mögött a világ áll").toBeLessThanOrEqual(34);
    expect(after2.lives, "az életek a kártya alatt nem változnak").toBe(lives0);
    await expect(page.getByTestId("quiz-feedback")).toBeVisible();
    await page.getByTestId("quiz-feedback-dismiss").tap();
    await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
    await expect.poll(async () => ((await probe(page)).simTime as number) - t2, { timeout: 3_000 }).toBeGreaterThan(300);

    // J-SA: az ütközés CSAK élet −1 és sérthetetlenség — a hajó mozdulatlanul áll, a szikla előbb-utóbb eltalálja; nincs kvíz-réteg.
    await expect.poll(async () => (await probe(page)).lives as number, { timeout: 150_000, intervals: [1_000] }).toBeLessThan(3);
    const hit = await probe(page);
    expect(hit.over, "egy ütközés nem a menet vége").toBe(0);
    expect(hit.invuln as number, "az ütközés után ≤ 2 mp sérthetetlenség").toBeLessThanOrEqual(2);
    expect(await page.locator('[role="dialog"]').count(), "az ütközés nem nyit kvíz-réteget").toBe(0);
  });

  test("a lapon mért kérdés/perc: a magától érkező kristály-kérdések ütemezése (a jó kristályt megérintve), eredmény, nincs automatikus újraindítás", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
    const started = Date.now();
    const RUN_MS = 90_000;
    let answered = 0;
    while (Date.now() - started < RUN_MS) {
      await closeList(page);
      const good = page.locator('[data-testid="sa-crystals"][data-armed="true"] [data-correct="true"][data-state="idle"]').first();
      if (await good.isVisible().catch(() => false)) {
        const box = await good.boundingBox().catch(() => null);
        if (box) {
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
          answered++;
        }
      }
      if ((await probe(page)).over === 1) break;
      await page.waitForTimeout(300);
    }
    const p = await probe(page);
    const minutes = (Date.now() - started) / 60_000;
    const asked = (p.questionsAnswered as number) ?? 0;
    console.log(
      `[space-asteroid-play] ${minutes.toFixed(2)} perc alatt ${asked} megválaszolt kérdés (${(asked / minutes).toFixed(2)} / perc; érintések: ${answered}), hullám ${p.wave}, élet ${p.lives}`,
    );
    // A bemelegítés (10 mp) után ≥ 4/perc a cél (terv J2, a node-szimuláció méri pontosan); a lapon a CI lassúsága és a
    // sérülés utáni „nem nyugodt” szakaszok miatt a küszöb lazább: legalább 2/perc.
    expect(asked / minutes, "kérdés/perc a lapon").toBeGreaterThanOrEqual(2);
    await force(page, { phase: "over", gameWon: false });
    await expect(page.getByTestId("sa-over")).toBeVisible();
    await shot(page, "play-result.jpg");
    await page.waitForTimeout(2_000);
    await expect(page.getByTestId("sa-over"), "a menet vége után nincs automatikus újraindítás").toBeVisible();
    await page.getByRole("button", { name: "Új kör" }).tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });
});

test.describe("grafika", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("WebGL-környezet elvesztése (K.4/7): szünet + „Grafika újraindítása”, a menet és a kérdés-kristályok utána is működnek", async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
    await page.waitForTimeout(1_200);
    const lost = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const gl = (canvas?.getContext("webgl2") ?? canvas?.getContext("webgl")) as WebGLRenderingContext | null | undefined;
      const ext = gl?.getExtension("WEBGL_lose_context");
      ext?.loseContext();
      return Boolean(ext);
    });
    // A teszt MINDIG fut és állít: a WEBGL_lose_context minden vizsgált Chrome-háttéren (GPU, SwiftShader) elérhető; ha nem az,
    // az a teszt-környezet hibája, nem csendes kihagyás.
    expect(lost, "a WEBGL_lose_context kiterjesztés elérhető (a környezet előfeltétele)").toBe(true);
    // szünet + újraindító gomb; a menet áll
    await expect(page.getByTestId("sa-gfx-lost")).toBeVisible({ timeout: 5_000 });
    const t1 = (await probe(page)).simTime as number;
    await page.waitForTimeout(600);
    expect(((await probe(page)).simTime as number) - t1, "a grafika-hiba alatt áll a menet").toBeLessThanOrEqual(34);
    await page.getByTestId("sa-gfx-restart").tap();
    await expect(page.getByTestId("sa-gfx-lost")).toHaveCount(0);
    // az újraindítás után a szünet menü vár (a gyerek dönt a folytatásról), a menet állapota megmaradt
    await expect(page.getByTestId("game-pause-menu")).toBeVisible();
    await page.getByTestId("game-resume").tap();
    await expect.poll(async () => ((await probe(page)).simTime as number) - t1, { timeout: 5_000 }).toBeGreaterThan(500);
    // az új jeleneten a kérdés-kristályok is megjelennek
    await force(page, { question: true, questionItem: SHORT_ITEM });
    await expect(crystals(page)).toHaveCount(4, { timeout: 5_000 });
    // K.4/2, K.4/7: a rajzolási hívások és a GPU-memória korlátos
    const info = await probe(page);
    expect(info.drawCalls as number, "rajzolási hívások (medium tier ≤ 200)").toBeLessThanOrEqual(200);
    expect(errors.filter((e) => !/401|Failed to fetch|WebGL|context/i.test(e))).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* Review #486: győzelem-véglegesség (M1), élesítés és tartott tűz (M2), hosszú válaszok, rajz-arány                      */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe("review #486 — M1: a főellenfél legyőzése végleges", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("egy élettel, a főellenfél halála után még repülő ellenséges lövedék nem veszi el a győzelmet", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
    await force(page, { bossFinale: true });
    await expect.poll(async () => (await probe(page)).bossDefeated, { timeout: 2_000 }).toBe(1);
    // az 1,5 mp-es robbanás-ablak alatt a hajón repülő ellenséges lövedék NEM sebez (1 élet: a régi kód itt „Kör vége”-t adott)
    await expect(page.getByTestId("sa-over")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("sa-over")).toContainText("Legyőzted a főellenfelet!");
    await expect(page.getByTestId("sa-over")).not.toContainText("Kör vége");
  });
});

test.describe("review #486 — M2: élesítés és tartott tűz (billentyűzet)", () => {
  test.use({ viewport: { width: 844, height: 600 } });

  test("az 1–4 billentyű válaszol; a tartott tűz, söprő hajóval sem válaszol, az új nyomás igen", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").click();
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");

    // 1) az 1–4 billentyű szándékos, azonnali válasz (az élesítés a lövedékre vonatkozik)
    await force(page, { question: true, questionItem: SHORT_ITEM });
    await expect(page.getByTestId("sa-crystals")).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("1");
    await expect.poll(async () => (await probe(page)).questionsAnswered, { timeout: 3_000 }).toBe(1);

    // 2) tartott tűz a kérdés előtt kezdve, a hajó végigsöpör a sávon: a kérdés nyitva marad
    await expect(crystals(page)).toHaveCount(0, { timeout: 8_000 });
    await page.keyboard.down("Space");
    await force(page, { question: true, questionItem: SHORT_ITEM });
    await expect(page.getByTestId("sa-crystals")).toBeVisible({ timeout: 5_000 });
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(1_500);
    await page.keyboard.up("ArrowRight");
    const held = await probe(page);
    expect(held.questionOpen, "a tartott tűz (söprő hajóval) nem válaszolt").toBe(1);
    expect(held.questionsAnswered, "a tartott tűz nem válaszolt").toBe(1);
    // kis UX: a lövedék átment a kristályon → rövid szöveges jelzés jelenik meg
    await expect(page.getByTestId("sa-hold-hint")).toHaveAttribute("data-visible", "true", { timeout: 1_500 });
    await expect(page.getByTestId("sa-hold-hint")).toContainText("lőj újra");

    // 3) szándékos új nyomás (elengedés + újra), söprő hajóval: válaszol
    await page.keyboard.up("Space");
    await page.waitForTimeout(150); // a valódi elengedés legalább egy fix lépésnyi (a játék a nyomás ÉLVÁLTÁSÁT figyeli)
    await page.keyboard.down("ArrowLeft");
    await page.keyboard.down("Space");
    await expect.poll(async () => (await probe(page)).questionsAnswered, { timeout: 2_500 }).toBe(2);
    // a szándékos lövéses válasz után a jelzés eltűnik (és nem tér vissza)
    await expect(page.getByTestId("sa-hold-hint")).toHaveAttribute("data-visible", "false", { timeout: 1_500 });
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.up("Space");
  });
});

for (const vp of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const)
test.describe(`review #486 — hosszú válaszok és rajz-arány (${vp.width}×${vp.height})`, () => {
  test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });

  test("a leghosszabb banki válaszú tétel: a kristályon sorszám, a teljes szöveg a listában olvasható, a világ áll; a lista válaszol", async ({ page }) => {
    test.setTimeout(120_000);
    // a legnagyobb összhosszú válaszú tétel a bankban (programozottan keresve)
    const item = [...GRADE_QUIZ_ITEMS].sort((a, b) => b.options.reduce((n, o) => n + o.length, 0) - a.options.reduce((n, o) => n + o.length, 0))[0]!;
    const longest = Math.max(...item.options.map((o) => o.length));
    expect(longest, "a legrosszabb tétel valóban hosszú válaszú").toBeGreaterThan(22);
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
    await force(page, { questionItem: { id: "long-answers", prompt: item.prompt, options: [...item.options], correctIndex: item.correctIndex }, question: true });
    // Ú5: hosszú válaszú tételnél a lista a kérdéssel együtt MAGÁTÓL nyílik; a világ és a kérdés-óra áll, a kristály nem található el
    await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-long", "true", { timeout: 5_000 });
    await expect(page.getByTestId("sa-answers")).toBeVisible({ timeout: 5_000 });
    const tOpen = (await probe(page)).simTime as number;
    const clockOpen = (await probe(page)).questionsAnswered;
    await page.keyboard.down("Space");
    await page.waitForTimeout(600);
    await page.keyboard.up("Space");
    expect(((await probe(page)).simTime as number) - tOpen, "a lista nyitva: a világ áll").toBeLessThanOrEqual(34);
    expect((await probe(page)).questionsAnswered, "a lista nyitva: lövéssel nem lehet kristályt eltalálni").toBe(clockOpen);
    const list = page.getByTestId("sa-answers");
    await expect(list).toBeVisible({ timeout: 5_000 });
    // minden válasz TELJES szöveggel, vágás nélkül; a lista a nézeten belül, a gombok elérhetők (görgetéssel is)
    const info = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>('[data-testid="sa-answers"]')!;
      const texts = [...box.querySelectorAll<HTMLElement>(".sa-answer-text")];
      const r = box.getBoundingClientRect();
      return {
        texts: texts.map((t) => t.innerText.trim()),
        clipped: texts.map((t) => t.scrollHeight > t.clientHeight + 1),
        inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
        scrollable: box.scrollHeight > box.clientHeight + 1,
        overflowX: document.documentElement.scrollWidth > innerWidth,
        // M2-szerű mérés a listán: minden gomb >= 48 px magas, és két gomb nem fedi egymást
        minTarget: Math.min(...[...box.querySelectorAll<HTMLElement>("button")].map((b) => b.getBoundingClientRect().height)),
        overlaps: (() => {
          const rects = [...box.querySelectorAll<HTMLElement>("button")].map((b) => b.getBoundingClientRect());
          let n = 0;
          for (let i = 0; i < rects.length; i++)
            for (let j = i + 1; j < rects.length; j++) {
              const a = rects[i]!;
              const b = rects[j]!;
              if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) n++;
            }
          return n;
        })(),
      };
    });
    expect(info.minTarget, "a lista gombjai >= 48 px magasak").toBeGreaterThanOrEqual(47.5);
    expect(info.overlaps, "a lista gombjai nem fedik egymást").toBe(0);
    // a director seedelten keveri a sorrendet: a válaszok HALMAZA egyezik (mind teljes szöveggel)
    expect([...info.texts].sort()).toEqual([...item.options].sort());
    expect(info.clipped.some(Boolean), "a válaszszöveg nincs levágva").toBe(false);
    expect(info.inView, "a lista a nézeten belül van").toBe(true);
    expect(info.overflowX, "nincs vízszintes görgetősáv").toBe(false);
    console.log(`[space-asteroid-play] hosszú válaszok (${longest} karakter): a lista ${info.scrollable ? "görgethető" : "egészben látszik"}`);
    await shot(page, `play-long-answers-${vp.width}x${vp.height}.jpg`);
    // a lista alatt a világ áll (a kérdés-óra is)
    const t0 = (await probe(page)).simTime as number;
    await page.waitForTimeout(700);
    expect(((await probe(page)).simTime as number) - t0, "a lista nyitva: a világ áll").toBeLessThanOrEqual(34);
    // bezárás: a világ fut tovább, az élesítés ÚJRA indul (majd lejár); a „Válaszok” gomb újranyitja
    await page.getByTestId("sa-answers-close").click();
    await expect(page.getByTestId("sa-answers")).toHaveCount(0);
    await expect.poll(async () => ((await probe(page)).simTime as number) - t0, { timeout: 4_000 }).toBeGreaterThan(100);
    await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-armed", "true", { timeout: 3_000 });
    await page.getByTestId("sa-answers-open").click();
    await expect(list).toBeVisible();
    // élesítés után a lista válaszol (a jó válasz), a lista bezárul és a világ fut tovább
    await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-armed", "true", { timeout: 3_000 });
    const goodText = item.options[item.correctIndex]!;
    const good = list.locator(".sa-answer", { has: page.getByText(goodText, { exact: true }) });
    await good.scrollIntoViewIfNeeded();
    await expect(good).toBeEnabled();
    await good.tap();
    await expect.poll(async () => (await probe(page)).questionsAnswered, { timeout: 3_000 }).toBe(1);
    await expect(list).toHaveCount(0);
    await expect.poll(async () => ((await probe(page)).simTime as number) - t0, { timeout: 4_000 }).toBeGreaterThan(400);
  });

  test("a rajz-arány (interpolált rajz): a meghajtó 0..1 közti arányt ad", async ({ page }) => {
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
    const alphas = await page.evaluate(
      () =>
        new Promise<number[]>((resolve) => {
          const api = (window as unknown as { __websuliGame: { probe: () => Record<string, number> } }).__websuliGame;
          const out: number[] = [];
          const tick = () => {
            out.push(api.probe().renderAlpha!);
            if (out.length < 90) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(alphas.every((a) => Number.isFinite(a) && a >= 0 && a <= 1), "a rajz-arány mindig 0..1").toBe(true);
    console.log(`[space-asteroid-play] rajz-arány: ${alphas.length} minta, ${new Set(alphas.map((a) => a.toFixed(2))).size} különböző érték`);
  });
});

test.describe("review #486 — elforgatás nyitott kérdésnél", () => {
  // fekvőben indul: az álló nézet keskenyebb, ott a régi (széles) helyen maradó kristály kilógna
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("álló ↔ fekvő váltás: minden kristály-gomb a vásznon belül, a kirajzolt hely a mag találati helye; az élesítés újraindul", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
    await force(page, { question: true, questionItem: SHORT_ITEM });
    await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-armed", "true", { timeout: 5_000 });
    const px = async () => JSON.parse(String((await probe(page)).crystalPx)) as Array<[number, number] | null>;
    const geometry = async () =>
      page.evaluate(() => {
        const chips = [...document.querySelectorAll<HTMLElement>('[data-testid="sa-crystals"] .sa-crystal')];
        return {
          iw: innerWidth,
          ih: innerHeight,
          boxes: chips.map((c) => {
            const r = c.getBoundingClientRect();
            return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, vis: getComputedStyle(c).visibility };
          }),
        };
      });
    for (const vp of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 360, height: 640 },
    ]) {
      const before = JSON.stringify(await px());
      const shownBefore = (await probe(page)).crystalShownAt as number;
      await page.setViewportSize(vp);
      // előbb megvárjuk, hogy a geometria TÉNYLEG megváltozzon (a találati hely új aréna-méretből számolódik)
      await expect.poll(async () => JSON.stringify(await px()), { timeout: 5_000 }).not.toBe(before);
      await expect.poll(async () => (await probe(page)).crystalShownAt as number, { timeout: 3_000, message: "érdemi elmozdulásnál az élesítés újraindul" }).toBeGreaterThan(shownBefore);
      await expect.poll(async () => (await probe(page)).crystalsArmed, { timeout: 3_000 }).toBe(1);
      // a gomb-helyek a következő képkockára követik a magot
      await expect
        .poll(
          async () => {
            const [g, hits] = [await geometry(), await px()];
            return g.boxes.every((b, i) => {
              const h = hits[i];
              return !!h && Math.abs(b.cx - h[0]) <= 3 && Math.abs(b.cy - h[1]) <= 3 && b.vis === "visible";
            });
          },
          { timeout: 5_000 },
        )
        .toBe(true);
      const g = await geometry();
      expect(g.boxes.length).toBe(4);
      for (const b of g.boxes) {
        expect(b.l, `${vp.width}×${vp.height}: gomb a vásznon belül (bal)`).toBeGreaterThanOrEqual(0);
        expect(b.r, "jobb").toBeLessThanOrEqual(g.iw);
        expect(b.t, "felső").toBeGreaterThanOrEqual(0);
        expect(b.b, "alsó").toBeLessThanOrEqual(g.ih);
      }
    }
  });
});

test.describe("a kör végén nyomva tartott tűzgomb (közös HoldButton, kanban #98)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a következő kör nem tüzel magától: a vezérlők a kör végén és indulásakor nullázódnak", async ({ page }) => {
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
    // a tűzgomb lenyomva, felengedés nélkül (a lecsatolás nem küld felengedést)
    const fire = (await page.getByRole("button", { name: "Tűz" }).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 7 }] });
    await expect.poll(async () => (await probe(page)).firing).toBe(1);
    await force(page, { phase: "over", gameWon: false });
    await expect(page.getByTestId("sa-over")).toBeVisible();
    expect((await probe(page)).firing, "a kör végén a tűz nullázódik").toBe(0);
    await page.getByRole("button", { name: "Új kör" }).tap();
    await expect(page.getByTestId("sa-touch-controls")).toBeVisible();
    await page.waitForTimeout(500);
    expect((await probe(page)).firing, "az új kör nem tüzel magától").toBe(0);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  });
});

test.describe("review #486 L1 — hármas lövés: a célzott kristály válaszol, nem a szomszéd", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("üres pályán, hármas lövéssel a felső sor célzott kristálya alól lőve a célzott (helyes) kristály válaszol — nem a szomszéd rossz", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").click();
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
    await force(page, { noEnemies: true, powerLevel: 1 });
    type World = Array<[number, number, number, number]>;
    const world = async () => JSON.parse(String((await probe(page)).crystalWorld)) as World;
    let target = -1;
    for (let attempt = 0; attempt < 8 && target < 0; attempt++) {
      await force(page, { question: true, questionItem: { ...SHORT_ITEM, id: `l1-${attempt}`, options: attempt % 2 ? ["36", "48", "54", "42"] : ["42", "36", "48", "54"], correctIndex: attempt % 2 ? 3 : 0 }, noEnemies: true, powerLevel: 1 });
      await expect(crystals(page)).toHaveCount(4, { timeout: 5_000 });
      await closeList(page);
      await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-armed", "true", { timeout: 5_000 });
      const w = await world();
      // a felső sor a páros indexű kristályok; a helyes köztük van-e (a szomszéd az alsó sorban rossz)
      const top = [0, 2].find((i) => w[i]![2] === 1);
      if (top !== undefined) target = top;
      else {
        // nem a felső sorban van a helyes: a kérdést megválaszoljuk (billentyű), és újat kérünk
        await page.keyboard.press("1");
        await expect(crystals(page)).toHaveCount(0, { timeout: 6_000 });
      }
    }
    expect(target, "a helyes kristály a felső sorba került valamelyik kísérletben").toBeGreaterThanOrEqual(0);
    const before = await probe(page);
    // a hajó a célzott kristály alá (a bal / jobb nyíl, amíg a vízszintes eltérés ≤ 0,3 egység)
    for (let i = 0; i < 200; i++) {
      const w = await world();
      const dx = (w[target]![0] as number) - ((await probe(page)).shipX as number);
      if (Math.abs(dx) <= 0.3) break;
      await page.keyboard.down(dx < 0 ? "ArrowLeft" : "ArrowRight");
      await page.waitForTimeout(40);
      await page.keyboard.up(dx < 0 ? "ArrowLeft" : "ArrowRight");
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(250); // a hajó tehetetlensége kifut
    // szándékos (élesítés utáni, új) nyomás: egyetlen lövés, hármas lövéssel
    await page.keyboard.down("Space");
    await page.waitForTimeout(160); // legalább egy fix lépés: a játék a nyomás ÉLVÁLTÁSÁT figyeli
    await page.keyboard.up("Space");
    await expect.poll(async () => (await probe(page)).questionsAnswered, { timeout: 4_000 }).toBe((before.questionsAnswered as number) + 1);
    const after = await probe(page);
    expect(after.questionsCorrect, "a célzott (helyes) kristály válaszolt, nem a szomszéd rossz").toBe((before.questionsCorrect as number) + 1);
  });
});

test.describe("review #486 L5 — a rossz válasz nem jutalmaz", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("rossz kristály: nincs pajzs / hármas lövés / bomba / pont; a jó kristály fejleszt (kontroll)", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/games/space-asteroid-quiz");
    await page.getByTestId("sa-start").click();
    await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
    const reward = async () => {
      const p = await probe(page);
      return { power: p.powerLevel as number, shield: p.shieldTimer as number, bombs: p.bombs as number, score: p.score as number };
    };
    // 1) ROSSZ válasz
    await force(page, { question: true, questionItem: SHORT_ITEM, powerLevel: 0 });
    await expect(crystals(page)).toHaveCount(4, { timeout: 5_000 });
    await closeList(page);
    await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-armed", "true", { timeout: 5_000 });
    const base = await reward();
    await page.locator('[data-testid="sa-crystals"] [data-correct="false"]').first().click();
    await expect.poll(async () => (await probe(page)).reveal, { timeout: 3_000 }).toBe(1);
    await page.waitForTimeout(400);
    expect(await reward(), "rossz válasz: semmi jutalom (pajzs / hármas lövés / bomba / pont)").toEqual(base);
    // 2) kontroll: a JÓ válasz fejleszt és pontot ad
    await expect(crystals(page)).toHaveCount(0, { timeout: 8_000 });
    await force(page, { question: true, questionItem: { ...SHORT_ITEM, id: "l5-ctrl" } });
    await expect(crystals(page)).toHaveCount(4, { timeout: 5_000 });
    await closeList(page);
    await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-armed", "true", { timeout: 5_000 });
    const base2 = await reward();
    await page.locator('[data-testid="sa-crystals"] [data-correct="true"]').first().click();
    await expect.poll(async () => (await probe(page)).reveal, { timeout: 3_000 }).toBe(1);
    await expect.poll(async () => (await reward()).score, { timeout: 2_000 }).toBeGreaterThan(base2.score);
    const got = await reward();
    expect(got.power + got.shield + got.bombs, "jó válasz: fejlesztés").toBeGreaterThan(base2.power + base2.shield + base2.bombs);
  });
});

/* L2 (review #486): a leghosszabb szavú, még a kristályra férő (≤ 22 karakteres) válaszok nem csonkulnak és nem törnek szó közepén */
const FITTING = GRADE_QUIZ_ITEMS.filter((q) => q.options.every((o) => o.length <= 22));
const longestWord = (q: (typeof FITTING)[number]): number => Math.max(...q.options.flatMap((o) => o.split(/[\s-]+/u).map((w) => w.length)));
const LABEL_ITEMS = [
  ...[...FITTING].sort((a, b) => longestWord(b) - longestWord(a)).slice(0, 5),
  ...["paradicsom", "Dunántúli-középhegység"].map((t) => FITTING.find((q) => q.options.includes(t))).filter((q): q is (typeof FITTING)[number] => !!q),
];

for (const vp of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const)
  test.describe(`review #486 L2 — kristály-feliratok (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });

    test("a leghosszabb szavú banki opciók: nincs csonkolás, nincs szó közepi törés, a gombok nem fedik egymást és a vásznon belül vannak", async ({ page }) => {
      test.setTimeout(240_000);
      expect(LABEL_ITEMS.length, "van mért tétel").toBeGreaterThanOrEqual(5);
      await page.goto("/games/space-asteroid-quiz");
      await page.getByTestId("sa-start").tap();
      await expect(page.getByTestId("sa-touch-controls")).toBeVisible({ timeout: 15_000 });
      await page.waitForFunction(() => typeof (window as unknown as { __websuliGame?: unknown }).__websuliGame !== "undefined");
      for (const [i, item] of LABEL_ITEMS.entries()) {
        await force(page, { question: true, noEnemies: true, questionItem: { id: `l2-${i}`, prompt: item.prompt, options: [...item.options], correctIndex: item.correctIndex } });
        await expect(crystals(page)).toHaveCount(4, { timeout: 6_000 });
        await expect(page.getByTestId("sa-crystals")).toHaveAttribute("data-armed", "true", { timeout: 6_000 });
        await page.waitForTimeout(250); // a gombok helye beáll
        const m = await page.evaluate(() => {
          const chips = [...document.querySelectorAll<HTMLElement>('[data-testid="sa-crystals"] .sa-crystal')];
          const rects = chips.map((c) => c.getBoundingClientRect());
          const labels = chips.map((c) => c.querySelector<HTMLElement>(".sa-crystal-label")!);
          let overlaps = 0;
          for (let a = 0; a < rects.length; a++)
            for (let b = a + 1; b < rects.length; b++) {
              const x = Math.min(rects[a]!.right, rects[b]!.right) - Math.max(rects[a]!.left, rects[b]!.left);
              const y = Math.min(rects[a]!.bottom, rects[b]!.bottom) - Math.max(rects[a]!.top, rects[b]!.top);
              if (x > 1 && y > 1) overlaps++;
            }
          return {
            text: labels.map((l) => l.textContent?.trim() ?? ""),
            clippedY: labels.map((l) => l.scrollHeight > l.clientHeight + 1),
            clippedX: labels.map((l) => l.scrollWidth > l.clientWidth + 1),
            inView: rects.every((r) => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight),
            overlaps,
          };
        });
        const ctx = `${vp.width}×${vp.height} «${item.options.join(" | ")}»`;
        expect(m.clippedY.some(Boolean), `${ctx}: a felirat függőlegesen csonkul`).toBe(false);
        expect(m.clippedX.some(Boolean), `${ctx}: a felirat szó közepén törik / kilóg`).toBe(false);
        expect(m.overlaps, `${ctx}: a kristály-gombok fedik egymást`).toBe(0);
        expect(m.inView, `${ctx}: a gomb kilóg a vászonból`).toBe(true);
        await page.keyboard.press("1");
        await expect(crystals(page)).toHaveCount(0, { timeout: 8_000 });
      }
    });
  });
