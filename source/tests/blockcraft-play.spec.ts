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

const probe = (page: Page) => page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.probe());

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

/** Rúnaérc a játékos elé, zár nélkül; a célkereszt (a vászon közepe) az ércre néz. Visszaadja a vászon közepét. */
async function oreAhead(page: Page): Promise<{ x: number; y: number }> {
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.forceState({ runeAhead: true }));
  // Egy render-lépés, hogy a kamera az ércre forduljon (CI szoftveres WebGL: lassú képkockák).
  const f0 = Number((await probe(page)).frames);
  await expect.poll(async () => Number((await probe(page)).frames), { timeout: 15_000 }).toBeGreaterThan(f0 + 1);
  const box = (await page.locator("canvas").first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("B1: gyors dupla / többszörös valódi koppintás az ércre — a zár megnyílik, de válasz NEM születik; a rúnagomb (szándékos gesztus) válaszol", async ({ page }) => {
  await startGame(page);
  const c = await oreAhead(page);
  await page.touchscreen.tap(c.x, c.y); // 1. koppintás: a rúnaérc érintése → Rúna-zár
  await expect.poll(async () => (await probe(page)).lockOpen, { timeout: 10_000 }).toBe(1);
  // Bányászó gyerek: tovább koppint az ércre (a közepére és mellé, az érc lapján) — az élesítés előtt és után is.
  await page.touchscreen.tap(c.x + 18, c.y - 14);
  await page.touchscreen.tap(c.x - 16, c.y + 12);
  await expect.poll(async () => (await probe(page)).armed, { timeout: 10_000 }).toBe(1);
  for (const [dx, dy] of [[0, 0], [20, 0], [-20, 0], [0, -20], [0, 18]] as const) await page.touchscreen.tap(c.x + dx, c.y + dy);
  const p = await probe(page);
  expect(p.questionsAnswered, "a bányászó koppintásokból nem lett válasz").toBe(0);
  expect(p.lockOpen).toBe(1);
  expect(p.reveal).toBe(0);
  // Ellenpróba: a szándékos gesztus (élesített zárnál a rúnagomb koppintása) válaszol — a mérés nem üres.
  const right = page.locator('[data-testid="bc-quiz"] [data-correct="true"]').first();
  await expect(right).toHaveAttribute("data-armed", "true");
  const rb = (await right.boundingBox())!;
  await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await expect.poll(async () => Number((await probe(page)).questionsAnswered), { timeout: 10_000 }).toBe(1);
});

test("B1 + M3: a tartott Bányász gombbal megérintett ércnél a zár nyílik, a tartás elenged, a felengedés nem válasz és nem bányászik tovább", async ({ page }) => {
  await startGame(page);
  await oreAhead(page);
  const btn = (await page.getByRole("button", { name: "Bányász" }).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const pt = { x: btn.x + btn.width / 2, y: btn.y + btn.height / 2, id: 7 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
  await expect.poll(async () => (await probe(page)).lockOpen, { timeout: 10_000 }).toBe(1);
  expect((await probe(page)).pressing, "a zár nyitása elengedte a tartást").toBe(0);
  const blocks0 = Number((await probe(page)).blocks);
  // Tartva marad az élesítésen túl, majd felengedi (a gomb ekkor már rejtett / letiltott).
  await expect.poll(async () => (await probe(page)).armed, { timeout: 10_000 }).toBe(1);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const f0 = Number((await probe(page)).frames);
  await expect.poll(async () => Number((await probe(page)).frames), { timeout: 15_000 }).toBeGreaterThan(f0 + 2);
  const p = await probe(page);
  expect(p.questionsAnswered, "a felengedés nem válasz").toBe(0);
  expect(p.pressing, "nincs beragadt tartás").toBe(0);
  expect(Number(p.blocks), "a zár alatt nem bányászott tovább").toBe(blocks0);
  // A zár a rúnagombbal (szándékos gesztus) zárható — a válaszablak lejárta előtt.
  const right = page.locator('[data-testid="bc-quiz"] [data-correct="true"]').first();
  await expect(right).toHaveAttribute("data-armed", "true", { timeout: 10_000 });
  const rb = (await right.boundingBox())!;
  await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await expect.poll(async () => Number((await probe(page)).questionsAnswered), { timeout: 10_000 }).toBe(1);
  expect(Number((await probe(page)).questionsCorrect)).toBe(1);
  await expect(page.getByTestId("bc-quiz")).toHaveCount(0, { timeout: 10_000 });
  // A zár után a Bányász gomb újra él (nem ragadt be), szünet + folytatás után sincs beragadt tartás.
  await expect(page.getByRole("button", { name: "Bányász" })).toBeEnabled();
  await page.getByRole("button", { name: "Szünet" }).first().tap();
  await expect.poll(async () => (await probe(page)).paused, { timeout: 5_000 }).toBe(1);
  expect((await probe(page)).pressing).toBe(0);
  await page.getByTestId("game-resume").tap();
  await expect.poll(async () => (await probe(page)).paused, { timeout: 5_000 }).toBe(0);
  expect((await probe(page)).pressing).toBe(0);
});

test("L7 (review #484, viselkedés): az utolsó rúnazár az időkeret végén → pálya teljesítve; válasz nélkül lejár", async ({ page }) => {
  await startGame(page);
  await openLock(page);
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.forceState({ runesLeft: 1, timeLeft: 2 }));
  const right = page.locator('[data-testid="bc-quiz"] [data-correct="true"]').first();
  const rb = (await right.boundingBox())!;
  await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2);
  // A cél teljesült: a megoldás-kijelzés alatt sem jár le az óra (2 mp-nél több telik el), eredményképernyő jön.
  await expect(page.getByTestId("bc-level-complete")).toBeVisible({ timeout: 20_000 });
  expect((await probe(page)).phase).toBe("levelComplete");
  // Fordítva: a zár nyitva, válasz nincs → a pálya lejár.
  await page.reload();
  await startGame(page);
  await openLock(page);
  await page.evaluate(() => (window as unknown as GameTestWindow).__websuliGame!.forceState({ runesLeft: 1, timeLeft: 1 }));
  await expect.poll(async () => (await probe(page)).phase, { timeout: 20_000 }).toBe("over");
});

test.describe("844x390 fekvő", () => {
  test.use({ viewport: { width: 844, height: 390 } });
  test("M4: fekvőben a rúnagombok a két oldalon, a jelenet közepét (érc, célkereszt) és a kérdéskártyát szabadon hagyják", async ({ page }) => {
    await startGame(page);
    await page.evaluate((quiz) => (window as unknown as GameTestWindow).__websuliGame!.forceState({ question: true, quiz }), LONGEST_RUNE_QUIZ);
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
