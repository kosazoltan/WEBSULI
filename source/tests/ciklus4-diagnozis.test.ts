import test from "node:test";
import assert from "node:assert/strict";
import { autofixBankPacket } from "../server/studio/tools/bank-packet-autofix";
import { sampleScoreProblem } from "../server/studio/experience-builder";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import type { OpenTask } from "../shared/lesson-experience";

/* Spec 2026-10-21-ciklus4: célzott minta-diagnózis (kifejezés / sorrend) + a typedAnswers.value szám → szöveg. */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Write it in English.", required: [["sofa"]], bonus: [], minWords: 3, needsSentence: false,
  sample: "There are a sofa in my house.", mode: "written", requiredPhrases: [["there is a sofa"]], ...over,
}) as OpenTask;

test("ciklus4: a minta-üzenet megnevezi a pontosan hiányzó kifejezést (a modell tudja, mit javítson)", () => {
  const t = task();
  const score = evaluateOpenAnswer(t.sample, t);
  assert.notEqual(score.score, 1, "előfeltétel: a minta nem teljes pont");
  const msg = sampleScoreProblem(t, score.reason, 7);
  assert.match(msg, /PONTOSAN[^\n]*hiányzó kifejezések \(requiredPhrases\): \[\["there is a sofa"\]\]/);
  assert.doesNotMatch(msg, /requiredOrder/);
});

test("ciklus4: a sorrendi eltérést is megnevezi; kifejezés és sorrend nélkül a régi üzenet", () => {
  const t = task({ requiredPhrases: undefined, required: [["négyzetre"], ["szorzunk"]], sample: "Először szorzunk, utána négyzetre emelünk.",
    requiredOrder: [["négyzetre"], ["szorzunk"]] });
  const msg = sampleScoreProblem(t, "x", 5);
  assert.match(msg, /nem a requiredOrder sorrendjében[^\n]*négyzetre/);
  const plain = sampleScoreProblem(task({ requiredPhrases: undefined }), "x", 5);
  assert.doesNotMatch(plain, /requiredPhrases|requiredOrder/);
});

test("ciklus4: typedAnswers.value szám → szöveg (azonos érték), a szöveghez nem nyúl", () => {
  const p = { methods: [], quiz: [], tasks: [{ id: "t2", q: "3·4?", sample: "12", required: [["tizenkettő"]], bonus: [], minWords: 1, needsSentence: false, mode: "written",
    typedAnswers: [{ part: "a", kind: "number", value: 12 }, { part: "b", kind: "number", value: "7" }] }] };
  const { packet, fixes } = autofixBankPacket(p, {} as never);
  assert.deepEqual((packet as typeof p).tasks[0].typedAnswers.map((x) => x.value), ["12", "7"]);
  assert.ok(fixes.some((f) => /typedAnswers.value szövegként \(12\)/.test(f)), JSON.stringify(fixes));
});

test("ciklus4: a lektor blokkoló jegyzeteinek archívuma — körönként, vágva, legfeljebb 200", async () => {
  const { appendLektorArchive } = await import("../server/studio/single-run/engine");
  const a = appendLektorArchive(undefined, 0, [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.tasks.3", message: "x".repeat(900) }]);
  assert.deepEqual(Object.keys(a[0] as object).sort(), ["blockPath", "kind", "message", "round", "subkind"]);
  assert.equal((a[0] as { message: string }).message.length, 600);
  const many = appendLektorArchive(a, 1, Array.from({ length: 250 }, () => ({ kind: "coverage_gap", message: "m" })));
  assert.equal(many.length, 200);
  assert.equal((many[1] as { round: number }).round, 1);
});

test("ciklus4: a félbevágott emoji (magányos fél-karakter) a modellhívás előtt U+FFFD lesz; az ép emoji és szöveg érintetlen", async () => {
  const { wellFormed } = await import("../server/studio/single-run/conversation");
  const cut = "Kocka 🧊 térfogata".slice(0, 7);
  const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
  assert.ok(isHighSurrogate(cut.charCodeAt(cut.length - 1)), "előfeltétel: a vágás magányos felső fél-karaktert hagy");
  assert.equal(wellFormed(cut), "Kocka \uFFFD");
  assert.equal(wellFormed("Kocka 🧊 térfogata"), "Kocka 🧊 térfogata");
  assert.equal(wellFormed("\uDC00a"), "\uFFFDa", "magányos alsó fél is");
  const lone = [...wellFormed(cut)].some((ch) => ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff);
  assert.equal(lone, false, "nincs magányos fél-karakter");
});
