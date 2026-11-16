import assert from "node:assert/strict";
import test from "node:test";
import { createRng } from "../shared/game-rng";
import {
  BOX_INTERVAL_MS,
  EXPLANATION_MAX,
  GAME_REVIEW_KEY,
  OPTION_MAX,
  PROMPT_MAX,
  REVIEW_CAP,
  REVIEW_STALE_MS,
  createReviewQueue,
} from "../client/src/game-engine/play/reviewQueue";
import type { PlayQuestion } from "../client/src/game-engine/play/types";
import { memoryStorage } from "./support/vocab-fixture";

/**
 * J0b — térközös ismétlési sor (végrehajtás J0b „Tesztek” (1)–(7); terv 6.2 „Hibázott tétel visszatérése”, 7.).
 */

const DAY = 86_400_000;
const T0 = 1_800_000_000_000;

function bankQ(id: string, extra: Partial<PlayQuestion> = {}): PlayQuestion {
  return {
    key: `bank:speed-quiz-math:${id}`,
    quiz: { id, prompt: `Mennyi ${id}?`, options: ["1", "2", "3", "4"], correctIndex: 2, explanation: "Mert." },
    source: "bank",
    ...extra,
  };
}

test("(1) hibás / időtúllépés → box 0, dueInRun a runIndex+3…+6 tartományban, 1000 seedből mind", () => {
  const offsets = new Set<number>();
  for (let seed = 1; seed <= 1000; seed++) {
    const q = createReviewQueue(null, { now: () => T0, rng: createRng(seed) });
    const runIndex = seed % 37;
    q.record(bankQ("a"), seed % 2 ? "wrong" : "timeout", runIndex);
    const [item] = q.snapshot();
    assert.equal(item!.box, 0);
    assert.equal(item!.dueAt, T0);
    const off = item!.dueInRun! - runIndex;
    assert.ok(off >= 3 && off <= 6, `seed ${seed}: eltolás ${off}`);
    offsets.add(off);
    assert.equal(q.dueInRun(runIndex + off - 1), null, "esedékesség előtt nem jön");
    assert.equal(q.dueInRun(runIndex + off)?.key, "bank:speed-quiz-math:a");
  }
  assert.deepEqual([...offsets].sort(), [3, 4, 5, 6], "a seedelt sorsolás a teljes tartományt használja");
});

test("(2) jó válasz: box 0→1, dueAt = now + 1 nap; utána 3, 7, 21 nap; box 4 fölé nem megy; aborted → nincs változás", () => {
  let now = T0;
  const q = createReviewQueue(null, { now: () => now, rng: createRng(1) });
  q.record(bankQ("a"), "wrong", 0);
  q.record(bankQ("a"), "aborted", 4);
  assert.equal(q.snapshot()[0]!.box, 0);
  const expected = [1, 3, 7, 21, 21];
  for (let k = 0; k < expected.length; k++) {
    now += 1000;
    q.record(bankQ("a"), "correct", 5 + k);
    const item = q.snapshot()[0]!;
    assert.equal(item.box, Math.min(4, k + 1));
    assert.equal(item.dueAt, now + expected[k]! * DAY);
    assert.equal(item.dueInRun, null);
    assert.equal(item.correct, k + 1);
  }
  assert.deepEqual(BOX_INTERVAL_MS, [0, DAY, 3 * DAY, 7 * DAY, 21 * DAY]);
  // Első látásra tudott tétel nem kerül a sorba (a sor a hibázottaké).
  q.record(bankQ("b"), "correct", 9);
  assert.equal(q.size(), 1);
  // Újabb hiba visszaviszi box 0-ba.
  q.record(bankQ("a"), "wrong", 10);
  assert.equal(q.snapshot()[0]!.box, 0);
  assert.equal(q.snapshot()[0]!.wrong, 2);
});

test("(3) startRun után a box 0 tétel dueAcrossRuns-ként jön (a dueInRun null); a menet közben függő nem", () => {
  const now = T0;
  const storage = memoryStorage();
  const q = createReviewQueue(storage, { now: () => now, rng: createRng(3) });
  q.record(bankQ("a"), "wrong", 0);
  assert.equal(q.dueAcrossRuns(now + DAY), null, "a menet közben függő tétel nem menetek közötti");
  q.startRun();
  assert.equal(q.snapshot()[0]!.dueInRun, null);
  assert.equal(q.dueInRun(100), null);
  assert.equal(q.dueAcrossRuns(now)?.key, "bank:speed-quiz-math:a");
  assert.equal(q.dueAcrossRuns(now, new Set(["bank:speed-quiz-math:a"])), null, "exclude kihagyja");
  // Új példány ugyanazon a tárolón (új menet / újratöltés): megmarad, és esedékes.
  const q2 = createReviewQueue(storage, { now: () => now + 5000 });
  assert.equal(q2.dueAcrossRuns(now + 5000)?.key, "bank:speed-quiz-math:a");
  // A jól tudott tétel csak a térköz után esedékes; a legkorábban esedékes jön előbb.
  q2.record(bankQ("a"), "correct", 0);
  q2.record(bankQ("b"), "wrong", 1);
  q2.startRun();
  assert.equal(q2.dueAcrossRuns(now + 5000)?.key, "bank:speed-quiz-math:b");
  assert.equal(q2.dueAcrossRuns(now + 5000 + DAY - 1)?.key, "bank:speed-quiz-math:b");
});

test("(4) sérült JSON / dobó tároló → működik memóriában, kivétel nélkül", () => {
  for (const storage of [
    memoryStorage(),
    memoryStorage({ failGet: true }),
    memoryStorage({ failSet: true }),
    memoryStorage({ failGet: true, failSet: true }),
  ]) {
    storage.data.set(GAME_REVIEW_KEY, "{nem json");
    const q = createReviewQueue(storage, { now: () => T0, rng: createRng(1) });
    assert.doesNotThrow(() => q.record(bankQ("a"), "wrong", 0));
    assert.equal(q.size(), 1);
    assert.equal(q.dueInRun(6)?.key, "bank:speed-quiz-math:a");
    assert.doesNotThrow(() => q.startRun());
  }
  // Hibás tétel a tárolóban: kimarad, a jó megmarad.
  const good = { key: "x", box: 1, dueAt: T0, dueInRun: null, lastSeen: T0 - DAY, wrong: 1, correct: 1, payload: { kind: "grade", id: "g07-math-001" } };
  const storage = memoryStorage();
  storage.data.set(GAME_REVIEW_KEY, JSON.stringify({ v: 1, items: { "grade:g07-math-001": good, rossz: { box: 9 }, rossz2: null } }));
  const q = createReviewQueue(storage, { now: () => T0 });
  assert.equal(q.size(), 1);
  assert.deepEqual(q.snapshot()[0]!.payload, { kind: "grade", id: "g07-math-001" });
});

test("(5) ismeretlen v → üres", () => {
  const storage = memoryStorage();
  storage.data.set(GAME_REVIEW_KEY, JSON.stringify({ v: 2, items: { a: {} } }));
  assert.equal(createReviewQueue(storage, { now: () => T0 }).size(), 0);
  storage.data.set(GAME_REVIEW_KEY, JSON.stringify([1, 2, 3]));
  assert.equal(createReviewQueue(storage, { now: () => T0 }).size(), 0);
  // A tárolt alak { v: 1, items }.
  const q = createReviewQueue(storage, { now: () => T0, rng: createRng(2) });
  q.record(bankQ("a"), "wrong", 0);
  const stored = JSON.parse(storage.data.get(GAME_REVIEW_KEY)!);
  assert.equal(stored.v, 1);
  assert.deepEqual(Object.keys(stored.items), ["bank:speed-quiz-math:a"]);
});

test("(6) cap 400 felett a legnagyobb box, azon belül a legrégebben látott tétel dobódik", () => {
  assert.equal(REVIEW_CAP, 400);
  let now = T0;
  const q = createReviewQueue(null, { now: () => now, rng: createRng(4) });
  // 10 tétel box 2-ben (régi és új), a többi box 0-ban.
  for (let i = 0; i < 10; i++) {
    now += 1;
    q.record(bankQ(`hi${i}`), "wrong", 0);
    q.record(bankQ(`hi${i}`), "correct", 1);
    q.record(bankQ(`hi${i}`), "correct", 2);
  }
  for (let i = 0; i < 390; i++) {
    now += 1;
    q.record(bankQ(`lo${i}`), "wrong", 3);
  }
  assert.equal(q.size(), 400);
  now += 1;
  q.record(bankQ("new"), "wrong", 4);
  assert.equal(q.size(), 400);
  const keys = new Set(q.snapshot().map((it) => it.key));
  assert.ok(!keys.has("bank:speed-quiz-math:hi0"), "a legrégebben látott box 2-es tétel ment ki");
  assert.ok(keys.has("bank:speed-quiz-math:hi1"));
  assert.ok(keys.has("bank:speed-quiz-math:lo0"), "box 0 tétel marad");
  assert.ok(keys.has("bank:speed-quiz-math:new"));
  // Kisebb cap-pel is a szabály szerint.
  const small = createReviewQueue(null, { now: () => T0, rng: createRng(1), cap: 2 });
  small.record(bankQ("a"), "wrong", 0);
  small.record(bankQ("a"), "correct", 1);
  small.record(bankQ("b"), "wrong", 1);
  small.record(bankQ("c"), "wrong", 2);
  assert.deepEqual(small.snapshot().map((it) => it.key).sort(), ["bank:speed-quiz-math:b", "bank:speed-quiz-math:c"]);
});

test("(7) payload: szóbank → csak id, évfolyam-bank → id, tananyag / kézi bank → vágott pillanatkép", () => {
  const q = createReviewQueue(null, { now: () => T0, rng: createRng(5) });
  q.record({ key: "vocab:en:en0-family-001", quiz: { id: "v", prompt: "?", options: ["a", "b"], correctIndex: 0 }, source: "vocab", lang: "en" }, "wrong", 0);
  q.record({ key: "grade:g07-math-012", quiz: { id: "g", prompt: "?", options: ["a", "b"], correctIndex: 0 }, source: "grade" }, "wrong", 0);
  const long = "é".repeat(1000);
  q.record(
    {
      key: "mat:hosszu",
      quiz: { id: "m", prompt: long, options: [long, "b", "c", "d"], correctIndex: 3, explanation: long },
      source: "material",
      subject: "biology",
    },
    "timeout",
    0,
  );
  q.record(bankQ("k"), "wrong", 0);
  const byKey = new Map(q.snapshot().map((it) => [it.key, it.payload]));
  assert.deepEqual(byKey.get("vocab:en:en0-family-001"), { kind: "vocab", lang: "en", vocabId: "en0-family-001" });
  assert.deepEqual(byKey.get("grade:g07-math-012"), { kind: "grade", id: "g07-math-012" });
  const mat = byKey.get("mat:hosszu")!;
  assert.equal(mat.kind, "quiz");
  if (mat.kind !== "quiz") return;
  assert.equal(mat.source, "material");
  assert.equal(mat.subject, "biology");
  assert.equal(mat.quiz.prompt.length, PROMPT_MAX);
  assert.equal(mat.quiz.options[0]!.length, OPTION_MAX);
  assert.equal(mat.quiz.explanation!.length, EXPLANATION_MAX);
  assert.equal(mat.quiz.correctIndex, 3);
  assert.deepEqual(mat.quiz.options.slice(1), ["b", "c", "d"]);
  const bank = byKey.get("bank:speed-quiz-math:k")!;
  assert.equal(bank.kind === "quiz" && bank.source, "bank");
});

test("review #444: az esedékessége után 60 nappal még ott lévő (elhagyott / törölt) tétel kikerül; 59 napos marad", () => {
  assert.equal(REVIEW_STALE_MS, 60 * DAY);
  const storage = memoryStorage();
  const item = (dueAt: number) => ({ box: 0, dueAt, dueInRun: null, lastSeen: dueAt, wrong: 1, correct: 0, payload: { kind: "grade", id: "g" } });
  storage.data.set(GAME_REVIEW_KEY, JSON.stringify({ v: 1, items: { "grade:old": item(T0 - 61 * DAY), "grade:ok": item(T0 - 59 * DAY), "grade:future": item(T0 + 3 * DAY) } }));
  const q = createReviewQueue(storage, { now: () => T0, rng: createRng(1) });
  assert.deepEqual(q.snapshot().map((it) => it.key).sort(), ["grade:future", "grade:ok"]);
  // Menet közben is: a következő íráskor a közben elavult tétel kimegy.
  let now = T0;
  const q2 = createReviewQueue(memoryStorage(), { now: () => now, rng: createRng(2) });
  q2.record(bankQ("a"), "wrong", 0);
  now = T0 + 61 * DAY;
  q2.record(bankQ("b"), "wrong", 0);
  assert.deepEqual(q2.snapshot().map((it) => it.key), ["bank:speed-quiz-math:b"]);
});

test("determinizmus és sorrend: dueInRun a legkorábbi esedékességet adja; exclude kihagy", () => {
  const q = createReviewQueue(null, { now: () => T0, rng: createRng(7) });
  q.record(bankQ("a"), "wrong", 0);
  q.record(bankQ("b"), "wrong", 1);
  const [a, b] = ["a", "b"].map((k) => q.snapshot().find((it) => it.key.endsWith(`:${k}`))!);
  const first = a!.dueInRun! <= b!.dueInRun! ? a! : b!;
  assert.equal(q.dueInRun(100)?.key, first.key);
  assert.equal(q.dueInRun(100, new Set([first.key]))?.key, (first === a ? b : a)!.key);
  const sig = (seed: number) => {
    const r = createReviewQueue(null, { now: () => T0, rng: createRng(seed) });
    for (let i = 0; i < 20; i++) r.record(bankQ(`x${i}`), "wrong", i);
    return r.snapshot().map((it) => it.dueInRun).join(",");
  };
  assert.equal(sig(11), sig(11));
});
