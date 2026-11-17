import { expect, test, type Page } from "@playwright/test";

import { WORD_LADDER_EN } from "../client/src/data/wordLadder/en";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { canGameCloze } from "../client/src/game-engine/vocab/questionGenerator";

/**
 * Szólétra olvashatóság (docs/specs/2026-11-17-szoletra-olvashatosag.md SZ-2, SZ-4, SZ-5; átmeneti kapu 3(a), 3(c)) —
 * böngészőben, a CI-azonos úton (buildelt szerver, szoftveres WebGL, egy worker).
 *
 * - SZ-2: az óra csak ≥ 400 ms előjelzés után indul, a fogások addig nem élesek; az előjelzés alatti 1–4 billentyű nem
 *   válasz. A mérés a lapon belül, képkockánként (C-65), nem Playwright-oldali várakozással.
 * - SZ-5: a célkártya a keretszöveg ≥ 1,6-szeres betűjével, ≥ 3:1 kontraszttal (WCAG AA nagy szöveg), kilógás és szó
 *   közbeni törés nélkül — mindhárom nézetben, a kézi bank és a szóbank LEGHOSSZABB célszavaival és a hiányos mondattal. A
 *   tételek a valódi kérdés-úton jönnek (`?wlItems=`, csak teszt-kampós buildben); a leghosszabbakat a spec a bankfájlokból
 *   keresi ki.
 * - SZ-4: a tempó-választó működik, és újratöltés után megmarad.
 */

test.use({ serviceWorkers: "block", hasTouch: true });

const VIEWS = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const;

type Probe = Record<string, number | string | null>;
type Api = { forceState: (p: object) => void; probe: () => Probe };

async function stub(page: Page, grade = "4") {
  await page.addInitScript((g) => {
    localStorage.setItem("websuli.classroomGrade", g);
  }, grade);
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (p === "/api/auth/user") data = null;
    if (p.includes("quiz-bank") || p.includes("material-quizzes")) data = { items: [], materials: [] };
    if (p.includes("sync-eligibility")) data = { eligible: false };
    await route.fulfill({ json: data });
  });
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as { __websuliGame: Api }).__websuliGame.probe());

/** A leghosszabb célrészek a bankokból (programmal kikeresve): kézi bank (a leghosszabb szó és a leghosszabb kifejezés),
 *  szóbank típusonként (magyar → angol, angol → magyar, hiányos mondat, mondat-jelentés). */
function longestItems(): string[] {
  const longestWord = (s: string) => Math.max(...s.split(/\s+/u).map((w) => w.length));
  const manual = WORD_LADDER_EN.filter((i) => i.focus);
  const byWord = [...manual].sort((a, b) => longestWord(b.focus!) - longestWord(a.focus!))[0]!;
  const byLen = [...manual].sort((a, b) => b.focus!.length - a.focus!.length)[0]!;
  const manualCloze = [...manual].filter((i) => /_{3,}/u.test(i.focus!)).sort((a, b) => b.focus!.length - a.focus!.length)[0]!;
  const pick = (score: (e: (typeof VOCAB_EN)[number]) => number, n = 3, filter: (e: (typeof VOCAB_EN)[number]) => boolean = () => true) =>
    [...VOCAB_EN].filter(filter).sort((a, b) => score(b) - score(a)).slice(0, n);
  const ids = [byWord.id, byLen.id, manualCloze.id];
  for (const e of pick((e) => longestWord(e.hu) * 100 + e.hu.length)) ids.push(`vocab:${e.id}:hu-to-target`);
  for (const e of pick((e) => longestWord(e.term) * 100 + e.term.length)) ids.push(`vocab:${e.id}:target-to-hu`);
  for (const e of pick((e) => e.example.length, 3, (e) => canGameCloze(e))) ids.push(`vocab:${e.id}:cloze`);
  for (const e of pick((e) => e.example.length, 3, (e) => e.kind === "phrase")) ids.push(`vocab:${e.id}:phrase-meaning`);
  return [...new Set(ids)];
}

/** A célkártya mérése a lapon belül: betűarány, kontraszt, kilógás, szó közbeni törés. */
const measureFocus = (page: Page) =>
  page.evaluate(() => {
    const focus = document.querySelector<HTMLElement>('[data-testid="wl-prompt-focus"]');
    if (!focus) return null;
    const frame = document.querySelector<HTMLElement>('[data-testid="wl-prompt-frame"]');
    const card = focus.closest<HTMLElement>(".play-question-card")!;
    const fs = parseFloat(getComputedStyle(focus).fontSize);
    // A keretsor betűmérete (ha nincs keretsor — játék-alakú hiányos mondat —, ugyanaz a stílus egy próbaelemen).
    let frameFs: number;
    if (frame) frameFs = parseFloat(getComputedStyle(frame).fontSize);
    else {
      const probeEl = document.createElement("span");
      probeEl.className = "play-question-frame";
      focus.parentElement!.appendChild(probeEl);
      frameFs = parseFloat(getComputedStyle(probeEl).fontSize);
      probeEl.remove();
    }
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const L1 = lum(rgb(getComputedStyle(focus).color));
    const L2 = lum(rgb(getComputedStyle(focus).backgroundColor));
    const contrast = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const fr = focus.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const overflow = focus.scrollWidth > focus.clientWidth + 1 || fr.right > cr.right + 1 || fr.left < cr.left - 1 || fr.right > window.innerWidth || fr.bottom > window.innerHeight;
    // Szó közbeni törés: egy szó (a szöveg-csomópontokon belül) több sorra eső téglalapokat kap.
    const broken: string[] = [];
    const walker = document.createTreeWalker(focus, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      const re = /\S+/gu;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const r = document.createRange();
        r.setStart(n, m.index);
        r.setEnd(n, m.index + m[0].length);
        const tops = new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top)));
        if (tops.size > 1) broken.push(m[0]);
      }
    }
    const blank = focus.querySelector<HTMLElement>('[data-testid="play-question-blank"]');
    return {
      text: focus.innerText,
      kind: focus.dataset.kind ?? "",
      fs,
      frameFs,
      contrast,
      overflow,
      broken,
      blank: blank ? { w: blank.getBoundingClientRect().width, border: parseFloat(getComputedStyle(blank).borderTopWidth) } : null,
    };
  });

for (const vp of VIEWS) {
  test(`SZ-5 célkártya @ ${vp.width}x${vp.height}: ≥ 1,6× betű, kontraszt, nincs kilógás, nincs szó közbeni törés — a leghosszabb célszavakkal`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(vp);
    await stub(page);
    const ids = longestItems();
    await page.goto(`/games/word-ladder-hu-en?seed=11&wall=60&wlItems=${encodeURIComponent(ids.join(","))}`);
    await page.getByTestId("wl-start").click();
    const seen = new Map<string, NonNullable<Awaited<ReturnType<typeof measureFocus>>>>();
    let lastId: string | number | null = null;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline && seen.size < ids.length) {
      const p = await probe(page);
      if (p.questionOpen === 1 && p.questionId !== lastId && p.reveal === 0) {
        // Az élesítésig várunk (a fogás addig nem számít), a mérés a kész elrendezésen.
        await expect.poll(async () => Number((await probe(page)).clock) >= Number((await probe(page)).armedAt), { timeout: 5_000 }).toBe(true);
        const m = await measureFocus(page);
        lastId = p.questionId;
        if (m) seen.set(m.text, m);
        const right = page.locator('[data-testid^="wl-option-"][data-correct="true"]:not([disabled])').first();
        await right.click({ timeout: 3_000 }).catch(() => undefined);
      }
      await page.waitForTimeout(150);
      // A tesztlista elfogyott: a többi kérdés már a szokásos forrásból jön.
      if (Number(p.questionsAnswered) > ids.length + 4) break;
    }
    const all = [...seen.values()];
    expect(all.length, `mért célkártyák: ${all.map((m) => m.text).join(" | ")}`).toBeGreaterThanOrEqual(ids.length - 3);
    expect(all.some((m) => m.blank), "hiányos mondatos típus is mérve").toBe(true);
    for (const m of all) {
      expect(m.fs / m.frameFs, `${m.text}: betűarány ${m.fs}/${m.frameFs}`).toBeGreaterThanOrEqual(1.6);
      expect(m.contrast, `${m.text}: kontraszt`).toBeGreaterThanOrEqual(3);
      expect(m.overflow, `${m.text}: kilóg`).toBe(false);
      expect(m.broken, `${m.text}: szó közben tör`).toEqual([]);
      if (m.blank) {
        expect(m.blank.w, "a hiány helye látható szélességű").toBeGreaterThanOrEqual(24);
        expect(m.blank.border, "a hiány vastag kerettel jelölt").toBeGreaterThanOrEqual(2);
      }
    }
  });
}

test("SZ-2 / kapu 3(a): az óra csak ≥ 400 ms előjelzés után indul, a fogások addig nem élesek, az előjelzés alatti billentyű nem válasz", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto("/games/word-ladder-hu-en?seed=5&wall=60");
  await page.getByTestId("wl-start").click();
  // Lapon belül, képkockánként: a következő ÚJ kérdés megjelenésétől mérjük az élesítést és az óra indulását.
  const r = await page.evaluate(
    () =>
      new Promise<{ armedMs: number; timerMs: number; earlyKeyClock: number; armedAt: number; answeredAfterKey: number; sameQuestion: boolean }>((resolve, reject) => {
        const api = (window as unknown as { __websuliGame: Api }).__websuliGame;
        const startId = api.probe().questionId;
        let shownAt = -1;
        let qid: string | number | null = null;
        let armedMs = -1;
        let timerMs = -1;
        let earlyKeyClock = -1;
        let answeredAfterKey = -1;
        let sameQuestion = false;
        const t0 = performance.now();
        const tick = () => {
          const now = performance.now();
          if (now - t0 > 60_000) return reject(new Error("nincs új kérdés"));
          const root = document.querySelector<HTMLElement>('[data-testid="wl-question"][data-state="open"]');
          const id = root?.dataset.questionId ?? null;
          if (shownAt < 0 && id && id !== String(startId ?? "") && document.querySelectorAll('[data-testid^="wl-option-"]').length === 4) {
            shownAt = now;
            qid = id;
            // Azonnali (olvasás nélküli) „1” billentyű az előjelzés alatt.
            const before = Number(api.probe().questionsAnswered);
            earlyKeyClock = Number(api.probe().clock);
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
            setTimeout(() => {
              answeredAfterKey = Number(api.probe().questionsAnswered) - before;
              sameQuestion = String(api.probe().questionId) === qid;
            }, 120);
          }
          if (shownAt >= 0) {
            const enabled = document.querySelectorAll('[data-testid^="wl-option-"]:not([disabled])').length;
            if (armedMs < 0 && enabled > 0) armedMs = now - shownAt;
            const fill = document.querySelector<HTMLElement>(".play-question-timer-fill");
            const m = /scaleX\(([\d.]+)\)/u.exec(fill?.style.transform ?? "");
            if (timerMs < 0 && m && Number(m[1]) < 0.999) timerMs = now - shownAt;
            if (armedMs >= 0 && timerMs >= 0 && answeredAfterKey >= 0) {
              return resolve({ armedMs, timerMs, earlyKeyClock, armedAt: Number(api.probe().armedAt), answeredAfterKey, sameQuestion });
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(r.earlyKeyClock, "a billentyű az élesítés előtt ment").toBeLessThan(r.armedAt);
  expect(r.answeredAfterKey, "az előjelzés alatti billentyű nem válasz").toBe(0);
  expect(r.sameQuestion, "a kérdés nyitva maradt").toBe(true);
  expect(r.armedMs, `a fogások ${r.armedMs.toFixed(0)} ms után élesek`).toBeGreaterThanOrEqual(400);
  expect(r.timerMs, `az óra ${r.timerMs.toFixed(0)} ms után indul`).toBeGreaterThanOrEqual(400);
});

test("SZ-4: a tempó-választó működik (kezdőképernyő és szünet menü), és újratöltés után megmarad; alapérték Nyugodt", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await stub(page);
  await page.goto("/games/word-ladder-hu-en");
  const openSettings = async () => {
    if ((await page.locator("details.game-start-settings[open]").count()) === 0) await page.locator("details.game-start-settings > summary").click();
  };
  await expect(page.getByTestId("wl-menu-info")).toContainText("Tempó: Nyugodt");
  await openSettings();
  await expect(page.getByTestId("wl-tempo-calm")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("wl-tempo-normal").click();
  await expect(page.getByTestId("wl-tempo-normal")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("wl-tempo-calm")).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(page.getByTestId("wl-menu-info")).toContainText("Tempó: Normál");
  await openSettings();
  await expect(page.getByTestId("wl-tempo-normal")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("wl-start").click();
  await expect.poll(async () => (await probe(page)).tempo).toBe("normal");
  // Szünet menüben is váltható; a következő menet már az új tempóval indul.
  await page.keyboard.press("p");
  await expect(page.getByTestId("wl-tempo-picker")).toBeVisible();
  await page.getByTestId("wl-tempo-fast").click();
  await expect(page.getByTestId("wl-tempo-fast")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("websuli.wordladder.tempo"))).toBe("fast");
  await page.evaluate(() => (window as unknown as { __websuliGame: Api }).__websuliGame.forceState({ phase: "play" }));
  await expect.poll(async () => (await probe(page)).tempo).toBe("fast");
});
