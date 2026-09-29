import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTO_GRADE_TABLE,
  QUESTION_BANK,
  autoGradesForLevel,
  resolveGrades,
  pickQuestion,
  randomQuizDue,
  shouldFireRoamQuiz,
  makeRng,
  materialToQuestions,
  QUIZ_MIN_GAP_SEC,
  QUIZ_MAX_GAP_SEC,
  type Question,
} from "../client/src/lib/tornado/questions";
import type { GradeQuizItem } from "../client/src/data/gradeQuizBank/types";
import { createGradeQuizSeen, markGradeQuizSeen } from "../client/src/game-engine/gradeQuiz";

/** Spec 2026-09-29: a small grade-12 English fixture, so these tests never depend on the shared bank's content. */
const GRADE12_ENGLISH: GradeQuizItem[] = [1, 2, 3].map((n) => ({
  id: `g12-english-00${n}`,
  grade: 12,
  subject: "english",
  tier: 2,
  prompt: `Fixture B2 question ${n}`,
  options: ["a", "b", "c", "d"],
  correctIndex: 1,
  explanation: "A fixture magyarázata, legalább harminc karakter hosszan.",
}));

/**
 * Tornado Hunter 200 — question engine.
 *
 * Two things the brief is explicit about and a refactor could silently break:
 * the AUTO level→grade table, and that scoring moments raise a quiz drawn
 * autonomously at random. Both are pinned here with a deterministic RNG so the
 * assertions are reproducible rather than flaky.
 */

test("az AUTO tábla a leírás szerinti sávokat adja", () => {
  // Spec 2026-09-29, 4. döntés: a 200 szint 1–12. osztályra oszlik (korábban 6 sáv, 1–6. o.).
  const expected: [number, number, number[]][] = [
    [1, 16, [1]],
    [17, 33, [2]],
    [34, 50, [3]],
    [51, 66, [4]],
    [67, 83, [5]],
    [84, 100, [6]],
    [101, 116, [7]],
    [117, 133, [8]],
    [134, 150, [9]],
    [151, 166, [10]],
    [167, 183, [11]],
    [184, 200, [12]],
  ];
  assert.equal(AUTO_GRADE_TABLE.length, expected.length);
  expected.forEach(([from, to, grades], i) => {
    const row = AUTO_GRADE_TABLE[i]!;
    assert.equal(row.from, from);
    assert.equal(row.to, to);
    assert.deepEqual(row.grades, grades);
  });
  // Folytonos lefedés 1..200
  assert.equal(AUTO_GRADE_TABLE[0]!.from, 1);
  assert.equal(AUTO_GRADE_TABLE[AUTO_GRADE_TABLE.length - 1]!.to, 200);
  for (let i = 1; i < AUTO_GRADE_TABLE.length; i++) {
    assert.equal(AUTO_GRADE_TABLE[i]!.from, AUTO_GRADE_TABLE[i - 1]!.to + 1);
  }
});

test("autoGradesForLevel minden határon a helyes osztályt adja", () => {
  // Spec 2026-09-29, 4. döntés: az új, 12 sávos tábla minden határa.
  const bounds: [number, number, number][] = [
    [1, 16, 1], [17, 33, 2], [34, 50, 3], [51, 66, 4], [67, 83, 5], [84, 100, 6],
    [101, 116, 7], [117, 133, 8], [134, 150, 9], [151, 166, 10], [167, 183, 11], [184, 200, 12],
  ];
  for (const [from, to, grade] of bounds) {
    assert.deepEqual(autoGradesForLevel(from), [grade], `${from}. szint`);
    assert.deepEqual(autoGradesForLevel(to), [grade], `${to}. szint`);
  }
});

test("kézi iskolai szint felülírja az AUTO-t", () => {
  assert.deepEqual(resolveGrades(3, 200), [3]);
  assert.deepEqual(resolveGrades(6, 1), [6]);
  assert.deepEqual(resolveGrades("auto", 1), [1]);
  // Spec 2026-09-29, 4. döntés: a legfelső sáv már a 12. osztály (korábban 181 → [6]).
  assert.deepEqual(resolveGrades("auto", 200), [12]);
});

test("a kérdésbank minden osztályhoz ad matek és angol kérdést is", () => {
  for (let grade = 1; grade <= 6; grade++) {
    for (const subject of ["math", "english"] as const) {
      const list = QUESTION_BANK.filter((q) => q.grade === grade && q.subject === subject);
      assert.ok(list.length >= 6, `${grade}. osztály ${subject}: csak ${list.length} kérdés`);
    }
  }
});

test("minden bankbeli kérdés alakja helyes (4 opció, érvényes helyes index, egyedi id)", () => {
  const ids = new Set<string>();
  for (const q of QUESTION_BANK) {
    assert.ok(q.prompt.trim().length > 0, "üres kérdés");
    assert.equal(q.options.length, 4, `${q.id}: 4 opció kell`);
    assert.equal(new Set(q.options).size, 4, `${q.id}: az opciók nem ismétlődhetnek`);
    assert.ok(q.correctIndex >= 0 && q.correctIndex < 4, `${q.id}: helyes index`);
    assert.ok(q.grade >= 1 && q.grade <= 6, `${q.id}: osztály 1..6`);
    assert.ok(q.difficulty >= 1 && q.difficulty <= 5, `${q.id}: nehézség 1..5`);
    assert.ok(!ids.has(q.id), `duplikált kérdés-azonosító: ${q.id}`);
    ids.add(q.id);
  }
});

test("pickQuestion tiszteletben tartja a tantárgy-módot és az osztályt", () => {
  const rng = makeRng(42);
  for (let i = 0; i < 40; i++) {
    const q = pickQuestion({ level: 5, school: "auto", mode: "math", rng });
    assert.equal(q.subject, "math");
    assert.ok([1, 2].includes(q.grade), `AUTO 5. szint → 1-2. osztály, kapott: ${q.grade}`);
  }
  // Spec 2026-09-29, 4. döntés: a 190. szint a 12. osztály, amely a közös évfolyam-bankból kérdez
  // (korábban 6. o.); a bank injektált fixture, hogy a teszt ne függjön a tartalmi szelettől.
  for (let i = 0; i < 40; i++) {
    const q = pickQuestion({ level: 190, school: "auto", mode: "english", gradeBank: GRADE12_ENGLISH, rng });
    assert.equal(q.subject, "english");
    assert.equal(q.grade, 12);
  }
});

test("7–12. osztály: a közös bankból ismétlés nélkül, kimerülve/üresen a saját bank legfelső osztálya", () => {
  const seen = createGradeQuizSeen();
  const ids: string[] = [];
  for (let i = 0; i < GRADE12_ENGLISH.length; i++) {
    const q = pickQuestion({ level: 1, school: 12, mode: "english", gradeBank: GRADE12_ENGLISH, gradeSeen: seen, rng: makeRng(i) });
    assert.equal(q.grade, 12);
    assert.ok(!ids.includes(q.id), `ismételt: ${q.id}`);
    ids.push(q.id);
    markGradeQuizSeen(seen, q);
  }
  const after = pickQuestion({ level: 1, school: 12, mode: "english", gradeBank: GRADE12_ENGLISH, gradeSeen: seen, rng: makeRng(9) });
  assert.equal(after.grade, 6, "kimerült közös bank → a Tornádó saját 6. osztályos bankja");
  const empty = pickQuestion({ level: 1, school: 9, mode: "math", gradeBank: [], rng: makeRng(3) });
  assert.equal(empty.grade, 6, "üres közös bank → a saját bank legfelső osztálya");
  assert.equal(empty.subject, "math");
});

test("7–12. osztályon is a tananyag-kérdés az első", () => {
  const material: Question[] = [
    { id: "mat-12", subject: "english", grade: 12, prompt: "Tananyag", options: ["1", "2", "3", "4"], correctIndex: 0, difficulty: 3, source: "material" },
  ];
  const q = pickQuestion({ level: 1, school: 12, mode: "english", material, gradeBank: GRADE12_ENGLISH, rng: makeRng(1) });
  assert.equal(q.id, "mat-12");
});

test("mixed módban idővel mindkét tantárgy előfordul", () => {
  const rng = makeRng(7);
  const subjects = new Set<string>();
  for (let i = 0; i < 60; i++) {
    subjects.add(pickQuestion({ level: 100, school: "auto", mode: "mixed", rng }).subject);
  }
  assert.deepEqual([...subjects].sort(), ["english", "math"]);
});

test("a tananyagból jövő kérdés elsőbbséget élvez a beépített bankkal szemben", () => {
  const material: Question[] = [
    {
      id: "mat-1",
      subject: "math",
      grade: 4,
      prompt: "Tananyag-kérdés",
      options: ["1", "2", "3", "4"],
      correctIndex: 1,
      difficulty: 3,
      source: "material",
    },
  ];
  const rng = makeRng(1);
  const picked = pickQuestion({ level: 120, school: "auto", mode: "mixed", material, rng });
  assert.equal(picked.source, "material");
  assert.equal(picked.id, "mat-1");
});

test("a közelmúltban feltett kérdést nem ismétli, amíg van más", () => {
  const rng = makeRng(3);
  const first = pickQuestion({ level: 60, school: "auto", mode: "math", rng });
  const second = pickQuestion({ level: 60, school: "auto", mode: "math", recent: [first.id], rng });
  assert.notEqual(second.id, first.id);
});

test("a kérdésválasztás determinisztikus ugyanazzal a seeddel", () => {
  const a = Array.from({ length: 10 }, (_, i) => pickQuestion({ level: 40, school: "auto", mode: "mixed", rng: makeRng(99 + i) }).id);
  const b = Array.from({ length: 10 }, (_, i) => pickQuestion({ level: 40, school: "auto", mode: "mixed", rng: makeRng(99 + i) }).id);
  assert.deepEqual(a, b);
});

test("materialToQuestions kiszűri a hibás alakú szerver-sorokat", () => {
  const rows = [
    { id: "a", prompt: "jó", options: ["1", "2", "3", "4"], correctIndex: 2, topic: "math" },
    { id: "b", prompt: "kevés opció", options: ["1", "2"], correctIndex: 0, topic: "math" },
    { id: "c", prompt: "rossz index", options: ["1", "2", "3", "4"], correctIndex: 9, topic: "english" },
    { id: "d", prompt: "angol", options: ["a", "b", "c", "d"], correctIndex: 0, topic: "english" },
  ];
  const out = materialToQuestions(rows, 4);
  assert.deepEqual(out.map((q) => q.id), ["a", "d"]);
  assert.equal(out[0]!.subject, "math");
  assert.equal(out[1]!.subject, "english");
  assert.ok(out.every((q) => q.source === "material" && q.grade === 4));
});

test("az autonóm kvízdobás a megadott sávban, véletlenszerűen sül el", () => {
  const rng = makeRng(11);
  // A minimum alatt SOHA nem kérdez.
  for (let i = 0; i < 50; i++) {
    assert.equal(randomQuizDue(QUIZ_MIN_GAP_SEC - 0.1, rng), false);
  }
  // A maximum felett MINDIG kérdez (nem maradhat el a pontosztási kvíz).
  for (let i = 0; i < 50; i++) {
    assert.equal(randomQuizDue(QUIZ_MAX_GAP_SEC + 0.1, rng), true);
  }
  // A sávon belül véletlenszerű: van igaz és hamis is.
  const mid = (QUIZ_MIN_GAP_SEC + QUIZ_MAX_GAP_SEC) / 2;
  const results = new Set<boolean>();
  const rng2 = makeRng(5);
  for (let i = 0; i < 200; i++) results.add(randomQuizDue(mid, rng2));
  assert.deepEqual([...results].sort(), [false, true]);
});

test("shouldFireRoamQuiz 18 s alatt 60 hívásból 0-szor sül el", () => {
  const rng = makeRng(1);
  let lastEvalAt = -Infinity;
  let fires = 0;
  for (let i = 0; i < 60; i++) {
    const r = shouldFireRoamQuiz({
      elapsed: 10,
      lastQuizAt: 0,
      lastEvalAt,
      alreadyPending: false,
      rng,
    });
    lastEvalAt = r.lastEvalAt;
    if (r.fire) fires += 1;
  }
  assert.equal(fires, 0);
});

test("shouldFireRoamQuiz a sávban max 1 igaz / másodperc (60 hívás 0.5 s alatt ≤1)", () => {
  const rng = makeRng(3);
  let lastEvalAt = -Infinity;
  let fires = 0;
  const start = QUIZ_MIN_GAP_SEC + 5;
  for (let i = 0; i < 60; i++) {
    const elapsed = start + i * (0.5 / 60);
    const r = shouldFireRoamQuiz({
      elapsed,
      lastQuizAt: 0,
      lastEvalAt,
      alreadyPending: false,
      rng,
    });
    lastEvalAt = r.lastEvalAt;
    if (r.fire) fires += 1;
  }
  assert.ok(fires <= 1, `0.5 s alatt ${fires} kvíz (max 1)`);
});

test("shouldFireRoamQuiz pending=true esetén soha", () => {
  const rng = makeRng(9);
  const r = shouldFireRoamQuiz({
    elapsed: 999,
    lastQuizAt: 0,
    lastEvalAt: -Infinity,
    alreadyPending: true,
    rng,
  });
  assert.equal(r.fire, false);
});

test("shouldFireRoamQuiz max-gap felett az első eval-tick-en igaz", () => {
  const rng = makeRng(2);
  const r = shouldFireRoamQuiz({
    elapsed: QUIZ_MAX_GAP_SEC + 1,
    lastQuizAt: 0,
    lastEvalAt: -Infinity,
    alreadyPending: false,
    rng,
  });
  assert.equal(r.fire, true);
});
