import assert from "node:assert/strict";
import test from "node:test";

import { createRng } from "../shared/game-rng";
import {
  GAME_REVIEW_KEY,
  REVIEW_ITEM_REV,
  createReviewQueue,
  inferReviewGrade,
  reviewFitsGrade,
} from "../client/src/game-engine/play/reviewQueue";
import {
  bankPlayQuestion,
  createQuestionDirector,
  restoreReviewQuestion,
  type DirectorConfig,
  type QuestionProvider,
} from "../client/src/game-engine/play/questionDirector";
import type { PlayQuestion, QuestionPresentation } from "../client/src/game-engine/play/types";

/**
 * Review #451 (J4a pilot) — a KÖZÖS évfolyam-szabály az ismétlési sorban (`reviewFitsGrade`, `inferReviewGrade`,
 * `PlayQuestion.grade`, a director évfolyam-bélyege). A sor a hét játékban közös, és egy böngészőben több testvér is játszhat:
 * a 12. évfolyamon elrontott tétel ne kerüljön egy 3. osztályos menetbe, de a saját évfolyamán térjen vissza.
 */

const T0 = Date.UTC(2026, 10, 16, 10, 0, 0);
const DAY = 86_400_000;

function memoryStorage() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

function quiz(id: string) {
  return { id, prompt: `Mennyi ${id}?`, options: ["1", "2", "3", "4"], correctIndex: 0, explanation: "Mert." };
}

function config(grade: number | null): DirectorConfig {
  return { gameId: "speed-quiz-math", optionCount: 4, minGapMs: 1500, maxGapMs: 6000, targetPerMin: 10, baseWindowMs: 4000, slowMo: 0.6, grade, warmupMs: 0 };
}

function bankProvider(prefix: string, extra: Partial<QuestionProvider> = {}): QuestionProvider {
  let n = 0;
  return {
    couponOnly: false,
    material: () => null,
    fresh: () => bankPlayQuestion("speed-quiz-math", quiz(`${prefix}${n++}`)),
    restore: (item) => restoreReviewQuestion(item, {}),
    ...extra,
  };
}

/** `count` kérdést kér és mind jól válaszol; visszaadja a feltett kulcsokat ismétlés-jelöléssel. */
function play(grade: number | null, storage: ReturnType<typeof memoryStorage>, count: number, provider = bankProvider("f")) {
  const review = createReviewQueue(storage, { now: () => T0 + DAY, rng: createRng(3) });
  const d = createQuestionDirector({ config: config(grade), provider, review, rng: createRng(5), startBand: 0.5, now: () => T0 + DAY });
  const asked: QuestionPresentation[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    t += 2000;
    const p = d.request("trigger", t);
    if (!p) continue;
    asked.push(p);
    d.answer(p.id, p.options.findIndex((o) => o.correct), t + 500);
  }
  return { asked, review };
}

function seedWrong(storage: ReturnType<typeof memoryStorage>, q: PlayQuestion): void {
  createReviewQueue(storage, { now: () => T0, rng: createRng(1) }).record(q, "wrong", 0);
}

test("12. évfolyamon elrontott tétel + 3. évfolyamos menet → nem tér vissza, és a sorban marad", () => {
  const storage = memoryStorage();
  const hard = bankPlayQuestion("speed-quiz-math", quiz("log"), undefined, 12);
  seedWrong(storage, hard);
  const { asked, review } = play(3, storage, 12);
  assert.equal(asked.some((p) => p.question.key === hard.key), false);
  assert.ok(review.snapshot().some((it) => it.key === hard.key && it.grade === 12), "a tétel a sorban marad a saját évfolyamának");
});

test("ugyanaz az évfolyam → a menetek közötti ismétlésként visszatér", () => {
  const storage = memoryStorage();
  const hard = bankPlayQuestion("speed-quiz-math", quiz("log"), undefined, 12);
  seedWrong(storage, hard);
  const { asked } = play(12, storage, 8);
  const back = asked.find((p) => p.question.key === hard.key);
  assert.ok(back && back.isReview, "a 12. évfolyamos menetben ismétlésként jön");
});

test("a director az évfolyam nélküli tételre a menet évfolyamát bélyegzi (minden játékban, provider-módosítás nélkül)", () => {
  const storage = memoryStorage();
  const review = createReviewQueue(storage, { now: () => T0, rng: createRng(3) });
  const d = createQuestionDirector({ config: config(5), provider: bankProvider("x"), review, rng: createRng(5), startBand: 0.5, now: () => T0 });
  const p = d.request("trigger", 0)!;
  d.answer(p.id, p.options.findIndex((o) => !o.correct), 500);
  assert.equal(review.snapshot()[0]!.grade, 5);
  const stored = JSON.parse(storage.data.get(GAME_REVIEW_KEY)!);
  assert.equal(stored.v, 1, "a boríték változatlan (a régi olvasó sem dobja el)");
  assert.equal(stored.rev, REVIEW_ITEM_REV);
  assert.equal(stored.items[p.question.key].grade, 5);
  // Évfolyam nélküli játék (grade: null): minden tétel visszatérhet.
  assert.equal(reviewFitsGrade(review.snapshot()[0]!, null), true);
});

test("régi (rev nélküli) formátum migrációja: az évfolyam a kulcsból / azonosítóból; ismeretlen esetén csak a játék ellenőrzésével", () => {
  assert.equal(inferReviewGrade("grade:g05-math-001"), 5);
  assert.equal(inferReviewGrade("bank:speed-quiz-math:g12:Mennyi?"), 12);
  assert.equal(inferReviewGrade("bank:tornado-hunter-200:Mennyi?"), null);
  assert.equal(inferReviewGrade("mat:abc", { kind: "quiz", source: "material", quiz: { ...quiz("g09-hist-3"), id: "g09-hist-3" } }), 9);
  const storage = memoryStorage();
  const base = { box: 0, dueAt: T0, dueInRun: null, lastSeen: T0, wrong: 1, correct: 0 };
  storage.data.set(GAME_REVIEW_KEY, JSON.stringify({
    v: 1,
    items: {
      "grade:g05-math-001": { ...base, payload: { kind: "grade", id: "g05-math-001" } },
      "bank:speed-quiz-math:regi": { ...base, payload: { kind: "quiz", source: "bank", quiz: quiz("regi") } },
      "vocab:en:en1-cat": { ...base, payload: { kind: "vocab", lang: "en", vocabId: "en1-cat" } },
    },
  }));
  const q = createReviewQueue(storage, { now: () => T0 });
  const byKey = new Map(q.snapshot().map((it) => [it.key, it]));
  assert.equal(byKey.get("grade:g05-math-001")!.grade, 5);
  const legacy = byKey.get("bank:speed-quiz-math:regi")!;
  assert.equal(legacy.grade, undefined, "ismeretlen évfolyamú régi tétel");
  assert.equal(reviewFitsGrade(legacy, 4), false, "ellenőrizetlenül nem tér vissza");
  assert.equal(reviewFitsGrade(legacy, 4, () => true), true, "ha a játék forrása ma is ezt adná, visszatérhet");
  assert.equal(reviewFitsGrade(byKey.get("vocab:en:en1-cat")!, 4), true, "a szóbank nyelvhez, nem évfolyamhoz kötött");
  assert.equal(reviewFitsGrade(byKey.get("grade:g05-math-001")!, 5), true);
  assert.equal(reviewFitsGrade(byKey.get("grade:g05-math-001")!, 6), false, "a ±1 évfolyam sem: a nehézség évfolyamhoz kötött");
  // A director a régi, ismeretlen tételt nem kérdezi, de a sorban hagyja.
  const { asked, review } = play(4, storage, 10);
  assert.equal(asked.some((p) => p.question.key === legacy.key), false);
  assert.ok(review.snapshot().some((it) => it.key === legacy.key));
  // A játék `legacyReviewFits` ellenőrzésével igen.
  const storage2 = memoryStorage();
  storage2.data.set(GAME_REVIEW_KEY, storage.data.get(GAME_REVIEW_KEY)!.replace(/"rev":\d+,/, ""));
  const ok = play(4, storage2, 10, bankProvider("f", { legacyReviewFits: (it) => it.key === legacy.key }));
  assert.ok(ok.asked.some((p) => p.question.key === legacy.key && p.isReview));
});

test("vegyes sor (több évfolyam, több játék) mellett is teljesül a menet közbeni visszatérési pont (75%, 20 seed)", () => {
  const within6: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const storage = memoryStorage();
    const pre = createReviewQueue(storage, { now: () => T0 - 1000, rng: createRng(seed) });
    for (let i = 0; i < 20; i++) pre.record(bankPlayQuestion("speed-quiz-math", quiz(`o${i}`), undefined, 3 + (i % 10)), "wrong", 0);
    for (let i = 0; i < 20; i++) pre.record(bankPlayQuestion("tornado-hunter-200", quiz(`t${i}`), undefined, 7), "wrong", 0);
    const review = createReviewQueue(storage, { now: () => T0, rng: createRng(seed + 100) });
    let n = 0;
    const provider: QuestionProvider = {
      couponOnly: false,
      material: () => null,
      fresh: () => bankPlayQuestion("speed-quiz-math", quiz(`s${seed}-${n++}`)),
      restore: (item) => (item.key.startsWith("bank:speed-quiz-math:") ? restoreReviewQuestion(item, {}) : null),
    };
    const d = createQuestionDirector({ config: config(7), provider, review, rng: createRng(seed), startBand: 0.5, now: () => T0 });
    const rng = createRng(seed * 7);
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += 2000;
      const p = d.request("trigger", t);
      if (!p) continue;
      assert.ok(!p.isReview || p.question.grade === 7, `${seed}: más évfolyamú ismétlés: ${p.question.key} (${p.question.grade})`);
      const good = rng.next() < 0.75;
      d.answer(p.id, p.options.findIndex((o) => o.correct === good), t + 400);
    }
    const s = d.stats(t);
    within6.push(s.reviewReturnWithin6);
    assert.ok(s.reviewShare <= 0.3 + 1e-9);
    assert.equal(review.snapshot().filter((it) => it.key.startsWith("bank:tornado-hunter-200:")).length, 20, "az idegen játék tételei a sorban maradnak");
    assert.ok(review.snapshot().filter((it) => /^bank:speed-quiz-math:o\d+$/.test(it.key) && it.grade !== 7).length >= 18, "a más évfolyamú tételek a sorban maradnak");
  }
  within6.sort((a, b) => a - b);
  assert.ok((within6[9]! + within6[10]!) / 2 >= 0.95, `3.–6.: medián ${(within6[9]! + within6[10]!) / 2}`);
});
