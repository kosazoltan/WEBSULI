/**
 * JM3a — közös e2e-segéd a párbajhoz (gépi ellenfél és online): valódi érintéses válasz, meccs végigjátszása,
 * mobil-mérés (M1–M3), a kérdéskártya DOM-mérése, képernyőkép (`DUEL_SHOT_DIR`, ha meg van adva).
 */
import { expect, test, type Page } from "@playwright/test";

import { GRADE_03 } from "../../client/src/data/gradeQuizBank/grade-03";
import { GRADE_04 } from "../../client/src/data/gradeQuizBank/grade-04";
import { GRADE_05 } from "../../client/src/data/gradeQuizBank/grade-05";
import { GRADE_06 } from "../../client/src/data/gradeQuizBank/grade-06";
import { GRADE_07 } from "../../client/src/data/gradeQuizBank/grade-07";
import { GRADE_08 } from "../../client/src/data/gradeQuizBank/grade-08";
import { GRADE_09 } from "../../client/src/data/gradeQuizBank/grade-09";
import { GRADE_10 } from "../../client/src/data/gradeQuizBank/grade-10";
import { GRADE_11 } from "../../client/src/data/gradeQuizBank/grade-11";
import { GRADE_12 } from "../../client/src/data/gradeQuizBank/grade-12";
import { measureOverflow, smallFonts, smallTargets } from "./game-mobile-quality";

type Probe = { screen: string; kind: string; conn: string; phase: string; round: number; code: string; players: number; answered: number; winners: number };

export async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => (window as unknown as { __websuliGame?: { probe: () => Probe } }).__websuliGame!.probe());
}

/** A bank két „leghosszabb” tétele: a leghosszabb kérdés és a leghosszabb válaszlista (a hossz-őr után). */
export function longestBankItems(): Array<{ prompt: string; options: string[]; correctIndex: number; explanation?: string }> {
  const all = [...GRADE_03, ...GRADE_04, ...GRADE_05, ...GRADE_06, ...GRADE_07, ...GRADE_08, ...GRADE_09, ...GRADE_10, ...GRADE_11, ...GRADE_12].filter(
    (q) => q.prompt.length <= 170 && q.options.every((o) => o.length <= 90) && q.options.reduce((n, o) => n + o.length, 0) <= 240,
  );
  const byPrompt = all.reduce((a, b) => (b.prompt.length > a.prompt.length ? b : a));
  const byOptions = all.reduce((a, b) => (b.options.join("").length > a.options.join("").length ? b : a));
  return [byPrompt, byOptions].map((q) => ({ prompt: q.prompt, options: [...q.options], correctIndex: q.correctIndex, explanation: q.explanation }));
}

/** Képernyőkép: a teszt kimenetébe, és ha a `DUEL_SHOT_DIR` meg van adva, oda is (JPEG). */
export async function shot(page: Page, name: string): Promise<void> {
  const vp = page.viewportSize();
  const file = `${name}-${vp?.width}x${vp?.height}.jpg`;
  await page.screenshot({ path: test.info().outputPath(file), type: "jpeg", quality: 70 });
  if (process.env.DUEL_SHOT_DIR) await page.screenshot({ path: `${process.env.DUEL_SHOT_DIR}/${file}`, type: "jpeg", quality: 70 });
}

/** M1–M3: nincs vízszintes görgetés, minden koppintási cél ≥ 48 px, minden szöveg ≥ 12 px. */
export async function assertMobileQuality(page: Page, label: string): Promise<void> {
  const o = await measureOverflow(page);
  expect(o.x, `${label}: vízszintes görgetés`).toBeLessThanOrEqual(0);
  expect(await smallTargets(page), `${label}: 48 px alatti cél`).toEqual([]);
  expect(await smallFonts(page), `${label}: 12 px alatti szöveg`).toEqual([]);
}

/** A kérdéskártya elfér: nincs belső túlcsordulás, a válaszgombok a nézetben, a prompt nem fedi a gombokat. */
export async function assertQuestionFits(page: Page, label: string): Promise<void> {
  const r = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-testid="duel-qcard"] .duel-stage')!;
    const prompt = document.querySelector<HTMLElement>('[data-testid="duel-prompt"]')!.getBoundingClientRect();
    const opts = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="duel-option-"]'));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      stageOverflow: stage.scrollHeight - stage.clientHeight,
      outside: opts.filter((o) => {
        const b = o.getBoundingClientRect();
        return b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1;
      }).length,
      clipped: opts.filter((o) => o.scrollWidth > o.clientWidth + 1 || o.scrollHeight > o.clientHeight + 1).length,
      overlap: opts.some((o) => o.getBoundingClientRect().top < prompt.bottom - 1),
      minH: Math.min(...opts.map((o) => o.getBoundingClientRect().height)),
      fit: document.querySelector<HTMLElement>('[data-testid="duel-qcard"]')!.dataset.fit,
    };
  });
  expect(r.stageOverflow, `${label}: a kártya túlcsordul (fit=${r.fit})`).toBeLessThanOrEqual(1);
  expect(r.outside, `${label}: válaszgomb a nézeten kívül`).toBe(0);
  expect(r.clipped, `${label}: levágott válaszszöveg`).toBe(0);
  expect(r.overlap, `${label}: a kérdés a gombokra lóg`).toBe(false);
  expect(r.minH, `${label}: gombmagasság`).toBeGreaterThanOrEqual(48);
}

/** Megvárja a következő nyitott kört (vagy az eredményt), és VALÓDI ÉRINTÉSSEL (tap) válaszol a megadott opcióval. */
export async function answerNextRound(page: Page, lastRound: number, option = 0, timeout = 30_000): Promise<number | "result"> {
  const handle = await page.waitForFunction(
    (last) => {
      if (document.querySelector('[data-testid="duel-result"]')) return "result";
      const p = (window as unknown as { __websuliGame?: { probe: () => { phase: string; round: number; answered: number } } }).__websuliGame?.probe();
      const btn = document.querySelector<HTMLButtonElement>('[data-testid="duel-option-0"]');
      if (p && p.phase === "round_open" && p.round > last && p.answered < 0 && btn && !btn.disabled) return p.round;
      return null;
    },
    lastRound,
    { timeout, polling: 100 },
  );
  const v = (await handle.jsonValue()) as number | "result";
  if (v === "result") return v;
  await page.getByTestId(`duel-option-${option}`).tap();
  return v;
}

/** Végigjátszik egy meccset érintéssel (minden körben a megadott opció) a győzteshirdetésig. */
export async function playToResult(page: Page, option = 0, onRound?: (round: number) => Promise<void>): Promise<number> {
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const r = await answerNextRound(page, last, option);
    if (r === "result") break;
    last = r;
    if (onRound) await onRound(r);
  }
  await expect(page.getByTestId("duel-result")).toBeVisible({ timeout: 30_000 });
  return last;
}
