import assert from "node:assert/strict";
import test from "node:test";
import { createRng, seedFrom } from "../shared/game-rng";
import {
  LATE_RETURN_MAX,
  MAX_RETURNS_PER_RUN,
  REVIEW_SHARE_MAX,
  createQuestionDirector,
  materialPlayQuestion,
  restoreReviewQuestion,
  type DirectorConfig,
  type QuestionProvider,
} from "../client/src/game-engine/play/questionDirector";
import { createReviewQueue } from "../client/src/game-engine/play/reviewQueue";
import type { FourChoiceQuiz } from "../client/src/types/gameQuiz";

/**
 * P-010 — kuponos ismétlés: szerződés-tesztek a kérdés-ütemező TISZTA bemenetén (seedelt; terv:
 * docs/specs/2026-11-23-kuponos-ismetles-hatarido.md K1–K6). A küszöbök a szerződésből jönnek: K1 = `LATE_RETURN_MAX`
 * (levezetett határ), K2 / K3 = 3n (mért legrosszabb eset fölötti teszt-korlát, nem levezetett).
 */

const T0 = 1_800_000_000_000;
const CONFIG: DirectorConfig = {
  gameId: "speed-quiz-math",
  optionCount: 4,
  minGapMs: 1500,
  maxGapMs: 6000,
  targetPerMin: 10,
  baseWindowMs: 4000,
  slowMo: 0.5,
  grade: 7,
};
const SEEDS = Array.from({ length: 80 }, (_, i) => 1 + i);
const ACCURACIES = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
const QUESTIONS = 80;

function quiz(id: string): FourChoiceQuiz {
  return { id, prompt: `Lecke ${id}?`, options: [`${id}-A`, `${id}-B`, `${id}-C`, `${id}-D`], correctIndex: 2 };
}

/** n tételes kupon-lecke: a `material()` sorban adja a még fel nem tett tételt, utána null (kimerülés). */
function couponLesson(n: number): QuestionProvider {
  const items = Array.from({ length: n }, (_, k) => quiz(`L${k}`));
  let next = 0;
  return {
    couponOnly: true,
    material: () => {
      const m = items[next];
      if (!m) return null;
      next += 1;
      return materialPlayQuestion(m, { coupon: true, couponItemId: `kupon-${m.id}` });
    },
    fresh: () => assert.fail("kupon módban a director új tételt nem kér"),
    restore: (item) => restoreReviewQuestion(item, {}),
  };
}

function director(n: number, seed: number) {
  const review = createReviewQueue(null, { now: () => T0, rng: createRng(seedFrom("p010-rq", seed)) });
  const d = createQuestionDirector({ config: CONFIG, provider: couponLesson(n), review, rng: createRng(seedFrom("p010-dir", seed)), startBand: 0.4, now: () => T0 });
  return { d, review };
}

type Asked = { key: string; isReview: boolean; ok: boolean };

/** Seedelt menet: mindig nyugodt helyzet, 1,5 mp-es válasz, `accuracy` eséllyel jó; `questions` megválaszolt kérdésig. */
function play(n: number, accuracy: number, seed: number, questions = QUESTIONS): Asked[] {
  const { d } = director(n, seed);
  const answers = createRng(seedFrom("p010-player", seed, accuracy));
  const out: Asked[] = [];
  let t = 0;
  for (let guard = 0; guard < 1_000_000 && out.length < questions; guard++) {
    t += 100;
    const a = d.active();
    if (a) {
      if (t - a.startedAtSimMs < 1500) continue;
      const ok = answers.next() < accuracy;
      d.answer(a.id, a.options.findIndex((o) => o.correct === ok), t);
      out.push({ key: a.question.key, isReview: a.isReview, ok });
      continue;
    }
    d.tick(t, { calm: true });
  }
  assert.equal(out.length, questions, `${n} tétel: a kérdés nem fogyott el`);
  return out;
}

/** A tétel ismétlésként való visszatéréseinek száma a menetben az i. kérdéssel BEZÁRÓLAG (a director `returns`-e). */
function returnsUpTo(run: Asked[], i: number): number {
  return run.slice(0, i + 1).filter((x) => x.isReview && x.key === run[i]!.key).length;
}

for (const n of [8, 10, 11, 12]) {
  test(`P-010 K1–K5: ${n} tételes kupon-lecke (80 seed × ${ACCURACIES.length} pontosság) — a hibázott tétel ≤ ${LATE_RETURN_MAX} kérdésen belül visszajön`, () => {
    let underCap = 0;
    let overCap = 0;
    const failures: string[] = [];
    for (const seed of SEEDS) {
      for (const accuracy of ACCURACIES) {
        const run = play(n, accuracy, seed);
        const label = `seed ${seed}, pontosság ${accuracy}`;
        run.forEach((x, i) => {
          if (x.ok) return;
          const back = run.slice(i + 1).findIndex((y) => y.key === x.key) + 1; // 0 = nem jött vissza
          if (returnsUpTo(run, i) < MAX_RETURNS_PER_RUN) {
            // K1: levezetett határ; kivétel csak a menet vége (kevesebb mint LATE_RETURN_MAX kérdés maradt).
            if (run.length - i - 1 < LATE_RETURN_MAX) return;
            underCap += 1;
            if (back === 0 || back > LATE_RETURN_MAX) failures.push(`K1 ${label}: ${x.key} (${i + 1}.) ${back === 0 ? "nem jött vissza" : `${back} kérdés múlva`}`);
          } else {
            // K2: a plafont elért tétel is visszajön a menetben (mért teszt-korlát: 3n).
            if (run.length - i - 1 < 3 * n) return;
            overCap += 1;
            if (back === 0 || back > 3 * n) failures.push(`K2 ${label}: ${x.key} (${i + 1}.) ${back === 0 ? "nem jött vissza" : `${back} kérdés múlva`}`);
          }
        });
        // K3: minden lecke-tétel sorra kerül ≤ 3n kérdésen belül.
        for (let k = 0; k < n; k++) {
          const first = run.findIndex((y) => y.key === `mat:L${k}`);
          if (first < 0 || first >= 3 * n) failures.push(`K3 ${label}: L${k} első feltevése ${first < 0 ? "nincs" : `${first + 1}.`}`);
        }
        // K4: a 30%-os arányt csak határidős visszatérés lépi át; K5: közvetlen ismétlés nincs.
        let reviews = 0;
        const lastMiss = new Map<string, number>();
        run.forEach((x, i) => {
          if (x.isReview) {
            const shareOpen = reviews + 1 <= REVIEW_SHARE_MAX * (i + 1) + 1e-9;
            const sinceMiss = i - (lastMiss.get(x.key) ?? Number.POSITIVE_INFINITY);
            if (!shareOpen && !(sinceMiss >= LATE_RETURN_MAX)) failures.push(`K4 ${label}: ${i + 1}. kérdés ismétlés a 30% fölött, a hiba után ${sinceMiss}.`);
            reviews += 1;
          }
          if (!x.ok) lastMiss.set(x.key, i);
          if (i > 0 && run[i - 1]!.key === x.key) failures.push(`K5 ${label}: közvetlen ismétlés ${x.key} (${i + 1}.)`);
        });
      }
    }
    assert.ok(underCap > 1000 && overCap > 100, `érdemi minta: plafon alatti ${underCap}, fölötti ${overCap} hiba`);
    assert.deepEqual(failures.slice(0, 12), [], `${failures.length} szerződés-sértés (${n} tétel)`);
  });
}

test("P-010 K6: 12 tételes lecke — lejárt válaszidő, majd a visszatérés alatt lejárt kupon (abort): a hiba nem vész el, a megszakítás nem visszatérés", () => {
  for (const seed of SEEDS.slice(0, 20)) {
    const { d, review } = director(12, seed);
    const KEY = "mat:L0";
    const asked: { key: string; isReview: boolean; result: string }[] = [];
    let aborted = false;
    let t = 0;
    for (let guard = 0; guard < 1_000_000 && asked.length < 40; guard++) {
      t += 100;
      const a = d.active();
      if (a) {
        if (t - a.startedAtSimMs < 1500) continue;
        if (a.question.key === KEY && a.isReview && !aborted) {
          // A hibázott tétel első visszatérése alatt lejár a kupon: megszakítás.
          aborted = true;
          const o = d.abort();
          assert.equal(o?.result, "aborted", `seed ${seed}: a megszakítás kimenete`);
          asked.push({ key: a.question.key, isReview: a.isReview, result: "aborted" });
          assert.ok(d.wrongList().some((w) => w.quiz.id === "L0"), `seed ${seed}: a hiba a wrongList-ben marad`);
          const item = review.snapshot().find((it) => it.key === KEY);
          assert.ok(item && item.box === 0 && item.dueInRun !== null, `seed ${seed}: a tétel az ismétlési sorban marad (box 0, menetközi esedékesség)`);
          continue;
        }
        if (a.question.key === KEY && asked.filter((x) => x.key === KEY).length === 0) {
          d.expire(t); // első feltevés: lejárt válaszidő (timeout = hiba)
          asked.push({ key: KEY, isReview: a.isReview, result: "timeout" });
          continue;
        }
        // L0 minden további valódi feltevése rossz, minden más tétel jó.
        const ok = a.question.key !== KEY;
        const o = d.answer(a.id, a.options.findIndex((opt) => opt.correct === ok), t);
        asked.push({ key: a.question.key, isReview: a.isReview, result: o!.result });
        continue;
      }
      d.tick(t, { calm: true });
    }
    assert.ok(aborted, `seed ${seed}: volt megszakított visszatérés`);
    const at = asked.flatMap((x, i) => (x.key === KEY ? [i] : []));
    const results = at.map((i) => asked[i]!.result);
    assert.deepEqual(results.slice(0, 2), ["timeout", "aborted"], `seed ${seed}: L0 sorrendje ${results.join(",")}`);
    // A megszakítás nem teljesíti a határidőt: az első hibától számítva a következő VALÓDI feltevés ≤ LATE_RETURN_MAX.
    assert.ok(at[2] !== undefined && at[2] - at[0]! <= LATE_RETURN_MAX, `seed ${seed}: a megszakítás utáni visszatérés ${at[2]! - at[0]!}. (L0: ${at.join(",")})`);
    // A megszakítás a plafonba sem számít: a megszakítás után még MAX_RETURNS_PER_RUN valódi visszatérés jár határidőn belül.
    for (let r = 2; r < 2 + MAX_RETURNS_PER_RUN; r++) {
      assert.ok(asked[at[r]!]?.isReview, `seed ${seed}: L0 ${r}. feltevése ismétlésként (L0: ${at.join(",")})`);
      if (r > 2) assert.ok(at[r]! - at[r - 1]! <= LATE_RETURN_MAX, `seed ${seed}: L0 ${r}. feltevése ${at[r]! - at[r - 1]!} kérdés múlva (L0: ${at.join(",")})`);
    }
  }
});
