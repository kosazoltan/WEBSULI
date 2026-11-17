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
    test.setTimeout(180_000);
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
  const f0 = Number(opened.frames);
  await expect.poll(async () => Number((await probe(page)).frames), { timeout: 15_000 }).toBeGreaterThan(f0 + 2);
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
