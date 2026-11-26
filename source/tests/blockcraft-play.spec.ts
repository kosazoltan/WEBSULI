import { devices, expect, test, type Page } from "@playwright/test";
import { LONGEST_RUNE_QUIZ } from "./game-mobile-cases/block-craft-quiz";

test.use({ serviceWorkers: "block", ...devices["Pixel 7"], viewport: { width: 390, height: 844 } });

/**
 * J3a — Kockavadász „Rúnabánya” böngészőben (végrehajtás J3a 5.; terv 5.3, J1, J4, J5, J-BC; C-65: időtartam a lapon belül,
 * képkockánként mérve). A teszt-kampó (`window.__websuliGame`) csak `VITE_ENABLE_GAME_TEST_HOOKS=1` buildben él.
 *
 * 1. Sima blokk kérdés nélkül, VALÓDI érintéssel: a Bányász gomb 3 koppintása = 1 blokk a hotbarban, kérdés nem nyílik.
 * 2. Rúna-zár (`forceState({ question: true })` = rúnaérc a játékos előtt): a világ lassítva fut (≥ 0,35), nincs modális
 *    párbeszéd; rossz rúnakő (valódi érintés) → a helyes rúna ≥ 1,8 mp-ig `data-state="correct"`; „Miért?” → a kártya
 *    nyílik és a szimuláció áll; bezárva a játék folytatódik.
 * 3. Jó rúnakő → dupla zsákmány (2 kristály), a kombó nő.
 */

type Probe = Record<string, number | string | null>;
type GameTestWindow = { __websuliGame?: { forceState: (patch: Record<string, unknown>) => void; probe: () => Probe } };

test.beforeEach(async ({ page }) => {
  // CI-reprodukció (review #484 utómunka): `BC_CPU_THROTTLE=<n>` → n-szeres CPU-lassítás (a CI szoftveres WebGL-jének lassú
  // képkockái helyben). Alapból nincs lassítás.
  const throttle = Number(process.env.BC_CPU_THROTTLE ?? 0);
  if (throttle > 1) {
    test.setTimeout(300_000);
    await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  }
  await page.addInitScript(() => {
    localStorage.setItem("websuli.classroomGrade", "5");
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

/**
 * CI-reprodukció (review #484 utómunka): a CI-n egy Playwright-hívás 0,5–1,3 s (a 3e2a8b18 fej trace-e: koppintás ~1,3 s,
 * `evaluate` ~0,5 s), a lap órája közben a falióra szerint halad. `BC_CI_LAG_MS=<ms>` ezt a késést teszi minden koppintás és
 * mérés után helyben (alapból 0).
 */
const CI_LAG_MS = Number(process.env.BC_CI_LAG_MS ?? 0);
const ciLag = () => (CI_LAG_MS > 0 ? new Promise<void>((r) => setTimeout(r, CI_LAG_MS)) : Promise.resolve());
const probe = async (page: Page) => {
  const p = await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.probe());
  await ciLag();
  return p;
};
const tapAt = async (page: Page, x: number, y: number) => {
  await page.touchscreen.tap(x, y);
  await ciLag();
};

async function startGame(page: Page): Promise<void> {
  await page.goto("/games/block-craft-quiz?seed=11");
  await page.getByTestId("bc-start").click();
  await expect(page.getByTestId("bc-touch-controls")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => typeof (window as unknown as GameTestWindow).__websuliGame?.probe === "function", undefined, { timeout: 15_000 });
}

async function openLock(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true }));
  await expect(page.locator('[data-testid="bc-quiz"] [data-correct="false"]').first()).toBeVisible({ timeout: 15_000 });
  // SPEC-VÁLTOZÁS (review #484 B1): a zár 400 ms élesítés után fogad választ — a gyerek is csak ekkor koppinthat érvényesen.
  await expect(page.locator('[data-testid="bc-quiz"] [data-correct="false"]').first()).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
}

test("sima blokk kérdés nélkül: a Bányász gomb 3 valódi koppintása kibányászik egy blokkot, kérdés nem nyílik", async ({ page }) => {
  await startGame(page);
  const mine = page.getByRole("button", { name: "Bányász" });
  const box = (await mine.boundingBox())!;
  // A kezdő nézés egy közeli, bányászható blokkra mutat (E24 + kanban #64); 3 ütés = 1 blokk (koppintós mód).
  for (let i = 0; i < 3; i++) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect.poll(async () => Number((await probe(page)).blocks), { timeout: 15_000 }).toBe(1);
  await expect(page.getByTestId("bc-hotbar")).toBeVisible();
  const p = await probe(page);
  expect(p.questionOpen, "sima blokknál nincs kérdés").toBe(0);
  expect(p.questionsAnswered).toBe(0);
  await expect(page.getByTestId("bc-quiz")).toHaveCount(0);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
});

test("Rúna-zár: a világ lassítva fut (nem áll), rossz rúnakőre a helyes ≥ 1,8 mp-ig világít, a „Miért?” megállítja a játékot", async ({ page }) => {
  await startGame(page);
  await openLock(page);
  await expect(page.getByTestId("bc-question")).toBeVisible();
  await expect(page.locator('[role="dialog"]'), "a Rúna-zár nem modális").toHaveCount(0);
  // J1: a kérdés alatt a szimuláció fut (a mag időskálája 0,5 ≥ 0,35), a sim-idő nő.
  const a = await probe(page);
  expect(a.questionOpen).toBe(1);
  expect(Number(a.timeScale)).toBeGreaterThanOrEqual(0.35);
  expect(Number(a.timeScale)).toBeLessThan(1);
  await expect.poll(async () => Number((await probe(page)).simTime), { timeout: 10_000 }).toBeGreaterThan(Number(a.simTime));

  // Rossz rúnakő VALÓDI érintéssel; a megoldás-kijelzés hosszát a lapon belül, képkockánként mérjük (C-65) — a JÁTÉK
  // kérdés-órájában (`probe().clock`: szünetben / a „Miért?” kártya alatt áll), hogy a kártya alatti szünet ne számítson.
  await page.evaluate(() => {
    const w = window as unknown as GameTestWindow & { __revealMs?: number; __revealDone?: boolean };
    w.__revealMs = 0;
    w.__revealDone = false;
    let start: number | null = null;
    const clock = () => Number(w.__websuliGame!.probe().clock);
    const tick = () => {
      const correct = document.querySelector('[data-testid="bc-quiz"] [data-state="correct"]');
      if (correct && start === null) start = clock();
      if (start !== null && !correct) {
        w.__revealMs = clock() - start;
        w.__revealDone = true;
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const wrong = page.locator('[data-testid="bc-quiz"] [data-correct="false"]').first();
  const wb = (await wrong.boundingBox())!;
  await page.touchscreen.tap(wb.x + wb.width / 2, wb.y + wb.height / 2);
  await expect(page.locator('[data-testid="bc-quiz"] [data-state="correct"]')).toHaveCount(1, { timeout: 5_000 });
  const afterWrong = await probe(page);
  expect(afterWrong.questionsAnswered).toBe(1);
  expect(afterWrong.questionsCorrect).toBe(0);
  expect(afterWrong.crystals, "rossz válasz: kisebb zsákmány").toBe(1);
  expect(afterWrong.runes, "a zár így is kinyílt").toBe(1);
  await expect(page.locator('[role="dialog"]'), "a hibás válasz nem nyit kártyát magától").toHaveCount(0);

  // „Miért?” — a kártya nyílik, és alatta a szimuláció áll (J5).
  await page.getByTestId("play-why").click();
  await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 5_000 });
  const s0 = Number((await probe(page)).simTime);
  await page.waitForTimeout(1_200);
  expect(Number((await probe(page)).simTime), "a „Miért?” kártya alatt a szimuláció áll").toBe(s0);
  await page.getByTestId("quiz-feedback-dismiss").click();
  await expect(page.getByTestId("quiz-feedback")).toHaveCount(0);
  await expect.poll(async () => Number((await probe(page)).simTime), { timeout: 10_000 }).toBeGreaterThan(s0);

  // A megoldás-kijelzés a kártya bezárása után kifut; a JÁTÉKIDŐBEN mért hossza ≥ 1,8 mp (a kártya alatti szünet nélkül).
  await page.waitForFunction(() => (window as unknown as { __revealDone?: boolean }).__revealDone === true, undefined, { timeout: 20_000 });
  const revealMs = await page.evaluate(() => (window as unknown as { __revealMs: number }).__revealMs);
  expect(revealMs, `a helyes rúna ${revealMs.toFixed(0)} ms játékidőig világított`).toBeGreaterThanOrEqual(1_800);
  await expect(page.getByTestId("bc-quiz")).toHaveCount(0, { timeout: 10_000 });
});

test("jó rúnakő: dupla zsákmány (2 kristály), a kombó nő, és a következő zár is nyitható", async ({ page }) => {
  await startGame(page);
  await openLock(page);
  const right = page.locator('[data-testid="bc-quiz"] [data-correct="true"]').first();
  const rb = (await right.boundingBox())!;
  await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await expect.poll(async () => Number((await probe(page)).crystals), { timeout: 10_000 }).toBe(2);
  const p = await probe(page);
  expect(p.combo).toBe(1);
  expect(p.questionsCorrect).toBe(1);
  await expect(page.getByTestId("bc-quiz")).toHaveCount(0, { timeout: 10_000 });
  await openLock(page);
  await expect(page.getByTestId("bc-prompt")).toBeVisible();
});

/* ------------------------- review #484 (Vercel): „Mutasd” szünet, leghosszabb válaszok ------------------------- */

const LONG_PROMPT_QUIZ = {
  prompt:
    "Olvasd el figyelmesen: egy bányász reggel 12 kockát bányászott ki, délben a felét elhasználta egy híd építéséhez, " +
    "délután még kétszer annyit bányászott, mint amennyi a híd után megmaradt neki, este pedig három kockát elcserélt " +
    "egy fáklyára a falusinál. A nap végén minden megmaradt kockájából egyforma tornyokat épített, mindegyiket pontosan " +
    "három kocka magasra, és egyetlen kocka sem maradt ki. Hány tornyot épített a bányász a nap végén?",
  options: ["5", "4", "6", "3"],
  correctIndex: 0,
};

test("„Mutasd”: a kibontott hosszú kérdés olvasása alatt a játék áll (világ, pálya-óra, kérdés-óra), a „Tovább” folytatja", async ({ page }) => {
  await startGame(page);
  await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz }), LONG_PROMPT_QUIZ);
  const more = page.getByTestId("play-question-more");
  await expect(more).toBeVisible({ timeout: 10_000 });
  await more.click();
  await expect.poll(async () => (await probe(page)).expanded, { timeout: 5_000 }).toBe(1);
  const a = await probe(page);
  const t0 = await page.getByTestId("game-progress").getAttribute("aria-valuenow");
  await page.waitForTimeout(2_200);
  const b = await probe(page);
  expect(b.simTime, "kibontva a világ áll").toBe(a.simTime);
  expect(b.clock, "kibontva a kérdés-óra (válaszidő) áll").toBe(a.clock);
  expect(b.questionOpen, "a kérdés nem járt le").toBe(1);
  expect(await page.getByTestId("game-progress").getAttribute("aria-valuenow"), "kibontva a pálya órája áll").toBe(t0);
  await page.getByTestId("play-question-more").click();
  await expect.poll(async () => Number((await probe(page)).clock), { timeout: 10_000 }).toBeGreaterThan(Number(a.clock));
  expect((await probe(page)).expanded).toBe(0);
});

/** Tananyag-kérdésnél a válasz hosszabb is lehet (a lecke exportja): ~60 karakteres válaszok próbája. */
const MATERIAL_LONG_QUIZ = {
  prompt: "Mi a fotoszintézis lényege?",
  options: [
    "a növény fényenergiával szén-dioxidból és vízből cukrot készít",
    "a növény a talajból felvett cukrot oxigénné alakítja át éjszaka",
    "az állatok a napfény hatására saját testükben oxigént termelnek",
    "a gombák a lebontott levelekből fényt és meleget állítanak elő",
  ],
  correctIndex: 0,
};

/** Szélsőséges tananyag-válasz (~110 karakter; a játék-kérdés szerződése nem korlátozza a hosszt). */
const MATERIAL_XLONG_QUIZ = {
  prompt: "Melyik állítás igaz a vízkörforgásra?",
  options: [
    "a nap melege elpárologtatja a tengerek vizét, a pára felhővé sűrűsödik, majd csapadékként visszahullik a földre",
    "a folyók vize a tengerbe ömlik, ahol örökre ott marad, mert a tengervíz sós, ezért soha nem tud elpárologni",
    "a felhők a hegyekből szivárgó forrásvízből lesznek, és csak télen hullhat belőlük csapadék a síkságokra is",
    "az esővíz kizárólag a talajban marad, a növények nem veszik fel, és a levegőbe sem jut vissza semmilyen úton",
  ],
  correctIndex: 0,
};

for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) for (const [name, LONG] of [["évfolyam-bank", LONGEST_RUNE_QUIZ], ["tananyag, ~60 karakter", MATERIAL_LONG_QUIZ], ["tananyag, ~110 karakter", MATERIAL_XLONG_QUIZ]] as const) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });
    test(`leghosszabb válaszok (${name}): a rúnagombok szövege nem vágódik, a gombok a játéktéren belül, ≥ 48 px, nem fedik egymást`, async ({ page }) => {
      await startGame(page);
      await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz }), LONG);
      await expect(page.locator('[data-testid="bc-quiz"] [data-correct]')).toHaveCount(4, { timeout: 10_000 });
      const report = await page.evaluate(() => {
        const scene = document.querySelector(".game-scene")!.getBoundingClientRect();
        const runes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="bc-quiz"] [data-correct]'));
        const boxes = runes.map((el) => el.getBoundingClientRect());
        const problems: string[] = [];
        runes.forEach((el, i) => {
          const r = boxes[i]!;
          const label = el.querySelector<HTMLElement>(".bc-rune-label")!;
          // Levágás: a felirat (és minden szövegsora) a gomb dobozán belül van — a gomb pedig a játéktéren belül (a játéktér
          // `overflow: hidden`, ott vágódna le). Az egyes sorokat Range-dzsel mérjük (a soronkénti dobozok).
          const range = document.createRange();
          range.selectNodeContents(label);
          for (const line of Array.from(range.getClientRects())) {
            if (line.top < r.top - 1 || line.bottom > r.bottom + 1 || line.left < r.left - 1 || line.right > r.right + 1) {
              problems.push(`${i}: a felirat egy sora kilóg a gombból`);
              break;
            }
          }
          if (r.width < 48 || r.height < 48) problems.push(`${i}: ${r.width}×${r.height}`);
          if (r.top < scene.top - 1 || r.bottom > scene.bottom + 1 || r.left < -1 || r.right > innerWidth + 1) problems.push(`${i}: kilóg a játéktérből`);
          for (let j = i + 1; j < boxes.length; j++) {
            const b = boxes[j]!;
            if (Math.min(r.right, b.right) - Math.max(r.left, b.left) >= 1 && Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) >= 1) problems.push(`${i}×${j}: átfedés`);
          }
          if ((el.textContent ?? "").trim().length < 10) problems.push(`${i}: üres felirat`);
        });
        // A kérdéskártyát sem takarhatják (a prompt olvasható marad).
        const card = document.querySelector(".play-question-card")?.getBoundingClientRect();
        const pause = document.querySelector<HTMLElement>('[data-testid="bc-quiz-pause"]');
        const pauseBox = pause && getComputedStyle(pause).display !== "none" ? pause.getBoundingClientRect() : null;
        const all: Array<[string, DOMRect]> = boxes.map((r, i) => [String(i), r]);
        if (pauseBox) all.push(["szünetgomb", pauseBox]);
        if (card) for (const [i, r] of all) if (r.top < card.bottom - 1 && r.bottom > card.top + 1 && r.left < card.right && r.right > card.left) problems.push(`${i}: a kérdéskártyára lóg`);
        return problems;
      });
      const dir = process.env.BC_PLAY_SHOT_DIR;
      if (dir) await page.screenshot({ path: `${dir}/block-craft-quiz-${vp.width}x${vp.height}-long-${LONG.options[0]!.length}.jpg`, type: "jpeg", quality: 70, scale: "css" });
      expect(report).toEqual([]);
    });
  });
}

/* ------------------------- review #484: nincs véletlen válasz (B1), beragadó tartás (M3), óra (L7), fekvő (M4) ------------------------- */

/** Hosszú kérdésszöveg → hosszú válaszablak (`windowMsFor` olvasási pótlék, ≤ 9 s); rövid válaszok. */
const LONG_WINDOW_QUIZ = { prompt: LONG_PROMPT_QUIZ.prompt, options: ["5", "4", "6", "3"], correctIndex: 0 };

/** Rúnaérc a játékos elé, zár nélkül; a célkereszt (a vászon közepe) az ércre néz. Visszaadja a vászon közepét. */
async function oreAhead(page: Page): Promise<{ x: number; y: number }> {
  // Hosszú kérdés (olvasási pótlékkal ~9 s válaszablak): a CI szoftveres WebGL-jén (~0,7 s / képkocka) a lépések sora is
  // beférjen az ablakba — a mérés a véletlen választ nézi, nem az ablak lejártát.
  await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ runeAhead: true, quiz }), LONG_WINDOW_QUIZ);
  await ciLag();
  // Egy render-lépés, hogy a kamera az ércre forduljon (CI szoftveres WebGL: lassú képkockák).
  const f0 = Number((await probe(page)).frames);
  await expect.poll(async () => Number((await probe(page)).frames), { timeout: 15_000 }).toBeGreaterThan(f0 + 1);
  const box = (await page.locator("canvas").first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A vászon-koppintások pillanatában a zár állapota, a LAPON belül rögzítve (C-64 / C-65): a CI-n egy Playwright-hívás 0,5–1,3 s,
 * ezért a „hány koppintás érte a nyitott, élesített zárat” a lapon mérve determinisztikus, nem a hívások közti időzítésen múlik.
 */
async function recordCanvasTaps(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as GameTestWindow & { __bcTaps?: Array<{ open: number; armed: number }> };
    w.__bcTaps = [];
    document.querySelector("canvas")!.addEventListener(
      "pointerup",
      () => {
        const p = w.__websuliGame!.probe();
        w.__bcTaps!.push({ open: Number(p.lockOpen), armed: Number(p.armed) });
      },
      { capture: true },
    );
  });
}

/**
 * A szándékos gesztus ellenpróbája: ha a zár nyitva és élesítve van, a jó rúnagomb választ UGYANABBAN a lapfeladatban (a gomb
 * billentyűs útja, `click` `detail === 0` — a valódi érintéses út a fenti Rúna-zár tesztekben); ha közben (lassú gépen) lejárt
 * a válaszablak, egyszer friss zár nyílik a hosszú kérdéssel, és arra válaszol.
 */
async function answerArmedLockNow(page: Page): Promise<void> {
  const once = () =>
    page.evaluate((quiz) => {
      const w = window as unknown as GameTestWindow & { __bcReopened?: boolean };
      const p = w.__websuliGame!.probe();
      const btn = document.querySelector<HTMLButtonElement>('[data-testid="bc-quiz"] [data-correct="true"]');
      if (p.lockOpen === 1 && p.armed === 1 && btn) {
        btn.click();
        return true;
      }
      if (p.lockOpen !== 1 && p.reveal !== 1 && !w.__bcReopened) {
        w.__bcReopened = true;
        w.__websuliGame!.forceState({ question: true, quiz });
      }
      return false;
    }, LONG_WINDOW_QUIZ);
  await expect.poll(once, { timeout: 30_000 }).toBe(true);
}

test("B1: gyors dupla / többszörös valódi koppintás az ércre — a zár megnyílik, de válasz NEM születik; a rúnagomb (szándékos gesztus) válaszol", async ({ page }) => {
  test.setTimeout(Math.max(test.info().timeout, 120_000));
  await startGame(page);
  const c = await oreAhead(page);
  await recordCanvasTaps(page);
  await tapAt(page, c.x, c.y); // 1. koppintás: a rúnaérc érintése → Rúna-zár
  await expect.poll(async () => (await probe(page)).lockOpen, { timeout: 10_000 }).toBe(1);
  // Bányászó gyerek: tovább koppint az ércre (mellé, az érc lapján) — az élesítés előtt és után is.
  await tapAt(page, c.x + 18, c.y - 14);
  await expect.poll(async () => (await probe(page)).armed, { timeout: 15_000 }).toBe(1);
  for (const [dx, dy] of [[0, 0], [20, 0], [-18, 16]] as const) await tapAt(page, c.x + dx, c.y + dy);
  const taps = await page.evaluate(() => (window as unknown as { __bcTaps: Array<{ open: number; armed: number }> }).__bcTaps);
  const onArmedLock = taps.filter((t) => t.open === 1 && t.armed === 1).length;
  expect(onArmedLock, `a mérés nem üres: ${onArmedLock} koppintás érte a nyitott, élesített zárat (${JSON.stringify(taps)})`).toBeGreaterThanOrEqual(2);
  expect((await probe(page)).questionsAnswered, "a bányászó koppintásokból nem lett válasz").toBe(0);
  // Ellenpróba: a szándékos gesztus (élesített zárnál a jó rúnagomb) válaszol — a mérés nem üres.
  await answerArmedLockNow(page);
  await expect.poll(async () => Number((await probe(page)).questionsAnswered), { timeout: 10_000 }).toBe(1);
});

test("B1 + M3: a tartott Bányász gombbal megérintett ércnél a zár nyílik, a tartás elenged, a felengedés nem válasz és nem bányászik tovább", async ({ page }) => {
  test.setTimeout(Math.max(test.info().timeout, 120_000));
  await startGame(page);
  await oreAhead(page);
  const btn = (await page.getByRole("button", { name: "Bányász" }).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const pt = { x: btn.x + btn.width / 2, y: btn.y + btn.height / 2, id: 7 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
  await expect.poll(async () => (await probe(page)).lockOpen, { timeout: 10_000 }).toBe(1);
  const opened = await probe(page);
  expect(opened.pressing, "a zár nyitása elengedte a tartást").toBe(0);
  const blocks0 = Number(opened.blocks);
  // Tartva marad az élesítésen túl, majd felengedi (a gomb ekkor már rejtett / letiltott).
  await expect.poll(async () => (await probe(page)).armed, { timeout: 15_000 }).toBe(1);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  // A felengedés UTÁN legalább 4 render-lépés fusson le (egy beragadt tartás ezalatt bányászna / választana) — a d296f39b eredeti
  // mércéje; a válasz lépése ma már nem függ a válaszablaktól (`answerArmedLockNow`), így ezt nem kell rövidíteni.
  const f0 = Number((await probe(page)).frames);
  await expect.poll(async () => Number((await probe(page)).frames), { timeout: 30_000 }).toBeGreaterThan(f0 + 3);
  const p = await probe(page);
  expect(p.questionsAnswered, "a felengedés nem válasz").toBe(0);
  expect(p.pressing, "nincs beragadt tartás").toBe(0);
  expect(Number(p.blocks), "a zár alatt nem bányászott tovább").toBe(blocks0);
  // A zár szándékos gesztussal zárható (ha lassú gépen közben lejárt, friss zárral).
  await answerArmedLockNow(page);
  await expect.poll(async () => Number((await probe(page)).questionsAnswered), { timeout: 10_000 }).toBe(1);
  expect(Number((await probe(page)).questionsCorrect)).toBe(1);
  await expect(page.getByTestId("bc-quiz")).toHaveCount(0, { timeout: 15_000 });
  // A zár után a Bányász gomb újra él (nem ragadt be), szünet + folytatás után sincs beragadt tartás.
  await expect(page.getByRole("button", { name: "Bányász" })).toBeEnabled();
  await page.getByRole("button", { name: "Szünet" }).first().tap();
  await expect.poll(async () => (await probe(page)).paused, { timeout: 5_000 }).toBe(1);
  expect((await probe(page)).pressing).toBe(0);
  await page.getByTestId("game-resume").tap();
  await expect.poll(async () => (await probe(page)).paused, { timeout: 5_000 }).toBe(0);
  expect((await probe(page)).pressing).toBe(0);
});

test("L7 (review #484, viselkedés): az utolsó rúnazár az időkeret utolsó másodpercében → pálya teljesítve, a győzelem után az óra nem lép; válasz nélkül lejár", async ({ page }) => {
  await startGame(page);
  await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz }), LONG_WINDOW_QUIZ);
  await ciLag();
  const right = page.locator('[data-testid="bc-quiz"] [data-correct="true"]').first();
  await expect(right).toHaveAttribute("data-armed", "true", { timeout: 15_000 });
  // 1 mp van hátra, a cél egy rúnaércnyire — és a jó válasz UGYANABBAN a lapfeladatban (a rúnagomb billentyűs útja, `click`
  // `detail === 0`): az óra-lépés (setInterval) nem kerülhet a beállítás és a válasz közé (a CI-n egy Playwright-hívás 0,5–1,3 s).
  await page.evaluate(() => {
    (window as unknown as GameTestWindow).__websuliGame!.forceState({ runesLeft: 1, timeLeft: 1 });
    document.querySelector<HTMLButtonElement>('[data-testid="bc-quiz"] [data-correct="true"]')!.click();
  });
  const p0 = await probe(page);
  expect(Number(p0.runes), "a jó válasz a célt teljesítette").toBe(Number(p0.runeGoal));
  // A megoldás-kijelzés alatt és után az óra nem lép (2,5 s > 1 s maradék), eredményképernyő jön, nem vereség.
  await page.waitForTimeout(2_500);
  await expect(page.getByTestId("bc-level-complete")).toBeVisible({ timeout: 30_000 });
  const after = await probe(page);
  expect(after.phase).toBe("levelComplete");
  expect(Number(after.timeLeft), "a győzelem után az óra nem lépett").toBe(1);
  // Fordítva: a zár nyitva, válasz nincs → a pálya lejár.
  await page.reload();
  await startGame(page);
  await openLock(page);
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.forceState({ runesLeft: 1, timeLeft: 1 }));
  await ciLag();
  await expect.poll(async () => (await probe(page)).phase, { timeout: 20_000 }).toBe("over");
});

test.describe("844x390 fekvő", () => {
  test.use({ viewport: { width: 844, height: 390 } });
  test("M4: fekvőben a rúnagombok a két oldalon, a jelenet közepét (érc, célkereszt) és a kérdéskártyát szabadon hagyják", async ({ page }) => {
    await startGame(page);
    await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz }), LONGEST_RUNE_QUIZ);
    await ciLag();
    await expect(page.locator('[data-testid="bc-quiz"] [data-correct]')).toHaveCount(4, { timeout: 10_000 });
    await expect(page.locator('[data-testid="bc-quiz"] [data-correct]').first()).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
    await page.waitForTimeout(600); // a kártya beúszása és a kövek élesítés-animációja lefut (képernyőképhez)
    const report = await page.evaluate(() => {
      const scene = document.querySelector(".game-scene")!.getBoundingClientRect();
      const cx = scene.left + scene.width / 2;
      const cy = scene.top + scene.height / 2;
      // A jelenet közepe: a célkereszt körüli sáv (a szélesség 30%-a × a magasság 40%-a) — itt van az érc és a rúnakövek.
      const mid = { left: cx - scene.width * 0.15, right: cx + scene.width * 0.15, top: cy - scene.height * 0.2, bottom: cy + scene.height * 0.2 };
      const problems: string[] = [];
      const runes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="bc-quiz"] [data-correct]'));
      runes.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.left < mid.right && r.right > mid.left && r.top < mid.bottom && r.bottom > mid.top) problems.push(`${i}: a jelenet közepére lóg`);
        const side = i < 2 ? r.right <= cx : r.left >= cx;
        if (!side) problems.push(`${i}: nem a saját oldalán (${i < 2 ? "bal" : "jobb"})`);
      });
      return problems;
    });
    const dir = process.env.BC_PLAY_SHOT_DIR;
    if (dir) await page.screenshot({ path: `${dir}/block-craft-quiz-844x390-question-sides.jpg`, type: "jpeg", quality: 70, scale: "css" });
    expect(report).toEqual([]);
  });
});

/* ------------------------- review #484 N1: a 3D-rúnakövek láthatók (nem takarja kártya, gomb, HUD, vezérlő) ------------------------- */

/** A leghosszabb kérdés (a „Mutasd”-os próba szövege) a leghosszabb válaszokkal (~110 karakter). */
const LONGEST_BOTH_QUIZ = { prompt: LONG_PROMPT_QUIZ.prompt, options: MATERIAL_XLONG_QUIZ.options, correctIndex: 0 };

for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) for (const [name, QUIZ] of [["évfolyam-bank", LONGEST_RUNE_QUIZ], ["leghosszabb kérdés + válaszok", LONGEST_BOTH_QUIZ]] as const) {
  test.describe(`N1 ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });
    test(`a négy rúnakő ≥ 70%-ban látható, a kő ↔ rúnagomb elrendezés egyezik, a kártya nem lóg a gombokra (${name})`, async ({ page }) => {
      await startGame(page);
      await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz }), QUIZ);
      await expect(page.locator('[data-testid="bc-quiz"] [data-correct]').first()).toHaveAttribute("data-armed", "true", { timeout: 15_000 });
      // A kősáv mérése ~5 Hz: várunk, amíg a kövek a sávban vannak (a lapon belül, képkockára — C-65).
      await expect.poll(async () => String((await probe(page)).stoneBand), { timeout: 10_000 }).not.toBe("null");
      const report = await page.evaluate(() => {
        const w = window as unknown as GameTestWindow;
        const stones = JSON.parse(String(w.__websuliGame!.probe().stoneRects)) as Array<{ x0: number; y0: number; x1: number; y1: number } | null>;
        const sel = [".play-question-card", '[data-testid="bc-quiz"] button', "[data-game-hud]", '[data-testid="virtual-joystick"]', ".bc-actions button", ".bc-chips > *", '[data-testid="bc-hotbar"]'];
        const occ: DOMRect[] = [];
        for (const s of sel) for (const el of Array.from(document.querySelectorAll<HTMLElement>(s))) {
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) occ.push(r);
        }
        const visible = stones.map((s) => {
          if (!s) return 0;
          let n = 0, vis = 0;
          for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) {
            const x = s.x0 + ((a + 0.5) / 12) * (s.x1 - s.x0);
            const y = s.y0 + ((b + 0.5) / 12) * (s.y1 - s.y0);
            n++;
            if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
            if (!occ.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) vis++;
          }
          return Math.round((100 * vis) / n);
        });
        const runes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="bc-quiz"] [data-correct]')).map((el) => el.getBoundingClientRect());
        const cx = (r: { x0: number; x1: number } | DOMRect) => ("x0" in r ? (r.x0 + r.x1) / 2 : r.left + r.width / 2);
        const cy = (r: { y0: number; y1: number } | DOMRect) => ("y0" in r ? (r.y0 + r.y1) / 2 : r.top + r.height / 2);
        // Az elrendezés egyezése: minden kőpárra a bal/jobb és a fent/lent viszony ugyanaz, mint a rúnagomboknál.
        const mismatch: string[] = [];
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
          const si = stones[i], sj = stones[j];
          if (!si || !sj) continue;
          const dxB = cx(runes[j]!) - cx(runes[i]!);
          const dyB = cy(runes[j]!) - cy(runes[i]!);
          const dxS = cx(sj) - cx(si);
          const dyS = cy(sj) - cy(si);
          if (Math.abs(dxB) > 20 && Math.sign(dxB) !== Math.sign(dxS)) mismatch.push(`${i}-${j} vízszintesen`);
          if (Math.abs(dyB) > 20 && Math.sign(dyB) !== Math.sign(dyS)) mismatch.push(`${i}-${j} függőlegesen`);
        }
        const card = document.querySelector(".play-question-card")!.getBoundingClientRect();
        const cardOnRunes = runes.filter((r) => r.top < card.bottom - 1 && r.bottom > card.top + 1 && r.left < card.right && r.right > card.left).length;
        return { visible, mismatch, cardOnRunes, stones: JSON.stringify(stones) };
      });
      const dir = process.env.BC_PLAY_SHOT_DIR;
      if (dir) await page.screenshot({ path: `${dir}/block-craft-quiz-${vp.width}x${vp.height}-question${name === "évfolyam-bank" ? "" : "-longest"}.jpg`, type: "jpeg", quality: 70, scale: "css" });
      for (let i = 0; i < 4; i++) expect(report.visible[i]!, `a(z) ${"ABCD"[i]} kő látható része (${report.stones})`).toBeGreaterThanOrEqual(70);
      expect(report.mismatch, "a kövek elrendezése a rúnagombokét követi").toEqual([]);
      expect(report.cardOnRunes, "a kérdéskártya nem lóg a rúnagombokra").toBe(0);
    });
  });
}

/* ------------------------- review #484 M5: lecke-kupon mód a lapon (a közös #483-szabállyal) ------------------------- */

for (const size of [3, 5, 8]) {
  test(`M5: kupon mód, ${size} tételes lecke — ${size + 3} rúnazár egymás után: mindegyik kérdéssel, csak a lecke tételei, nincs közvetlen ismétlés`, async ({ page }) => {
    test.setTimeout(Math.max(test.info().timeout, 240_000));
    const lesson = Array.from({ length: size }, (_, i) => ({
      id: `e2e-lecke-${i}`,
      prompt: `Melyik a ${i + 1}. lecke-kérdés helyes válasza?`,
      options: [`jó ${i}`, `rossz ${i}a`, `rossz ${i}b`, `rossz ${i}c`],
      correctIndex: 0,
      topic: "math",
    }));
    // A lecke-kupon (a beforeEach útvonal-kezelője után regisztrálva, ezért ez fut elsőként).
    await page.route("**/api/**", async (route) => {
      const p = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (p === "/api/auth/user") data = null;
      if (p.includes("sync-eligibility")) data = { eligible: false };
      if (p.endsWith("/coupons/active")) {
        data = { coupon: { id: "coupon-e2e", lessonId: "lecke-e2e", sectionIdx: -1, minutes: 10, remainingSeconds: 600, started: true } };
      }
      if (p.includes("material-quizzes")) data = { classroom: 5, materials: [{ id: "lecke-e2e", title: "Lecke", createdAt: "2026-11-17T08:00:00.000Z" }], items: lesson };
      await route.fulfill({ json: data });
    });
    await startGame(page);
    await expect(page.getByTestId("coupon-hud")).toBeVisible({ timeout: 10_000 });
    const keys: string[] = [];
    const sources: string[] = [];
    let lastId: number | null = null;
    for (let i = 0; i < size + 3; i++) {
      // A pálya-cél (1. pálya: 3 rúnaérc) ne zárja le a menetet a sorozat közben: a kinyitott zárak számlálója nullázva.
      await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, runesLeft: 99 }));
      await expect
        .poll(async () => {
          const pr = await probe(page);
          return pr.lockOpen === 1 && pr.questionId !== null && pr.questionId !== lastId ? pr.questionKey : null;
        }, { timeout: 20_000, message: `${i + 1}. rúnazár` })
        .not.toBeNull();
      const pr = await probe(page);
      lastId = Number(pr.questionId);
      keys.push(String(pr.questionKey));
      sources.push(String(pr.questionSource));
      await expect(page.locator('[data-testid="bc-quiz"] [data-armed="true"]').first()).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press(i % 2 === 0 ? "2" : "1"); // felváltva rossz és (a keveréstől függően) bármely válasz
      await expect.poll(async () => (await probe(page)).lockOpen, { timeout: 15_000 }).toBe(0);
      await expect.poll(async () => (await probe(page)).questionOpen, { timeout: 15_000 }).toBe(0);
    }
    const allowed = new Set(lesson.map((q) => `mat:${q.id}`));
    expect(keys.every((k) => allowed.has(k)), `csak a lecke tételei: ${keys.join(" | ")}`).toBe(true);
    expect(sources.every((s) => s === "coupon"), `kupon-forrás: ${sources.join(" | ")}`).toBe(true);
    for (let i = 1; i < keys.length; i++) expect(keys[i], `közvetlen ismétlés: ${keys.join(" | ")}`).not.toBe(keys[i - 1]);
    expect(new Set(keys).size, "minden tétel sorra került").toBe(size);
    expect((await probe(page)).freeLocks, "nincs kérdés nélkül tört rúnazár").toBe(0);
  });
}

/* ------------------------- review #484 vak ellenőrzés: K1 (kőkoppintás), K2, K4, K6 ------------------------- */

for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 412, height: 915 }]) {
  test.describe(`vak K1 ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });
    test("a látható 3D rúnakőre valódi érintéssel koppintva mind a 4 kő választ (a terep nem nyeli el)", async ({ page }) => {
      test.setTimeout(Math.max(test.info().timeout, 180_000));
      await startGame(page);
      let lastId: number | null = null;
      for (let i = 0; i < 4; i++) {
        const before = Number((await probe(page)).questionsAnswered);
        await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz, runesLeft: 99 }), LONG_WINDOW_QUIZ);
        // Az ÚJ zár nyitva és élesítve (a mag szerint) — az előző zár megoldás-kijelzésének gombjai nem számítanak.
        await expect
          .poll(async () => {
            const pr = await probe(page);
            return pr.lockOpen === 1 && pr.armed === 1 && pr.questionId !== null && pr.questionId !== lastId;
          }, { timeout: 30_000, message: `${i + 1}. zár nyitva és élesítve` })
          .toBe(true);
        lastId = Number((await probe(page)).questionId);
        await expect.poll(async () => String((await probe(page)).stoneBand), { timeout: 10_000 }).not.toBe("null");
        // A kövek a sávba a zár első képkockáján kerülnek: a lassú szoftveres WebGL-en a téglalapot csak két egymást követő
        // képkockán stabil helyzetben olvassuk ki (C-65), különben a probe a sávba helyezés előtti állapotot kaphatná.
        type R = { x0: number; y0: number; x1: number; y1: number } | null;
        let rects: R[] = [];
        await expect
          .poll(
            async () => {
              const a = await probe(page);
              const f0 = Number(a.frames);
              await expect.poll(async () => Number((await probe(page)).frames), { timeout: 10_000 }).toBeGreaterThan(f0 + 1);
              const b2 = await probe(page);
              const ra = JSON.parse(String(a.stoneRects)) as R[];
              const rb = JSON.parse(String(b2.stoneRects)) as R[];
              // CI #484: a kövek időalapú ringatózása nagy sávban ~9 px kilengés; lassú szoftveres WebGL-en két képkocka között a kő
              // 4 px-nél többet is mozdul (6× CPU-lassítással helyben is mérve). A tűrés ezért a kőmérethez igazodik (¼ magasság,
              // min. 4 px) — a sávba helyezés előtti állapot ugrása (több száz px) így is kiszűrődik.
              const tol = (x: NonNullable<R>) => Math.max(4, (x.y1 - x.y0) / 4);
              const stable = rb.length === 4 && rb.every((x, k) => x && ra[k] && Math.abs(x.x0 - ra[k]!.x0) <= tol(x) && Math.abs(x.y0 - ra[k]!.y0) <= tol(x));
              if (stable) rects = rb;
              return stable;
            },
            { timeout: 30_000, message: "a kövek helyzete stabil" },
          )
          .toBe(true);
        const r = rects[i];
        expect(r, `a(z) ${"ABCD"[i]} kő látszik`).toBeTruthy();
        // B1: a kő középpontja nem eshet az érc vetületére (ott a bányászó koppintás érné el).
        const ore = JSON.parse(String((await probe(page)).oreRect)) as { x0: number; y0: number; x1: number; y1: number } | null;
        if (ore) {
          const cx = (r!.x0 + r!.x1) / 2;
          const cy = (r!.y0 + r!.y1) / 2;
          expect(cx > ore.x0 && cx < ore.x1 && cy > ore.y0 && cy < ore.y1, `a(z) ${"ABCD"[i]} kő az érc vetületén (kő ${JSON.stringify(r)}, érc ${JSON.stringify(ore)})`).toBe(false);
        }
        const tx = (r!.x0 + r!.x1) / 2;
        const ty = (r!.y0 + r!.y1) / 2;
        const under = await page.evaluate(([x, y]) => {
          const el = document.elementFromPoint(x!, y!) as HTMLElement | null;
          return el ? `${el.tagName}.${String(el.className).slice(0, 60)}#${el.getAttribute("data-testid") ?? ""}` : "null";
        }, [tx, ty]);
        await tapAt(page, tx, ty);
        await expect
          .poll(async () => Number((await probe(page)).questionsAnswered), {
            timeout: 10_000,
            message: `a(z) ${"ABCD"[i]} kőre koppintás választott (kő ${JSON.stringify(r)}; a ponton: ${under}; utolsó koppintás: ${String((await probe(page)).lastTap)})`,
          })
          .toBe(before + 1);
        await expect(page.getByTestId(`bc-rune-${i}`), "a koppintott kő a választott válasz").toHaveAttribute("data-state", /^(correct|wrong)$/);
        // A megoldás-kijelzés végéig várunk (a rúnaréteg eltűnik).
        await expect(page.getByTestId("bc-quiz")).toHaveCount(0, { timeout: 20_000 });
      }
    });
  });
}

test.describe("vak K2 360x640", () => {
  test.use({ viewport: { width: 360, height: 640 } });
  test("a megoldás-kijelzéskor a kérdéskártya nem lóg a látható rúnaréteg-szünetgombra; új kérdésnél a gomb újra látszik", async ({ page }) => {
    await startGame(page);
    await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz }), LONGEST_RUNE_QUIZ);
    const wrong = page.locator('[data-testid="bc-quiz"] [data-correct="false"]').first();
    await expect(wrong).toHaveAttribute("data-armed", "true", { timeout: 15_000 });
    const overlap = () =>
      page.evaluate(() => {
        const pause = document.querySelector<HTMLElement>('[data-testid="bc-quiz-pause"]');
        const card = document.querySelector<HTMLElement>(".play-question-card");
        if (!pause || !card) return { visible: false, overlap: 0 };
        const cs = getComputedStyle(pause);
        const visible = cs.display !== "none" && cs.visibility !== "hidden";
        const a = pause.getBoundingClientRect();
        const b = card.getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return { visible, overlap: visible && w > 0 && h > 0 ? Math.round(w * h) : 0 };
      });
    expect((await overlap()).visible, "kérdés közben a szünetgomb látszik").toBe(true);
    const wb = (await wrong.boundingBox())!;
    await tapAt(page, wb.x + wb.width / 2, wb.y + wb.height / 2);
    await expect(page.locator('[data-testid="bc-quiz"][data-state="reveal"]')).toBeVisible({ timeout: 10_000 });
    // FLAKE-BC-K1K2: a kijelzés ELSŐ képkockájától sűrűn mintázunk (azonnal, majd 50 ms-onként 1,5 s-ig) — az 5 Hz-es mérő
    // ütemei közötti rálógást is el kell kapni (korábban 250 ms-os mintavétel csak terhelt gépen akadt bele).
    for (let k = 0; k < 30; k++) {
      if (k > 0) await page.waitForTimeout(50);
      const o = await overlap();
      expect(o.overlap, `a kártya ${o.overlap} px²-en lóg a látható szünetgombra`).toBe(0);
    }
    await expect(page.getByTestId("bc-quiz")).toHaveCount(0, { timeout: 20_000 });
    await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz }), LONGEST_RUNE_QUIZ);
    await expect.poll(async () => { const pr = await probe(page); return pr.lockOpen === 1 && pr.armed === 1; }, { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => (await overlap()).visible, { timeout: 5_000, message: "új kérdésnél a szünetgomb újra látszik" }).toBe(true);
  });
});

test("vak K4: a végeredmény „Rúnaérc” száma a teljes menet kinyitott rúnazárai (nem csak az utolsó pályáé)", async ({ page }) => {
  test.setTimeout(Math.max(test.info().timeout, 120_000));
  await startGame(page);
  const answerOne = async (runesLeft: number) => {
    await page.evaluate((args) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz: args.quiz, runesLeft: args.runesLeft }), { quiz: LONG_WINDOW_QUIZ, runesLeft });
    await expect(page.locator('[data-testid="bc-quiz"] [data-armed="true"]').first()).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-testid="bc-quiz"] [data-correct="true"]')!.click());
  };
  // 1. pálya: az utolsó rúnaérc → pálya teljesítve (1 valódi zár).
  await answerOne(1);
  await expect(page.getByTestId("bc-level-complete")).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("r"); // a következő pálya
  await expect.poll(async () => (await probe(page)).phase, { timeout: 15_000 }).toBe("play");
  // 2. pálya: még 1 zár, majd a menet vége.
  await answerOne(99);
  await expect.poll(async () => (await probe(page)).questionOpen, { timeout: 15_000 }).toBe(0);
  const runRunes = Number((await probe(page)).runRunes);
  expect(runRunes, "a menetben 2 valódi rúnazár nyílt").toBe(2);
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.forceState({ phase: "over" }));
  await expect(page.getByTestId("bc-over")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("bc-over-runes")).toHaveText(String(runRunes));
});

test("vak K6: nyitott kérdés alatt a lap legfeljebb ~13 render/s (a kérdés-sáv 10 Hz-e; a HUD nem rajzol újra feleslegesen)", async ({ page }) => {
  await startGame(page);
  await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz }), LONG_WINDOW_QUIZ);
  await expect(page.locator('[data-testid="bc-quiz"] [data-armed="true"]').first()).toBeVisible({ timeout: 20_000 });
  const rate = await page.evaluate(async () => {
    const w = window as unknown as GameTestWindow;
    const r0 = Number(w.__websuliGame!.probe().renders);
    const t0 = performance.now();
    await new Promise((res) => setTimeout(res, 2500));
    const r1 = Number(w.__websuliGame!.probe().renders);
    return ((r1 - r0) * 1000) / (performance.now() - t0);
  });
  expect((await probe(page)).lockOpen, "a mérés nyitott zár alatt történt").toBe(1);
  expect(rate, `render/s nyitott kérdés alatt: ${rate.toFixed(1)}`).toBeLessThanOrEqual(13);
});

/* ------------------------- review #484 (BlockCraftQuiz.tsx:3229): a dinamikus sorkorlát újramérést indít ------------------------- */
/** Közepes prompt: 3–5 sorba befér, de a leghosszabb válaszok mellett a kártya 2 sorra szűkül. */
const MEDIUM_PROMPT_XLONG_QUIZ = {
  prompt:
    "Egy bányász reggel 12 kockát bányászott, délben a felét elhasználta egy hídhoz, délután még hármat talált. " +
    "Hány kockája maradt estére a hátizsákjában?",
  options: MATERIAL_XLONG_QUIZ.options,
  correctIndex: 0,
};

test.describe("review #484 360x640: a 2 sorra szűkített közepes prompt", () => {
  test.use({ viewport: { width: 360, height: 640 } });
  test("ha a sorkorlát utólag levágja a kérdést, megjelenik a „Mutasd”", async ({ page }) => {
    await startGame(page);
    await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz }), MEDIUM_PROMPT_XLONG_QUIZ);
    await expect(page.locator('[data-testid="bc-quiz"] [data-correct]')).toHaveCount(4, { timeout: 10_000 });
    // A mérő (200 ms-onként) beállítja a sorkorlátot; várunk, amíg elrendeződik.
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--bc-pq-lines")), { timeout: 5_000 }).toBe("2");
    await page.waitForTimeout(800);
    const clipped = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".play-question-prompt");
      return !!el && el.scrollHeight > el.clientHeight + 1;
    });
    expect(clipped, "a próba valóban levágott promptot ad (különben nem bizonyít)").toBe(true);
    await expect(page.getByTestId("play-question-more"), "a levágott kérdés vége elérhető").toBeVisible({ timeout: 3_000 });
  });
});
