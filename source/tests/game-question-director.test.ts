import assert from "node:assert/strict";
import test from "node:test";
import { createRng, seedFrom } from "../shared/game-rng";
import {
  bankPlayQuestion,
  createQuestionDirector,
  materialPlayQuestion,
  restoreReviewQuestion,
  targetGapMs,
  vocabPlayQuestion,
  windowMsFor,
  type DirectorConfig,
  type QuestionProvider,
} from "../client/src/game-engine/play/questionDirector";
import { createReviewQueue, type ReviewQueue } from "../client/src/game-engine/play/reviewQueue";
import type { PlayQuestion, QuestionPresentation } from "../client/src/game-engine/play/types";
import { createGradeQuizSeen, markGradeQuizSeen, pickUnseenMaterial } from "../client/src/game-engine/gradeQuiz";
import { createSeenHistory, createVocabSource } from "../client/src/game-engine/vocab";
import type { FourChoiceQuiz } from "../client/src/types/gameQuiz";
import { makeSyntheticBank, memoryStorage } from "./support/vocab-fixture";

/**
 * J0b — kérdés-ütemező (végrehajtás J0b „Tesztek” (1)–(8); terv 6.2, J4, J6, J7, J10).
 * A küszöbök a terv 6.2 soraiból jönnek, nem a kód kimenetéből: ismétlés ≤ 30%, menetenként ≤ 2 visszatérés / tétel, a 75%-os
 * játékosnál a hibázottak ≥ 95%-a a 3.–6. következő kérdés (20 seed mediánja — 6.2 „Szimulációs paraméterek”: az eredmény
 * a 20 futás mediánja), az új kérdések 40-es ablakában nincs duplikátum, ha a forrás ≥ 200 tételt ad.
 */

const DAY = 86_400_000;
const T0 = 1_800_000_000_000;

const BASE: DirectorConfig = {
  gameId: "speed-quiz-math",
  optionCount: 4,
  minGapMs: 1500,
  maxGapMs: 6000,
  targetPerMin: 10,
  baseWindowMs: 4000,
  slowMo: 0.5,
  grade: 7,
};

function quiz(id: string, prompt = `Kérdés ${id}?`): FourChoiceQuiz {
  return { id, prompt, options: [`${id}-A`, `${id}-B`, `${id}-C`, `${id}-D`], correctIndex: 1, explanation: `Mert ${id}.` };
}

/** Kézi bank `size` tétellel; a választó a sorban következőt adja (körbe). */
function bankProvider(size: number, opts: { material?: FourChoiceQuiz[]; coupon?: boolean } = {}): QuestionProvider & { freshCalls: number } {
  const seen = createGradeQuizSeen();
  const material = opts.material ?? [];
  let i = 0;
  const provider: QuestionProvider & { freshCalls: number } = {
    freshCalls: 0,
    couponOnly: opts.coupon ?? false,
    material(): PlayQuestion | null {
      const m = pickUnseenMaterial(material, seen);
      if (!m) return null;
      markGradeQuizSeen(seen, m);
      return materialPlayQuestion(m, { coupon: opts.coupon });
    },
    fresh(): PlayQuestion | null {
      provider.freshCalls += 1;
      if (size === 0) return null;
      const q = quiz(`f${i % size}`);
      i += 1;
      return bankPlayQuestion("speed-quiz-math", q);
    },
    restore: (item) => restoreReviewQuestion(item, {}),
  };
  return provider;
}

type Played = { presentations: QuestionPresentation[]; results: Map<number, boolean> };

/**
 * Szimulált játék: 100 ms-os lépés, mindig nyugodt helyzet, a játékos `responseMs` után válaszol, `accuracy` eséllyel jól.
 * Addig fut, amíg `questions` kérdés el nem hangzik.
 */
function play(opts: {
  seed: number; accuracy: number; questions: number; provider: QuestionProvider; review?: ReviewQueue;
  config?: Partial<DirectorConfig>; responseMs?: number;
}): { director: ReturnType<typeof createQuestionDirector>; played: Played; simMs: number } {
  const review = opts.review ?? createReviewQueue(null, { now: () => T0, rng: createRng(seedFrom("rq", opts.seed)) });
  const director = createQuestionDirector({
    config: { ...BASE, ...opts.config },
    provider: opts.provider,
    review,
    rng: createRng(seedFrom("dir", opts.seed)),
    startBand: 0.4,
    now: () => T0,
  });
  const answers = createRng(seedFrom("player", opts.seed));
  const played: Played = { presentations: [], results: new Map() };
  const responseMs = opts.responseMs ?? 1500;
  let t = 0;
  for (let guard = 0; guard < 1_000_000 && played.presentations.length < opts.questions; guard++) {
    t += 100;
    const a = director.active();
    if (a) {
      if (t - a.startedAtSimMs >= responseMs) {
        const ok = answers.next() < opts.accuracy;
        const idx = a.options.findIndex((o) => o.correct === ok);
        director.answer(a.id, idx, t);
        played.results.set(a.id, ok);
      }
      continue;
    }
    const p = director.tick(t, { calm: true });
    if (p) played.presentations.push(p);
  }
  return { director, played, simMs: t };
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

test("(1) tananyag-elsőbbség: 3 tananyag + szóbank → az első 3 kérdés tananyag, utána nincs ismétlődő tananyag (C-34 H1)", () => {
  const entries = makeSyntheticBank("en", [60, 60, 0, 0, 0], 7);
  const vocab = createVocabSource({ lang: "en", entries, history: createSeenHistory(memoryStorage()), rng: createRng(1).next });
  const material = [quiz("m1", "Mi a fotoszintézis?"), quiz("m2", "Mi a sejt?"), quiz("m3", "Mi az ózon?")];
  const seen = createGradeQuizSeen();
  let materialCalls = 0;
  const provider: QuestionProvider = {
    couponOnly: false,
    material() {
      materialCalls += 1;
      const m = pickUnseenMaterial(material, seen);
      if (!m) return null;
      markGradeQuizSeen(seen, m);
      return materialPlayQuestion(m);
    },
    fresh() {
      const q = vocab.next(0);
      return q ? vocabPlayQuestion(q) : null;
    },
    restore: (item) => restoreReviewQuestion(item, { vocab: () => vocab }),
  };
  const { played } = play({ seed: 1, accuracy: 1, questions: 30, provider });
  const sources = played.presentations.map((p) => p.question.source);
  assert.deepEqual(sources.slice(0, 3), ["material", "material", "material"]);
  assert.ok(sources.slice(3).every((s) => s === "vocab"), `a tananyag után szóbank jön: ${sources.join(",")}`);
  const matKeys = played.presentations.filter((p) => p.question.source === "material").map((p) => p.question.key);
  assert.equal(new Set(matKeys).size, matKeys.length, "nincs ismétlődő tananyag");
  assert.ok(materialCalls > 3, "a director a tananyag elfogyása után is megkérdezi (nem ragad be)");
});

test("(1b) tananyag-elsőbbség hibával: a hibázott tananyag ismétlésként (nem új tételként) jön vissza", () => {
  const material = [quiz("m1"), quiz("m2"), quiz("m3")];
  const { played } = play({ seed: 3, accuracy: 0, questions: 12, provider: bankProvider(300, { material }) });
  const fresh = played.presentations.filter((p) => !p.isReview).map((p) => p.question.key);
  assert.equal(new Set(fresh).size, fresh.length, "új kérdésként egy kulcs sem ismétlődik");
  assert.deepEqual(fresh.slice(0, 3), ["mat:m1", "mat:m2", "mat:m3"]);
  assert.ok(played.presentations.some((p) => p.isReview && p.question.key.startsWith("mat:")), "a hibázott tananyag ismétlésként visszatér");
});

test("(2) a hibás tétel a 3.–6. következő kérdésként tér vissza (J4)", () => {
  for (let seed = 1; seed <= 50; seed++) {
    // Egyetlen hiba az első kérdésen, utána minden jó: a visszatérés helye a 3.–6. következő kérdés.
    const review = createReviewQueue(null, { now: () => T0, rng: createRng(seedFrom("rq2", seed)) });
    const director = createQuestionDirector({ config: BASE, provider: bankProvider(300), review, rng: createRng(seed), startBand: 0.4, now: () => T0 });
    const keys: string[] = [];
    let t = 0;
    while (keys.length < 10) {
      t += 100;
      const a = director.active();
      if (a) {
        if (t - a.startedAtSimMs >= 1000) director.answer(a.id, a.options.findIndex((o) => o.correct === (keys.length !== 1)), t);
        continue;
      }
      const p = director.tick(t, { calm: true });
      if (p) keys.push(p.question.key);
    }
    const back = keys.indexOf(keys[0]!, 1);
    assert.ok(back >= 3 && back <= 6, `seed ${seed}: a hibázott tétel a ${back}. következő kérdés (${keys.join(",")})`);
  }
});

test("(3) kupon módban csak tananyag jön, ismétlés és új tétel nem", () => {
  const material = [quiz("c1"), quiz("c2")];
  const provider = bankProvider(300, { material, coupon: true });
  const review = createReviewQueue(null, { now: () => T0 });
  const director = createQuestionDirector({ config: BASE, provider, review, rng: createRng(5), startBand: 0.4, now: () => T0 });
  const got: QuestionPresentation[] = [];
  for (let t = 10_000; t < 120_000; t += 100) {
    const a = director.active();
    if (a) {
      director.answer(a.id, a.options.findIndex((o) => !o.correct), t); // mindig hibás: ismétlés sem jöhet
      continue;
    }
    const p = director.tick(t, { calm: true });
    if (p) got.push(p);
  }
  assert.deepEqual(got.map((p) => p.question.key), ["mat:c1", "mat:c2"]);
  assert.ok(got.every((p) => p.question.source === "coupon" && !p.isReview));
  assert.equal(provider.freshCalls, 0, "kupon módban a director új tételt sem kér");
});

test("(4) az answer idempotens: második hívás ugyanarra az id-re null; az első válasz számít", () => {
  const director = createQuestionDirector({ config: BASE, provider: bankProvider(10), review: createReviewQueue(null, { now: () => T0 }), rng: createRng(9), startBand: 0.4, now: () => T0 });
  const p = director.request("trigger", 0)!;
  assert.ok(p);
  const right = p.options.findIndex((o) => o.correct);
  const wrong = p.options.findIndex((o) => !o.correct);
  const first = director.answer(p.id, wrong, 1200);
  assert.equal(first?.result, "wrong");
  assert.equal(director.answer(p.id, right, 1300), null);
  assert.equal(director.expire(1400), null, "a lezárt kérdés nem jár le újra");
  assert.equal(director.answer(p.id + 1, right, 1300), null, "ismeretlen id → null");
  const s = director.stats(2000);
  assert.equal(s.asked, 1);
  assert.equal(s.wrong, 1);
  assert.equal(s.correct, 0);
  assert.deepEqual(director.lastWrong(), { quiz: p.question.quiz, pickedOriginalIndex: p.options[wrong]!.originalIndex });
  assert.equal(director.wrongList().length, 1);
});

test("(5) 3 opciós megjelenítés: pontosan 1 helyes, az originalIndex visszaképezhető", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const director = createQuestionDirector({
      config: { ...BASE, optionCount: 3 }, provider: bankProvider(10), review: createReviewQueue(null, { now: () => T0 }),
      rng: createRng(seed), startBand: 0.4, now: () => T0,
    });
    const p = director.request("trigger", 0)!;
    assert.equal(p.options.length, 3);
    assert.equal(p.options.filter((o) => o.correct).length, 1);
    for (const o of p.options) {
      assert.equal(o.label, p.question.quiz.options[o.originalIndex]);
      assert.equal(o.correct, o.originalIndex === p.question.quiz.correctIndex);
    }
    assert.equal(new Set(p.options.map((o) => o.originalIndex)).size, 3, "különböző opciók");
    const pick = p.options.findIndex((o) => !o.correct);
    const out = director.answer(p.id, pick, 1000)!;
    assert.equal(out.pickedOriginalIndex, p.options[pick]!.originalIndex);
    assert.equal(out.correctOriginalIndex, p.question.quiz.correctIndex);
  }
  // 4 opciónál mind a négy szerepel, és a sorrend seedtől függően változik.
  const orders = new Set<string>();
  for (let seed = 1; seed <= 30; seed++) {
    const d = createQuestionDirector({ config: BASE, provider: bankProvider(10), review: createReviewQueue(null, { now: () => T0 }), rng: createRng(seed), startBand: 0.4, now: () => T0 });
    const p = d.request("trigger", 0)!;
    assert.deepEqual(p.options.map((o) => o.originalIndex).sort(), [0, 1, 2, 3]);
    orders.add(p.options.map((o) => o.originalIndex).join(""));
  }
  assert.ok(orders.size > 5, "seedelten keverve");
});

test("(6) windowMsFor: rövid / hosszú tétel, 3–4. évfolyam, felső vágás 9000 ms (terv 4.1/4, J10)", () => {
  const p = (n: number) => "x".repeat(n);
  assert.equal(windowMsFor(p(40), 7, 4000), 4000);
  assert.equal(windowMsFor(p(160), 7, 4000), 9000); // 4000 + 100 × 50
  assert.equal(windowMsFor(p(40), 3, 4000), 5000); // × 1,25
  assert.equal(windowMsFor(p(160), 3, 4000), 9000); // felső vágás
  assert.equal(windowMsFor(p(100), 7, 4000), 6000); // olvasási pótlék 40 × 50
  // Rövid tétel: 2,5–6 mp; 3–4. évfolyamon 3,1–7,5 mp; minden esetben ≤ 9 mp.
  assert.equal(windowMsFor(p(10), 9, 2500), 2500);
  assert.equal(windowMsFor(p(10), 9, 6000), 6000);
  assert.equal(windowMsFor(p(10), 4, 2500), 3125);
  assert.equal(windowMsFor(p(10), 4, 6000), 7500);
  for (const len of [0, 60, 61, 140, 400, 2000]) {
    for (const grade of [null, 3, 4, 5, 12]) {
      for (const base of [2500, 4000, 6000]) {
        const w = windowMsFor(p(len), grade, base);
        assert.ok(w >= 2500 && w <= 9000, `${len}/${grade}/${base} → ${w}`);
      }
    }
  }
});

test("(7) minGap / maxGap tartása 10 000 tick-en (nyugodt és zajos calm mellett is)", () => {
  for (const calmShare of [1, 0.5, 0.1]) {
    const director = createQuestionDirector({ config: BASE, provider: bankProvider(5000), review: createReviewQueue(null, { now: () => T0 }), rng: createRng(11), startBand: 0.4, now: () => T0 });
    const calmRng = createRng(seedFrom("calm", calmShare));
    const starts: number[] = [];
    let t = 0;
    for (let i = 0; i < 10_000; i++) {
      t += 100;
      const a = director.active();
      if (a) {
        if (t - a.startedAtSimMs >= 2000) director.answer(a.id, 0, t);
        continue;
      }
      const p = director.tick(t, { calm: calmRng.next() < calmShare });
      if (p) starts.push(p.startedAtSimMs);
    }
    assert.ok(starts.length > 50, `${calmShare}: kérdések száma ${starts.length}`);
    assert.ok(starts[0]! >= 10_000, "a bemelegítés alatt nincs ütemezett kérdés");
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i]! - starts[i - 1]! >= BASE.minGapMs, `minGap sérült: ${starts[i - 1]} → ${starts[i]}`);
    const s = director.stats(t);
    assert.ok(s.minGapSec >= BASE.minGapMs / 1000);
    assert.ok(s.maxGapSec <= BASE.maxGapMs / 1000 + 1e-9, `${calmShare}: maxGap ${s.maxGapSec}`);
    if (calmShare === 1) assert.ok(s.perMinute >= BASE.targetPerMin, `nyugodt játékban a kérdés/perc ≥ cél: ${s.perMinute}`);
  }
  // A célrés képlete: 60000 / (target × 1,1) × (1 − 0,25 × intensity), [min, max] közé vágva.
  assert.equal(targetGapMs(BASE, 0), Math.min(6000, 60_000 / 11));
  assert.equal(targetGapMs(BASE, 1), (60_000 / 11) * 0.75);
  assert.equal(targetGapMs({ ...BASE, targetPerMin: 4, maxGapMs: 20_000 }, 0), 60_000 / 4.4);
  assert.equal(targetGapMs({ ...BASE, targetPerMin: 100 }, 1), BASE.minGapMs);
});

test("(7) request: minGap-et tart, boss 800 ms-ot, rescue semmit; a bemelegítés alatt is kérhet", () => {
  const director = createQuestionDirector({ config: BASE, provider: bankProvider(100), review: createReviewQueue(null, { now: () => T0 }), rng: createRng(2), startBand: 0.4, now: () => T0 });
  const a = director.request("trigger", 1000)!;
  assert.ok(a, "bemelegítés alatt a trigger kérhet");
  director.answer(a.id, 0, 1200);
  assert.equal(director.request("trigger", 2400), null, "1,4 mp < minGap");
  assert.ok(director.request("boss", 1800), "boss: 800 ms elég");
  director.abort();
  assert.ok(director.request("rescue", 1801), "rescue: nincs minGap");
  assert.equal(director.request("rescue", 1802), null, "nyitott kérdés mellett nincs új");
});

function reviewRun(accuracy: number, seed: number) {
  const { played, director, simMs } = play({ seed, accuracy, questions: 300, provider: bankProvider(5000) });
  const perKeyReturns = new Map<string, number>();
  for (const p of played.presentations) if (p.isReview) perKeyReturns.set(p.question.key, (perKeyReturns.get(p.question.key) ?? 0) + 1);
  return { played, stats: director.stats(simMs), maxReturns: Math.max(0, ...perKeyReturns.values()) };
}

test("(7b) ismétlési arány ≤ 30% és menetenként ≤ 2 visszatérés / tétel, 75%-os és 45%-os válaszsorral (20 seed, mindegyik)", () => {
  for (const accuracy of [0.75, 0.45]) {
    for (let seed = 1; seed <= 20; seed++) {
      const { played, stats, maxReturns } = reviewRun(accuracy, seed);
      assert.ok(stats.reviewShare <= 0.3 + 1e-9, `${accuracy}/${seed}: ismétlési arány ${stats.reviewShare}`);
      assert.ok(maxReturns <= 2, `${accuracy}/${seed}: egy tétel ${maxReturns}-szor tért vissza`);
      // Bármely előtagban is ≤ 30% (nem csak a menet végén): az arány-korlát a menet minden pontján él.
      let reviews = 0;
      played.presentations.forEach((p, i) => {
        if (!p.isReview) return;
        reviews += 1;
        assert.ok(reviews <= 0.3 * (i + 1) + 1e-9, `${accuracy}/${seed}: az első ${i + 1} kérdésben ${reviews} ismétlés`);
      });
    }
  }
});

test("(7c) 75%-os válaszsorral a hibázott tételek ≥ 95%-a a 3.–6. következő kérdés, a többi ≤ 10 kérdésen belül (20 seed mediánja)", () => {
  const within6: number[] = [];
  const within10: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const { stats } = reviewRun(0.75, seed);
    within6.push(stats.reviewReturnWithin6);
    within10.push(stats.reviewReturnWithin10);
  }
  assert.ok(median(within6) >= 0.95, `3.–6.: medián ${median(within6)} (${within6.map((s) => s.toFixed(2)).join(" ")})`);
  assert.equal(median(within10), 1, `≤ 10: medián ${median(within10)} (${within10.map((s) => s.toFixed(2)).join(" ")})`);
});

test("(7c) 45%-os válaszsorral a hibázott tételek ≥ 60%-a ≤ 10 kérdésen belül visszatér (20 seed mediánja; terv 6.2 SIM_WEAK)", () => {
  const within10: number[] = [];
  for (let seed = 1; seed <= 20; seed++) within10.push(reviewRun(0.45, seed).stats.reviewReturnWithin10);
  assert.ok(median(within10) >= 0.6, `medián ${median(within10)} (${within10.map((s) => s.toFixed(2)).join(" ")})`);
});

test("(7d) bizonyíték: merev „két ismétlés között ≥ 2 új” térközzel két egymás utáni hiba a 16 sorsolásból csak 8-ban fér be", () => {
  // Hiba az i. és az i+1. kérdésnél; visszatérés: d1 ∈ [i+3, i+6], d2 ∈ [i+4, i+7] (egyenletes, seedelt — szerződés), a tétel
  // a d.-től a hiba + 6. kérdésig hozható vissza. Merev 3-as térköznél (|p1 − p2| ≥ 3) a 16 (d1, d2) párból hányban van
  // érvényes beosztás? Ha ez ½, akkor a két egymás utáni hiba (a 75%-os játékosnál kérdésenként ~0,25 × 0,76 × 0,25 ≈ 4,8%
  // eséllyel) ½ eséllyel egy kicsúszást okoz: hibázott tételenként (~0,19 / kérdés) ≈ 12% veszteség, a ≥ 95% elérhetetlen.
  // Arány-korláttal (≤ 30%) ugyanez a pár mind a 16 esetben befér (szomszédos helyek is lehetnek).
  const i = 0;
  const feasible = (spacing: number) => {
    let ok = 0;
    for (let d1 = i + 3; d1 <= i + 6; d1++) {
      for (let d2 = i + 4; d2 <= i + 7; d2++) {
        let found = false;
        for (let p1 = d1; p1 <= i + 6 && !found; p1++) {
          for (let p2 = d2; p2 <= i + 7 && !found; p2++) if (p1 !== p2 && Math.abs(p1 - p2) >= spacing) found = true;
        }
        if (found) ok += 1;
      }
    }
    return ok;
  };
  assert.equal(feasible(3), 8);
  assert.equal(feasible(1), 16);
});

test("(8) az ÚJ kérdések 40-es ablakában nincs duplikátum 300 kérdésnél, ha a forrás ≥ 200 tételt ad (J6)", () => {
  for (const size of [200, 5000]) {
    for (let seed = 1; seed <= 5; seed++) {
      const { played, director, simMs } = play({ seed, accuracy: 0.75, questions: 300, provider: bankProvider(size) });
      const fresh = played.presentations.filter((p) => !p.isReview).map((p) => p.question.key);
      for (let i = 0; i + 40 <= fresh.length; i++) {
        assert.equal(new Set(fresh.slice(i, i + 40)).size, 40, `${size}/${seed}: duplikátum a(z) ${i}. ablakban`);
      }
      assert.equal(director.stats(simMs).freshWindow40Distinct, 40);
    }
  }
});

test("menetek közötti ismétlés: az előző menet box 0 tétele a következő menetben ismétlésként jön (tananyag után)", () => {
  const storage = memoryStorage();
  const review1 = createReviewQueue(storage, { now: () => T0, rng: createRng(1) });
  play({ seed: 1, accuracy: 0, questions: 5, provider: bankProvider(300), review: review1 });
  assert.ok(review1.size() > 0);
  const review2 = createReviewQueue(storage, { now: () => T0 + 60_000, rng: createRng(2) });
  const { played } = play({ seed: 2, accuracy: 1, questions: 12, provider: bankProvider(300), review: review2 });
  const firstReview = played.presentations.findIndex((p) => p.isReview);
  assert.ok(firstReview >= 0 && firstReview < 10, `a következő menet első 10 kérdésében: ${firstReview}`);
  // Helyes ismétlés után a térköz nő: box 1, dueAt = +1 nap.
  const key = played.presentations[firstReview]!.question.key;
  const item = review2.snapshot().find((it) => it.key === key)!;
  assert.equal(item.box, 1);
  assert.equal(item.dueAt, T0 + 60_000 + DAY);
});

test("review #444: a vissza nem állítható (más játék / nyelv) esedékes tételek nem torlaszolják el a mögöttük lévőket", () => {
  const storage = memoryStorage();
  const seedQueue = createReviewQueue(storage, { now: () => T0 - 1000, rng: createRng(1) });
  // 12 idegen (szóbankos, de ennek a providernek nincs szóbankja) tétel KORÁBBI hibával, utána egy visszaállítható.
  for (let i = 0; i < 12; i++) {
    seedQueue.record({ key: `vocab:de:de0-x-${i}`, quiz: quiz(`d${i}`), source: "vocab", lang: "de" }, "wrong", 0);
  }
  const own = bankPlayQuestion("speed-quiz-math", quiz("own"));
  // A play() director-órája T0: a saját tétel (T0-kor hibázva) a 12 idegen (T0 − 1 mp) MÖGÖTT esedékes.
  createReviewQueue(storage, { now: () => T0, rng: createRng(2) }).record(own, "wrong", 0);
  const review = createReviewQueue(storage, { now: () => T0, rng: createRng(3) });
  const restoreCalls: string[] = [];
  const provider = bankProvider(300);
  const { played } = play({
    seed: 4, accuracy: 1, questions: 30, review,
    provider: { ...provider, restore: (item) => (restoreCalls.push(item.key), restoreReviewQuestion(item, { vocab: () => null })) },
  });
  assert.ok(played.presentations.some((p) => p.isReview && p.question.key === own.key), "a saját tétel visszatér");
  for (let i = 0; i < 12; i++) {
    assert.ok(restoreCalls.filter((k) => k === `vocab:de:de0-x-${i}`).length <= 1, "egy idegen kulcsot menetenként legfeljebb egyszer próbál");
  }
});

test("review #444: vegyes (több játék tételeit tartalmazó) közös sorral is teljesül a visszatérési pont; az idegen tétel a sorban marad", () => {
  const within6: number[] = [];
  const within10: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const storage = memoryStorage();
    const other = createReviewQueue(storage, { now: () => T0 - 1000, rng: createRng(seed) });
    // 60 idegen, esedékes tétel: másik játék kézi bankja, más nyelv szóbankja, a bankból törölt évfolyam-tétel.
    for (let i = 0; i < 20; i++) {
      other.record(bankPlayQuestion("tornado-hunter-200", quiz(`t${i}`)), "wrong", 0);
      other.record({ key: `vocab:fr:fr0-x-${i}`, quiz: quiz(`v${i}`), source: "vocab", lang: "fr" }, "wrong", 0);
      other.record({ key: `grade:torolt-${i}`, quiz: quiz(`g${i}`), source: "grade" }, "timeout", 0);
    }
    const review = createReviewQueue(storage, { now: () => T0, rng: createRng(seedFrom("rq", seed)) });
    const calls = new Map<string, number>();
    const base = bankProvider(5000);
    const provider: QuestionProvider = {
      ...base,
      restore: (item) => {
        calls.set(item.key, (calls.get(item.key) ?? 0) + 1);
        // Ez a játék csak a saját kézi bankját és szóbank / évfolyam-bank nélkül fut.
        return item.key.startsWith("bank:speed-quiz-math:") ? restoreReviewQuestion(item, {}) : null;
      },
    };
    const { director, simMs } = play({ seed, accuracy: 0.75, questions: 300, provider, review });
    const s = director.stats(simMs);
    within6.push(s.reviewReturnWithin6);
    within10.push(s.reviewReturnWithin10);
    assert.ok(s.reviewShare <= 0.3 + 1e-9);
    for (const [key, n] of calls) if (!key.startsWith("bank:speed-quiz-math:")) assert.ok(n <= 1, `${seed}: ${key} ${n}× próbálva`);
    assert.equal(review.snapshot().filter((it) => !it.key.startsWith("bank:speed-quiz-math:")).length, 60, "az idegen tételek a sorban maradnak (a saját játékuk előveszi)");
  }
  assert.ok(median(within6) >= 0.95, `3.–6.: medián ${median(within6)}`);
  assert.equal(median(within10), 1, `≤ 10: medián ${median(within10)}`);
});

test("abort: kimenet „aborted”, nem kerül az ismétlési sorba és nem mozdítja a sávot", () => {
  const review = createReviewQueue(null, { now: () => T0 });
  const director = createQuestionDirector({ config: BASE, provider: bankProvider(10), review, rng: createRng(4), startBand: 0.4, now: () => T0 });
  director.request("trigger", 0);
  const o = director.abort()!;
  assert.equal(o.result, "aborted");
  assert.equal(review.size(), 0);
  assert.equal(director.band(), 0.4);
  assert.equal(director.abort(), null);
});

test("üres forrás: nincs kérdés, a játék kérdés nélkül fut; a director 1 mp-ig nem kérdez újra", () => {
  const provider = bankProvider(0);
  const director = createQuestionDirector({ config: BASE, provider, review: createReviewQueue(null, { now: () => T0 }), rng: createRng(1), startBand: 0.4, now: () => T0 });
  for (let t = 10_000; t < 20_000; t += 100) assert.equal(director.tick(t, { calm: true }), null);
  assert.ok(provider.freshCalls <= 11, `visszafogott próbálkozás: ${provider.freshCalls}`);
});

test("hibás konfiguráció: RangeError (minGap < 1500, slowMo < 0,35, ablak-alap a 2500..6000 sávon kívül)", () => {
  const make = (c: Partial<DirectorConfig>) => () =>
    createQuestionDirector({ config: { ...BASE, ...c }, provider: bankProvider(1), review: createReviewQueue(null, { now: () => T0 }), rng: createRng(1), startBand: 0.4 });
  assert.throws(make({ minGapMs: 1000 }), RangeError);
  assert.throws(make({ slowMo: 0.2 }), RangeError);
  assert.throws(make({ baseWindowMs: 7000 }), RangeError);
  assert.throws(make({ maxGapMs: 1000 }), RangeError);
});

test("VocabSource.questionFor: kérdés naplózás nélkül; ismeretlen id → null; az ismétlés így épül újra (restoreReviewQuestion)", () => {
  const entries = makeSyntheticBank("en", [30, 30, 0, 0, 0], 3);
  const storage = memoryStorage();
  const history = createSeenHistory(storage);
  const vocab = createVocabSource({ lang: "en", entries, history, rng: createRng(8).next });
  const id = entries[5]!.id;
  const q = vocab.questionFor(id)!;
  assert.ok(q);
  assert.equal(q.vocabId, id);
  assert.equal(q.options[q.correctIndex] !== undefined, true);
  assert.equal(history.size("en"), 0, "nem naplóz");
  assert.equal(storage.data.size, 0, "a tárolóba sem ír");
  assert.equal(vocab.questionFor("nincs-ilyen"), null);
  // A meglévő next() továbbra is naplóz (a bővítés additív).
  vocab.next(0);
  assert.equal(history.size("en"), 1);
  // Ismétlés: a sor csak az id-t tárolja, a kérdés a forrásból épül újra, ugyanazzal a kulccsal.
  const review = createReviewQueue(null, { now: () => T0, rng: createRng(1) });
  const pq = vocabPlayQuestion(q);
  assert.equal(pq.key, `vocab:en:${id}`);
  assert.equal(pq.speakText, q.answerTerm);
  review.record(pq, "wrong", 0);
  const item = review.snapshot()[0]!;
  assert.deepEqual(item.payload, { kind: "vocab", lang: "en", vocabId: id });
  const restored = restoreReviewQuestion(item, { vocab: (lang) => (lang === "en" ? vocab : null) })!;
  assert.equal(restored.key, item.key);
  assert.equal(restored.source, "vocab");
  assert.equal(history.size("en"), 1, "az újraépítés sem naplóz");
  assert.equal(restoreReviewQuestion({ ...item, payload: { kind: "vocab", lang: "de", vocabId: id } }, { vocab: () => null }), null);
});

test("forrás-illesztők: egységes kulcsok (vocab / grade / mat / bank), kupon-forrás", () => {
  const g = { id: "g07-math-012", grade: 7, subject: "math" as const, tier: 1 as const, prompt: "2+2?", options: ["3", "4", "5", "6"], correctIndex: 1, explanation: "Mert 4." };
  const gradeItem = { kind: "grade" as const, id: g.id };
  const restoredGrade = restoreReviewQuestion(
    { key: `grade:${g.id}`, box: 0, dueAt: 0, dueInRun: null, lastSeen: 0, wrong: 1, correct: 0, payload: gradeItem },
    { gradeItem: (id) => (id === g.id ? g : null) },
  );
  assert.equal(restoredGrade?.key, "grade:g07-math-012");
  assert.equal(restoredGrade?.subject, "math");
  assert.equal(materialPlayQuestion(quiz("m9")).key, "mat:m9");
  assert.equal(materialPlayQuestion({ ...quiz(""), prompt: "  Mi  a Sejt? " }).key, "mat:mi a sejt?");
  assert.equal(materialPlayQuestion(quiz("m9"), { couponItemId: "c-1" }).source, "coupon");
  assert.equal(materialPlayQuestion(quiz("m9"), { couponItemId: "c-1" }).couponItemId, "c-1");
  assert.equal(bankPlayQuestion("tornado-hunter-200", quiz("b1")).key, "bank:tornado-hunter-200:b1");
});

test("determinizmus: azonos seed → azonos kérdéssor és opció-sorrend", () => {
  const sig = (seed: number) =>
    play({ seed, accuracy: 0.75, questions: 60, provider: bankProvider(500) }).played.presentations
      .map((p) => `${p.question.key}@${p.startedAtSimMs}:${p.options.map((o) => o.originalIndex).join("")}`).join("|");
  assert.equal(sig(42), sig(42));
  assert.notEqual(sig(42), sig(43));
});
