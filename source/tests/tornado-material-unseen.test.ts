import assert from "node:assert/strict";
import test from "node:test";

import { createGradeQuizSeen, markGradeQuizSeen } from "../client/src/game-engine/gradeQuiz";
import {
  isVocabQuestion,
  makeRng,
  pickQuestion,
  vocabToQuestion,
  type PickArgs,
  type Question,
  type TornadoVocab,
} from "../client/src/lib/tornado/questions";

/**
 * S13 / átfogó review H1 (terv 4.4 „tananyag-elsőbbség”, A8): a Tornado a NEM LÁTOTT tananyag-kérdést teszi előre,
 * utána a szóbankot — mint a többi játék `pickUnseenMaterial`-ja. Korábban a teljes tananyag-lista ürességét nézte,
 * így tananyag mellett a szóbank sosem kérdezett, és a ≤ 3 tananyag-kérdés ismétlődött a futás végéig.
 * A szimuláció a lap `raiseQuiz`-ét követi: a recent-ablak az utolsó 9 azonosító, minden kérdés látottnak jelölődik.
 */

function vocabStub(): TornadoVocab & { calls: number } {
  const stub = {
    calls: 0,
    next(): Question | null {
      stub.calls += 1;
      return vocabToQuestion(
        {
          id: `vocab:en1-animals-${String(stub.calls).padStart(3, "0")}:hu-to-target`,
          prompt: `Mi angolul: állat ${stub.calls}?`,
          options: ["cat", "dog", "cow", "pig"],
          correctIndex: 0,
          explanation: "A „cat” jelentése macska: The cat sleeps. – A macska alszik.",
          level: 1,
        },
        4,
      );
    },
  };
  return stub;
}

const mat = (id: string, subject: "english" | "math"): Question => ({
  id,
  subject,
  grade: 4,
  prompt: `Tananyag ${id}`,
  options: ["a", "b", "c", "d"],
  correctIndex: 0,
  difficulty: 3,
  source: "material",
});

/** A lap `raiseQuiz`-ének húzás-ciklusa (recent: utolsó 9, gradeSeen: a futás összes kérdése). */
function simulate(n: number, base: Omit<PickArgs, "recent" | "gradeSeen" | "rng">, seed = 7): Question[] {
  const rng = makeRng(seed);
  const gradeSeen = createGradeQuizSeen();
  let recent: string[] = [];
  const out: Question[] = [];
  for (let i = 0; i < n; i++) {
    const q = pickQuestion({ ...base, recent, gradeSeen, rng });
    recent = [...recent.slice(-8), q.id];
    markGradeQuizSeen(gradeSeen, q);
    out.push(q);
  }
  return out;
}

test("angol mód, 2 angol tananyag-tétel, 20 húzás: a tananyag egyszer-egyszer (elöl), utána csak szóbank", () => {
  const vocab = vocabStub();
  const qs = simulate(20, { level: 30, school: 4, mode: "english", material: [mat("mat-1", "english"), mat("mat-2", "english")], vocab });
  // a tananyag-elsőbbség: az első két húzás a két tananyag-tétel (sorrendtől függetlenül)
  assert.deepEqual(qs.slice(0, 2).map((q) => q.id).sort(), ["mat-1", "mat-2"]);
  // mindegyik pontosan egyszer
  assert.equal(qs.filter((q) => q.id === "mat-1").length, 1);
  assert.equal(qs.filter((q) => q.id === "mat-2").length, 1);
  // a maradék 18 húzás a szóbankból jön (angol hely, a csonk sosem fogy ki)
  assert.equal(qs.slice(2).filter((q) => isVocabQuestion(q)).length, 18);
  assert.equal(vocab.calls, 18);
});

test("a review forgatókönyve: vegyes mód, 1 matek tananyag-tétel, 30 húzás → legfeljebb 1 tananyag-kérdés, a szóbank kérdez", () => {
  const vocab = vocabStub();
  const qs = simulate(30, { level: 30, school: 4, mode: "mixed", material: [mat("mat-1", "math")], vocab });
  assert.ok(qs.filter((q) => q.id === "mat-1").length <= 1, "a tananyag-kérdés ismétlődik");
  assert.ok(vocab.calls > 0, "a szóbank egyszer sem kérdezett");
  assert.ok(qs.some((q) => isVocabQuestion(q)));
});

test("látott tananyag (recent-ben) mellett az angol hely a szóbankból jön", () => {
  const vocab = vocabStub();
  const q = pickQuestion({ level: 30, school: 4, mode: "english", material: [mat("mat-1", "english")], recent: ["mat-1"], vocab, rng: makeRng(1) });
  assert.ok(isVocabQuestion(q));
  assert.equal(vocab.calls, 1);
});

test("kuponos futás (materialOnly): a tananyag ismétlődik, a szóbank nem kérdez (a lecke anyaga a futás célja)", () => {
  const vocab = vocabStub();
  const qs = simulate(10, { level: 30, school: 4, mode: "mixed", material: [mat("mat-1", "english")], vocab, materialOnly: true });
  assert.ok(qs.every((q) => q.id === "mat-1"));
  assert.equal(vocab.calls, 0);
});
