import assert from "node:assert/strict";
import test from "node:test";

import type { GradeQuizItem } from "../client/src/data/gradeQuizBank/types";
import { createGradeQuizSeen, markGradeQuizSeen } from "../client/src/game-engine/gradeQuiz";
import {
  isVocabQuestion,
  makeRng,
  pickQuestion,
  vocabToQuestion,
  type Question,
  type TornadoVocab,
} from "../client/src/lib/tornado/questions";

/**
 * S12 / terv A8 — a Tornado angol kérdése a központi szóbankból jön, a tananyag-elsőbbség mellett; szóbank nélkül
 * (tölt, hibázott) a régi sorrend változatlan. A Brain Rot PR #424-en mért csapda ellen: ha a szóbank egy közös
 * évfolyam-banki angol tételt VÁLT KI, az is látottnak jelölődik, különben a bank ugyanazt kínálná újra.
 */

/** Vak szóbank-csonk: minden hívásra új, egyedi kérdés (a valódi forrás a saját naplójával szintén nem ismétel). */
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

/** Szintetikus 9. évfolyamos bank: tárgyanként 3 sáv × 4 tétel (a sáv-sorrend így kimérhető). */
function grade9Bank(): GradeQuizItem[] {
  const items: GradeQuizItem[] = [];
  for (const subject of ["math", "english"] as const) {
    for (const tier of [1, 2, 3] as const) {
      for (let i = 1; i <= 4; i++) {
        items.push({
          id: `g09-${subject}-t${tier}-${i}`,
          grade: 9,
          subject,
          tier,
          prompt: `${subject} ${tier}/${i} kérdés`,
          options: ["a", "b", "c", "d"],
          correctIndex: 0,
          explanation: "Magyarázat a teszthez, elég hosszú.",
        });
      }
    }
  }
  return items;
}

const material: Question = {
  id: "mat-1",
  subject: "english",
  grade: 4,
  prompt: "Tananyag: Mi az alma angolul?",
  options: ["apple", "pear", "plum", "grape"],
  correctIndex: 0,
  difficulty: 2,
  source: "material",
};

test("vocabToQuestion: angol, bank-forrású Tornado-kérdés, a szint 0..4 → nehézség 1..5", () => {
  const q = vocabToQuestion({ id: "vocab:de0-x-001:cloze", prompt: "p", options: ["a", "b", "c", "d"], correctIndex: 2, level: 4 }, 6);
  assert.equal(q.subject, "english");
  assert.equal(q.source, "bank");
  assert.equal(q.difficulty, 5);
  assert.equal(q.grade, 6);
  assert.equal(q.correctIndex, 2);
  assert.ok(isVocabQuestion(q));
  assert.ok(!isVocabQuestion({ id: "english-4-001" }));
});

test("alsó tagozat (≤ 6. o.), angol mód: minden angol hely a szóbankból jön", () => {
  const vocab = vocabStub();
  const rng = makeRng(7);
  for (let i = 0; i < 30; i++) {
    const q = pickQuestion({ level: 20, school: 4, mode: "english", rng, vocab });
    assert.ok(isVocabQuestion(q), `${i}. húzás: ${q.id}`);
  }
  assert.equal(vocab.calls, 30);
});

test("tananyag-elsőbbség: van angol tananyag → az jön, a szóbankot meg sem hívja", () => {
  const vocab = vocabStub();
  const q = pickQuestion({ level: 20, school: 4, mode: "english", material: [material], rng: makeRng(1), vocab });
  assert.equal(q.id, "mat-1");
  assert.equal(vocab.calls, 0);
});

test("matek hely: a szóbank nem kérdez", () => {
  const vocab = vocabStub();
  for (let i = 0; i < 10; i++) {
    const q = pickQuestion({ level: 20, school: 4, mode: "math", rng: makeRng(i), vocab });
    assert.equal(q.subject, "math");
  }
  assert.equal(vocab.calls, 0);
});

test("szóbank nélkül (null forrás vagy null kérdés) a régi kézi bank kérdez", () => {
  const a = pickQuestion({ level: 20, school: 4, mode: "english", rng: makeRng(3) });
  assert.equal(a.subject, "english");
  assert.ok(!isVocabQuestion(a));
  const b = pickQuestion({ level: 20, school: 4, mode: "english", rng: makeRng(3), vocab: { next: () => null } });
  assert.equal(b.id, a.id, "üres szóbank-válasz → ugyanaz a kézi tétel, mint szóbank nélkül");
});

test("7–12. o.: a szóbank által kiváltott évfolyam-banki angol tétel is látott — kiesés után a bank nem ismétel", () => {
  const gradeBank = grade9Bank();
  const seen = createGradeQuizSeen();
  const rng = makeRng(11);
  const vocab = vocabStub();
  // 8 angol hely a szóbankból (a lap a kapott kérdést is a `seen`-be teszi, mint a TornadoHunter200 raiseQuiz-a).
  for (let i = 0; i < 8; i++) {
    const before = seen.ids.size;
    const q = pickQuestion({ level: 120, school: 9, mode: "english", rng, vocab, gradeBank, gradeSeen: seen, adaptiveBand: 0.5 });
    assert.ok(isVocabQuestion(q));
    assert.equal(seen.ids.size, before + 1, "a kiváltott banktétel látottnak jelölve");
    markGradeQuizSeen(seen, q);
  }
  // Szóbank-kiesés: a maradék 12 − 8 = 4 angol banktétel jön, mind új, ismétlés nélkül; utána elfogy (saját bank).
  const after: string[] = [];
  for (let i = 0; i < 4; i++) {
    const q = pickQuestion({ level: 120, school: 9, mode: "english", rng, gradeBank, gradeSeen: seen, adaptiveBand: 0.5 });
    assert.match(q.id, /^g09-english-/);
    after.push(q.id);
    markGradeQuizSeen(seen, q);
  }
  assert.equal(new Set(after).size, 4, `ismétlődő banktétel a kiesés után: ${after.join(", ")}`);
});

test("7–12. o., vegyes mód, 400 húzás: a tárgyak aránya nem torzul, és a matek mindhárom sávja sorra kerül", () => {
  const gradeBank = grade9Bank();
  const seen = createGradeQuizSeen();
  const rng = makeRng(2026);
  const vocab = vocabStub();
  let english = 0;
  const mathTiers = new Set<string>();
  const mathIds: string[] = [];
  for (let i = 0; i < 400; i++) {
    const q = pickQuestion({ level: 120, school: 9, mode: "mixed", rng, vocab, gradeBank, gradeSeen: seen, adaptiveBand: 0.5 });
    if (q.subject === "english") {
      english += 1;
      assert.ok(isVocabQuestion(q), `angol hely nem a szóbankból: ${q.id}`);
    } else if (q.id.startsWith("g09-math-")) {
      mathTiers.add(q.id.split("-")[2]!);
      mathIds.push(q.id);
    }
    markGradeQuizSeen(seen, q);
  }
  // A tárgy húzása `rng() < 0,5` (subjectFor): 400 húzásnál a binomiális szórás 10, a ±60-as sáv 6 szórás.
  assert.ok(english >= 140 && english <= 260, `angol arány torzult: ${english}/400`);
  // 12 matek banktétel van; mind a 12 sorra kerül ismétlés nélkül, mielőtt a saját bankra esne vissza.
  assert.equal(new Set(mathIds).size, 12, `matek banktételek: ${mathIds.length} húzás, ${new Set(mathIds).size} különböző`);
  assert.deepEqual([...mathTiers].sort(), ["t1", "t2", "t3"], "nem került sorra minden matek sáv");
});
