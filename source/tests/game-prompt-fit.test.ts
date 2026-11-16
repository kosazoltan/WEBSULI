import assert from "node:assert/strict";
import test from "node:test";

import { createRng } from "../shared/game-rng";
import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank";
import {
  LONG_PROMPT_CHARS,
  OPTION_MAX_LINES,
  PROMPT_MAX_LINES,
  PROMPT_VIEWPORTS,
  estimateLines,
  fitsAllViewports,
  fitsInline,
  optionColumns,
  promptLayout,
  readingMsFor,
} from "../client/src/game-engine/play/promptFit";
import { READING_WINDOW_CAP_MS } from "../client/src/game-engine/play/reading";
import { bankPlayQuestion, createQuestionDirector, windowMsFor, type DirectorConfig, type QuestionProvider } from "../client/src/game-engine/play/questionDirector";
import { createReviewQueue } from "../client/src/game-engine/play/reviewQueue";
import type { FourChoiceQuiz } from "../client/src/types/gameQuiz";

/**
 * J0c-b (kanban #46) — `fitsInline` / `fitsAllViewports`: befér-e a kérdés a sávba koppintás nélkül, elolvasható-e 9 mp
 * alatt; és a director additív `promptFits` (→ a forrás `accept`-je) és `readingAware` beállítása.
 */

const LONGEST_GRADE = "Egy Aa és egy aa genotípusú szülő utódainak várhatóan hány százaléka mutatja a domináns jelleget teljes dominancia esetén?";
const LONGEST_CLOZE =
  "Melyik illik a mondatba? The phone has a _____ lock that scans your fingerprint. (Magyarul: A telefonnak biometrikus zárja van, amely beolvassa az ujjlenyomatodat.)";
const LONGEST_OPTION = "a zsidóság és más üldözött csoportok náci Németország által szervezett tömeges kiirtását";

test("estimateLines: üres → 0, rövid → 1, szavanként tör, a doboznál hosszabb szó karakterenként", () => {
  assert.equal(estimateLines("", 300, 16), 0);
  assert.equal(estimateLines("Mennyi 7 × 8?", 300, 16), 1);
  const many = estimateLines("alma ".repeat(40), 300, 16);
  assert.ok(many >= 4, `${many}`);
  assert.ok(estimateLines("x".repeat(200), 100, 16) >= 10);
  // monoton: keskenyebb doboz → legalább annyi sor
  assert.ok(estimateLines(LONGEST_GRADE, 200, 16) >= estimateLines(LONGEST_GRADE, 320, 16));
});

test("promptLayout: a CSS tükre (álló 360: 16,56 px / hosszúnál 15 px; fekvő 844×390: 40vw-os kártya)", () => {
  const short = promptLayout({ width: 360, height: 640 }, 20);
  assert.equal(Math.round(short.fontPx * 100) / 100, 16.56);
  assert.equal(short.textWidthPx, 344 - 27);
  assert.equal(promptLayout({ width: 360, height: 640 }, LONG_PROMPT_CHARS + 1).fontPx, 15);
  const land = promptLayout({ width: 844, height: 390 }, 20);
  assert.equal(Math.round(land.textWidthPx * 10) / 10, Math.round((0.4 * 844 - 27) * 10) / 10);
  assert.equal(promptLayout({ width: 844, height: 390 }, 100).fontPx, 15);
});

test("a bankok leghosszabb promptja (122 karakter, évfolyam-bank) mindhárom nézetben kibontás nélkül befér (≤ 5 sor)", () => {
  for (const vp of PROMPT_VIEWPORTS) {
    const f = fitsInline(LONGEST_GRADE, vp, { grade: 11, options: ["25%", "75%", "50%", "100%"] });
    assert.ok(f.fits, `${vp.width}×${vp.height}: ${f.lines} sor`);
    assert.ok(f.lines <= PROMPT_MAX_LINES);
    assert.equal(f.readable, true, `${f.readingMs} ms`);
    assert.equal(f.ok, true);
  }
});

test("a leghosszabb cloze (164 kar.) befér, de 9 mp alatt nem olvasható → nem ok (a forrás hátrébb sorolja)", () => {
  const f = fitsAllViewports({ prompt: LONGEST_CLOZE, options: ["biometric", "mortified", "prompt", "redundant"] }, { grade: null });
  assert.equal(f.fits, true);
  assert.equal(f.readable, false);
  assert.ok(f.readingMs > READING_WINDOW_CAP_MS);
  assert.equal(f.ok, false);
});

test("a 88 karakteres opció 2 sorban nem fér → optionsFit false; a rövid opciók igen", () => {
  const f = fitsAllViewports({ prompt: "Mi a holokauszt?", options: [LONGEST_OPTION, "x", "y", "z"] }, { grade: 8 });
  assert.equal(f.optionsFit, false);
  assert.ok(f.optionLines > OPTION_MAX_LINES);
  assert.equal(f.ok, false);
  assert.equal(fitsAllViewports({ prompt: "Mennyi 7 × 8?", options: ["56", "54", "63", "48"] }, { grade: 3 }).ok, true);
});

test("optionColumns: álló nézetben 2 oszlop rövid feliratnál, 1 oszlop, ha valamelyik 2 sornál hosszabb lenne", () => {
  const vp = { width: 360, height: 640 };
  assert.equal(optionColumns(["56", "54", "63", "48"], vp), 2);
  assert.equal(optionColumns(["fényenergiát köt meg cukorban", "a", "b", "c"], vp), 1);
});

test("readingMsFor: évfolyamfüggő (3. lassabb, mint 9.), döntési idővel; a szavak és az opciók fél súllyal", () => {
  const p = "Melyik gáz szabadul fel a fotoszintézis során a levegőbe?";
  assert.ok(readingMsFor(p, [], 3) > readingMsFor(p, [], 9));
  assert.ok(readingMsFor(p, ["oxigén", "nitrogén"], 5) > readingMsFor(p, [], 5));
  assert.equal(readingMsFor("", [], 5), 1500);
});

test("mérés: az évfolyam-bank promptjainak ≥ 99%-a mindhárom nézetben kibontás nélkül befér (≤ 5 sor)", () => {
  const fits = GRADE_QUIZ_ITEMS.filter((i) => PROMPT_VIEWPORTS.every((vp) => fitsInline(i.prompt, vp, { grade: i.grade }).fits)).length;
  assert.ok(fits / GRADE_QUIZ_ITEMS.length >= 0.99, `${fits}/${GRADE_QUIZ_ITEMS.length}`);
});

/* ------------------------------ director: promptFits → accept, readingAware ------------------------------ */

const BASE: DirectorConfig = {
  gameId: "speed-quiz-math", optionCount: 4, minGapMs: 1500, maxGapMs: 6000, targetPerMin: 9, baseWindowMs: 4000, slowMo: 0.5, grade: 3, warmupMs: 0,
};

function quiz(id: string, prompt: string): FourChoiceQuiz {
  return { id, prompt, options: ["egy", "kettő", "három", "négy"], correctIndex: 0 };
}

test("director: a promptFits accept-ként jut el a forrás material() és fresh() hívásához; nélküle nincs accept", () => {
  const seen: Array<{ kind: string; hasAccept: boolean }> = [];
  const provider: QuestionProvider = {
    couponOnly: false,
    material: (ctx) => {
      seen.push({ kind: "material", hasAccept: typeof ctx?.accept === "function" });
      return null;
    },
    fresh: (ctx) => {
      seen.push({ kind: "fresh", hasAccept: typeof ctx.accept === "function" });
      return bankPlayQuestion("speed-quiz-math", quiz("a", "Mennyi 1 + 1?"));
    },
    restore: () => null,
  };
  const fitsCalls: string[] = [];
  const d = createQuestionDirector({ config: { ...BASE, promptFits: (q) => (fitsCalls.push(q.prompt), true) }, provider, review: createReviewQueue(null), rng: createRng(1), startBand: 0.5, now: () => 0 });
  d.request("trigger", 0);
  assert.ok(seen.some((s) => s.kind === "material" && s.hasAccept));
  assert.ok(seen.some((s) => s.kind === "fresh" && s.hasAccept));
  seen.length = 0;
  const d2 = createQuestionDirector({ config: BASE, provider, review: createReviewQueue(null), rng: createRng(1), startBand: 0.5, now: () => 0 });
  d2.request("trigger", 0);
  assert.ok(seen.every((s) => !s.hasAccept));
});

test("director readingAware: az ablak = min(9000, max(windowMsFor, olvasási idő)); nélküle a régi windowMsFor", () => {
  const long = "Egy kertben nyolc almafa áll, mindegyiken tizenkét alma terem; a gyerekek a felét leszedik és elviszik a piacra eladni.";
  const provider: QuestionProvider = { couponOnly: false, material: () => null, restore: () => null, fresh: () => bankPlayQuestion("speed-quiz-math", quiz("l", long)) };
  const plain = createQuestionDirector({ config: BASE, provider, review: createReviewQueue(null), rng: createRng(2), startBand: 0.5, now: () => 0 }).request("trigger", 0)!;
  assert.equal(plain.windowMs, windowMsFor(long, 3, 4000));
  const aware = createQuestionDirector({ config: { ...BASE, readingAware: true }, provider, review: createReviewQueue(null), rng: createRng(2), startBand: 0.5, now: () => 0 }).request("trigger", 0)!;
  const read = readingMsFor(long, aware.options.map((o) => o.label), 3);
  assert.equal(aware.windowMs, Math.min(9000, Math.max(plain.windowMs, read)));
  assert.ok(aware.windowMs >= plain.windowMs);
  assert.ok(aware.windowMs <= 9000);
});
