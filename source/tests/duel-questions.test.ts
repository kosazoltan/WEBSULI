import assert from "node:assert/strict";
import test from "node:test";

import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank";
import { tierForBand } from "../client/src/game-engine/gradeQuiz";
import { windowMsFor } from "../client/src/game-engine/play/questionDirector";
import {
  DUEL_MAX_PROMPT_CHARS,
  buildRoundQuestion,
  fitsDuelScreen,
  duelPromptKey,
  duelTierForBand,
  markDuelQuestionUsed,
  toDuelQuestion,
  type DuelQuestion,
} from "../shared/duel/questions";

/**
 * JM1 3. lépés — a párbaj kérdéssora (végrehajtás JM-K `questions.ts`; terv 10.5 „Vegyes évfolyam”).
 * A valódi évfolyam-bankkal (`GRADE_QUIZ_ITEMS`) és a J0b `windowMsFor` szabályával (U-JM1-1: paraméterként).
 */

const BASE = 6000;
const rule = (prompt: string, grade: number) => windowMsFor(prompt, grade, BASE);
const byId = new Map(GRADE_QUIZ_ITEMS.map((q) => [q.id, q]));

function series(seed: string, grade: number, band: number, rounds: number, subjects?: string[]): DuelQuestion[] {
  const used = new Set<string>();
  const out: DuelQuestion[] = [];
  for (let r = 1; r <= rounds; r++) {
    const q = buildRoundQuestion({ seed, round: r, grade, band, used, items: GRADE_QUIZ_ITEMS, windowMs: rule, subjects });
    assert.ok(q, `kör ${r}`);
    markDuelQuestionUsed(used, q);
    out.push(q);
  }
  return out;
}

test("a sáv → tier küszöb azonos a közös gradeQuiz-zal", () => {
  for (const b of [-1, 0, 0.2, 0.39, 0.4, 0.55, 0.69, 0.7, 0.9, 1, Number.NaN]) assert.equal(duelTierForBand(b), tierForBand(b), String(b));
});

test("vegyes évfolyam: 4. és 7. évfolyamos ugyanabban a körben a SAJÁT évfolyamából, ugyanabból a tierből kap tételt", () => {
  for (const band of [0.2, 0.55, 0.85]) {
    const tier = duelTierForBand(band);
    for (let r = 1; r <= 9; r++) {
      const usedA = new Set<string>();
      const usedB = new Set<string>();
      const a = buildRoundQuestion({ seed: "vegyes", round: r, grade: 4, band, used: usedA, items: GRADE_QUIZ_ITEMS, windowMs: rule })!;
      const b = buildRoundQuestion({ seed: "vegyes", round: r, grade: 7, band, used: usedB, items: GRADE_QUIZ_ITEMS, windowMs: rule })!;
      assert.equal(byId.get(a.key)!.grade, 4);
      assert.equal(byId.get(b.key)!.grade, 7);
      assert.equal(byId.get(a.key)!.tier, tier);
      assert.equal(byId.get(b.key)!.tier, tier);
      assert.equal(a.grade, 4);
      assert.equal(b.grade, 7);
    }
  }
});

test("saját válaszablak: a J0b szabálya (3–4. évf. ×1,25), mindig ≤ 9000 ms", () => {
  for (const q of [...series("ablak", 3, 0.5, 9), ...series("ablak", 12, 0.5, 9)]) {
    assert.equal(q.windowMs, windowMsFor(q.prompt, q.grade, BASE));
    assert.ok(q.windowMs <= 9000 && q.windowMs >= 2500);
  }
  const young = series("ablak2", 4, 0.2, 3)[0]!;
  assert.ok(young.windowMs >= 7500, "a 4. évfolyam rövid kérdésnél is ≥ 7,5 s");
});

test("ugyanaz a seed → ugyanaz a sorozat; más seed → más sorozat", () => {
  const a = series("seed-1", 6, 0.5, 9);
  const b = series("seed-1", 6, 0.5, 9);
  assert.deepEqual(a, b);
  const c = series("seed-2", 6, 0.5, 9);
  assert.notDeepEqual(a.map((q) => q.key), c.map((q) => q.key));
});

test("nincs ismétlés a meccsen belül (7 + 2 kör), tétel-azonosító és prompt szerint sem", () => {
  for (const grade of [3, 5, 8, 12]) {
    for (const subjects of [undefined, ["math"], ["english"]]) {
      const qs = series(`ism-${grade}`, grade, 0.5, 9, subjects);
      assert.equal(new Set(qs.map((q) => q.key)).size, 9);
      assert.equal(new Set(qs.map((q) => duelPromptKey(q.prompt))).size, 9);
      if (subjects) for (const q of qs) assert.equal(byId.get(q.key)!.subject, subjects[0]);
    }
  }
});

test("az opciók seedelten keverve, a helyes index a keveréssel együtt mozog; a bank tétele érintetlen", () => {
  const qs = series("opciok", 7, 0.5, 9);
  const positions = new Set<number>();
  for (const q of qs) {
    const item = byId.get(q.key)!;
    assert.equal(q.options[q.correctIndex], item.options[item.correctIndex]);
    assert.deepEqual([...q.options].sort(), [...item.options].sort());
    positions.add(q.correctIndex);
  }
  assert.ok(positions.size >= 2, "nem mindig ugyanazon a helyen a helyes válasz");
});

test("évfolyam a bankon kívül → null; elfogyott bank → null; a used nem módosul", () => {
  const used = new Set<string>();
  assert.equal(buildRoundQuestion({ seed: "x", round: 1, grade: 2, band: 0.5, used, items: GRADE_QUIZ_ITEMS, windowMs: rule }), null);
  assert.equal(buildRoundQuestion({ seed: "x", round: 1, grade: 13, band: 0.5, used, items: GRADE_QUIZ_ITEMS, windowMs: rule }), null);
  const all = new Set<string>(GRADE_QUIZ_ITEMS.map((q) => q.id));
  assert.equal(buildRoundQuestion({ seed: "x", round: 1, grade: 5, band: 0.5, used: all, items: GRADE_QUIZ_ITEMS, windowMs: rule }), null);
  const before = new Set(used);
  buildRoundQuestion({ seed: "x", round: 1, grade: 5, band: 0.5, used, items: GRADE_QUIZ_ITEMS, windowMs: rule });
  assert.deepEqual(used, before);
});

test("visszavágó: a used a meccsek között megmarad → a második meccs új kérdéseket kap", () => {
  const used = new Set<string>();
  const keys: string[] = [];
  for (const seed of ["meccs-1", "meccs-2"]) {
    for (let r = 1; r <= 7; r++) {
      const q = buildRoundQuestion({ seed, round: r, grade: 6, band: 0.5, used, items: GRADE_QUIZ_ITEMS, windowMs: rule, subjects: ["math"] })!;
      markDuelQuestionUsed(used, q);
      keys.push(q.key);
    }
  }
  assert.equal(new Set(keys).size, 14);
});

test("toDuelQuestion: hibás tétel → null; a magyarázat megmarad", () => {
  assert.equal(toDuelQuestion({ key: "k", prompt: "p", options: ["a"], correctIndex: 0 }, { grade: 5, orderSeed: "s", windowMs: 5000 }), null);
  assert.equal(toDuelQuestion({ key: "k", prompt: "p", options: ["a", "b"], correctIndex: 2 }, { grade: 5, orderSeed: "s", windowMs: 5000 }), null);
  const q = toDuelQuestion({ key: "k", prompt: "p", options: ["a", "b", "c"], correctIndex: 1, explanation: "mert" }, { grade: 5, orderSeed: "s", windowMs: 5000 })!;
  assert.equal(q.options[q.correctIndex], "b");
  assert.equal(q.explanation, "mert");
});

test("hossz-őr: a jelenlegi évfolyam-bankból egy tétel sem esik ki (a tantárgyak aránya nem torzul); a túl hosszút kihagyja", () => {
  const out = GRADE_QUIZ_ITEMS.filter((q) => !fitsDuelScreen(q));
  assert.deepEqual(out.map((q) => q.id), []);
  const long = { id: "x-long", grade: 5, subject: "math", tier: 1 as const, prompt: "a".repeat(DUEL_MAX_PROMPT_CHARS + 1), options: ["1", "2", "3", "4"], correctIndex: 0 };
  assert.equal(fitsDuelScreen(long), false);
  assert.equal(fitsDuelScreen({ prompt: "p", options: ["x".repeat(91), "b"] }), false);
  assert.equal(buildRoundQuestion({ seed: "s", round: 1, grade: 5, band: 0.1, used: new Set(), items: [long], windowMs: rule }), null);
});
