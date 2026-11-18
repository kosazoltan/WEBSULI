/**
 * Kanban #101 (S1, T1) — az `isPlayableQuestion` eredmény-gyorsítótára (spec: docs/specs/2026-11-17-kerdesbank-karcsusitas.md 10.1).
 * Mérce: (a) a gyorsítótárazott eredmény azonos a gyorsítótár nélkülivel; (b) a második szűrés ugyanazon objektumokon töredékidő;
 * (c) helyben módosított tétel újra kiértékelődik (őr); (d) azonos tartalmú új objektum saját kiértékelést kap.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePlayable, isPlayableQuestion } from "../shared/game-quiz-contract";

type Item = { id: string; prompt: string; options: string[]; correctIndex: number };

/** Determinisztikus, vegyes minta: játszható, rossz index, kevés / ismétlődő opció, üres prompt, egyenlőség-feladat. */
function sample(n: number): Item[] {
  let s = 12345;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const out: Item[] = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rnd() * 500);
    const base: Item = { id: `q${i}`, prompt: `Melyik szó jelenti azt, hogy ${k}. kérdés?`, options: [`alma${k}`, `körte${k}`, `szilva${k}`, `barack${k}`], correctIndex: Math.floor(rnd() * 4) };
    const r = rnd();
    if (r < 0.1) out.push({ ...base, correctIndex: 7 });
    else if (r < 0.2) out.push({ ...base, options: base.options.slice(0, 2) });
    else if (r < 0.3) out.push({ ...base, options: [base.options[0]!, base.options[0]!, base.options[1]!] });
    else if (r < 0.35) out.push({ ...base, prompt: "  " });
    else if (r < 0.45) out.push({ ...base, prompt: `Mennyi ${k} + 1?`, options: [String(k + 1), String(k + 2), String(k + 3)], correctIndex: 0 });
    else if (r < 0.5) out.push({ ...base, prompt: `Mennyi ${k} + 1?`, options: [String(k + 1), String(k + 2), String(k + 3)], correctIndex: 1 });
    else out.push(base);
  }
  return out;
}

test("(a) a gyorsítótárazott eredmény azonos a gyorsítótár nélkülivel, első és második szűrésben is", () => {
  const items = sample(3000);
  const expected = items.map((q) => evaluatePlayable(q));
  assert.deepEqual(items.map((q) => isPlayableQuestion(q)), expected, "első szűrés");
  assert.deepEqual(items.map((q) => isPlayableQuestion(q)), expected, "második szűrés (gyorsítótárból)");
  const kept = expected.filter(Boolean).length;
  assert.ok(kept > 500 && kept < items.length, `vegyes minta: ${kept}/${items.length}`);
  // Nem objektum: változatlanul hamis.
  for (const v of [null, undefined, 0, "", "x", 42]) assert.equal(isPlayableQuestion(v), false);
});

test("(b) a második szűrés ugyanazon objektumokon az első töredéke (< 5 %)", () => {
  const items = sample(6000);
  const t0 = performance.now();
  items.filter(isPlayableQuestion);
  const first = performance.now() - t0;
  // A legjobb a három ismételt szűrésből — egy véletlen GC-szünet ne buktassa a laza küszöböt.
  let second = Infinity;
  for (let r = 0; r < 3; r++) {
    const t1 = performance.now();
    items.filter(isPlayableQuestion);
    second = Math.min(second, performance.now() - t1);
  }
  assert.ok(second < first * 0.05, `első ${first.toFixed(1)} ms, második ${second.toFixed(1)} ms`);
});

test("(c) őr: a helyben módosított prompt / options / correctIndex újra kiértékelődik", () => {
  const q: Item = { id: "m1", prompt: "Melyik a fővárosunk?", options: ["Budapest", "Bécs", "Prága", "Pozsony"], correctIndex: 0 };
  assert.equal(isPlayableQuestion(q), true);
  q.correctIndex = 9;
  assert.equal(isPlayableQuestion(q), false, "correctIndex");
  q.correctIndex = 0;
  assert.equal(isPlayableQuestion(q), true, "vissza");
  q.prompt = " ";
  assert.equal(isPlayableQuestion(q), false, "prompt");
  q.prompt = "Melyik a fővárosunk?";
  q.options = ["Budapest", "Budapest", "Prága", "Pozsony"];
  assert.equal(isPlayableQuestion(q), false, "options-csere");
  q.options = ["Budapest", "Bécs", "Prága", "Pozsony"];
  assert.equal(isPlayableQuestion(q), true);
  q.options.pop();
  q.options.pop();
  assert.equal(isPlayableQuestion(q), false, "options hossza helyben változott");
});

test("(d) azonos tartalmú új objektum saját kiértékelést kap (a kulcs az objektum)", () => {
  const a: Item = { id: "d1", prompt: "Melyik szám páros?", options: ["3", "4", "5"], correctIndex: 1 };
  const b: Item = { ...a, options: [...a.options], correctIndex: 0 };
  assert.equal(isPlayableQuestion(a), evaluatePlayable(a));
  assert.equal(isPlayableQuestion(b), evaluatePlayable(b));
  assert.equal(isPlayableQuestion(a), evaluatePlayable(a));
});
