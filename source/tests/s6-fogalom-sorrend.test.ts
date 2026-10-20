import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOpenAnswer, isComputedTask, isTypedTask, missingOrder } from "../shared/lesson-experience-score";
import { experiencePacketSchema, openTaskSchema, scoringVersionFor, type OpenTask } from "../shared/lesson-experience";
import { ORDER_SCORING_VERSION, LESSON_SCORING_VERSION, scoringGate } from "../shared/answer-value";
import { answerKeyNotes, answerKeyProblems, blockingWrongCases, type AnswerKeyCases } from "../shared/answer-key-tests";
import { arbiterCacheKey, buildArbiterUserMessage } from "../server/arbiter/arbiter";
import { ANSWER_KEY_SYSTEM, answerKeyCacheKey, answerKeyUserMessage } from "../server/studio/answer-key-writer";
import { rubricHash } from "../shared/lesson-result-email";
import { normalizeStrictPacket } from "../server/studio/bank-schema";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-10-20-s6-fogalom-sorrend (S6a): a fogalmak kötelező sorrendje (sorrendi / műveleti sorrend feladat). */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Milyen sorrendben számolod ki a 4 · 3² értékét?",
  required: [["négyzetre", "négyzet"], ["szorzunk", "szoroz", "szorzás"]], bonus: [], minWords: 4, needsSentence: false,
  sample: "Először négyzetre emelünk, utána 4-gyel szorzunk.", mode: "written",
  requiredOrder: [["négyzetre", "négyzet"], ["szorzunk", "szoroz", "szorzás"]], ...over,
}) as OpenTask;

test("S6a: a helyes sorrend teljes pont; a fordított legfeljebb 0,5, a sorrend indoklásával", () => {
  const t = task();
  assert.equal(evaluateOpenAnswer(t.sample, t).state, "ok");
  const wrong = evaluateOpenAnswer("Először 4-gyel szorzunk, és csak utána emelünk négyzetre.", t);
  assert.notEqual(wrong.state, "ok");
  assert.match(wrong.reason, /sorrendje nem megfelelő/);
  assert.equal(missingOrder("Először 4-gyel szorzunk, és csak utána emelünk négyzetre.", t), true);
});

test("S6a: a köztes szavak, a ragozás és a szórend máshol szabad (tűrő fogalomillesztés)", () => {
  const t = task();
  for (const a of ["A hatványozás az első: négyzetre emeljük a hármat, majd a négyzetet néggyel szorzunk.", "Négyzet előbb, a szorzás csak utána jön."]) {
    assert.equal(missingOrder(a, t), false, a);
  }
});

test("S6a: hiányzó sorrendi csoport → a feltétel nem teljesül; ismétlődésnél az első előfordulás számít", () => {
  const t = task();
  assert.equal(missingOrder("Először négyzetre emelünk.", t), true, "a szorzás hiányzik");
  assert.equal(missingOrder("Négyzetre emelünk, aztán szorzunk; a szorzás után nem emelünk újra négyzetre.", t), false, "első előfordulás");
});

test("S6a: sorrend nélkül a pontozás változatlan (v1), a típusos ismérvek, verzió 5", () => {
  const { requiredOrder: _o, ...plain } = task();
  assert.equal(isTypedTask(plain as OpenTask), false);
  assert.equal(isTypedTask(task()), true);
  assert.equal(isComputedTask(task()), false, "a sorrendi feladat tesztelt és kalibrált");
  assert.equal(evaluateOpenAnswer("Először 4-gyel szorzunk, és csak utána emelünk négyzetre.", plain as OpenTask).state, "ok", "a régi, sorrendvak viselkedés");
  assert.equal(LESSON_SCORING_VERSION, 5);
  assert.equal(scoringVersionFor([task()]), ORDER_SCORING_VERSION);
  assert.equal(scoringGate(5, "4").ok, false);
});

test("S6a: a sorrendi bank csomagsémája 5-ös verziót követel", () => {
  const e = standardFusionFixture().experience!;
  const withOrder = { ...e, tasks: e.tasks.map((x, i) => (i === 0 ? { ...x, requiredOrder: [[x.required[0][0]], ["xyz"]] } : x)) };
  for (const v of [undefined, 3, 4]) assert.equal(experiencePacketSchema.safeParse({ ...withOrder, scoringVersion: v }).success, false, String(v));
  assert.equal(experiencePacketSchema.safeParse({ ...withOrder, scoringVersion: 5 }).success, true);
});

test("S6a: J1 — a fordított sorrendű próba sorrendi szabállyal megkülönböztethető, tehát blokkol (és a rubrika kizárja)", () => {
  const t = task();
  const cases: AnswerKeyCases = {
    correct: ["Először négyzetre emelünk, utána 4-gyel szorzunk.", "Először négyzetre emelünk, aztán szorzunk.", "Négyzetre emelés, majd szorzás."],
    wrong: [{ kind: "forditott", text: "Először 4-gyel szorzunk, utána négyzetre emelünk." }, { kind: "temaidegen", text: "Az összeadás kommutatív." }],
  };
  assert.equal(blockingWrongCases(t, cases).length, 2);
  assert.deepEqual(answerKeyProblems(t, cases), []);
  assert.deepEqual(answerKeyNotes(t, cases), []);
  const { requiredOrder: _o, ...plain } = t;
  assert.equal(blockingWrongCases(plain as OpenTask, cases).length, 1, "sorrend nélkül J1 (megkülönböztethetetlen)");
});

test("S6a: a döntőbíró és a tesztíró ismeri a sorrendet; a kulcsok csak sorrendnél bővülnek", () => {
  const t = task();
  const { requiredOrder: _o, ...plain } = t;
  assert.match(buildArbiterUserMessage(t, "", "x"), /SORREND .*a fordított vagy felcserélt sorrend nem lehet "ok"/);
  assert.equal(buildArbiterUserMessage(plain as OpenTask, "", "x").includes("SORREND"), false);
  assert.match(ANSWER_KEY_SYSTEM, /KIVÉTEL — ha a feladatnál "sorrend"/);
  const ctx = { concepts: [], classroom: 9 } as unknown as Parameters<typeof answerKeyUserMessage>[1];
  assert.match(answerKeyUserMessage([t], ctx), /"sorrend":\[\["négyzetre"/);
  assert.notEqual(answerKeyCacheKey(t), answerKeyCacheKey(plain as OpenTask));
  assert.notEqual(arbiterCacheKey(t, "x"), arbiterCacheKey(plain as OpenTask, "x"));
  assert.notEqual(rubricHash(t), rubricHash(plain as OpenTask));
});

test("S6a: séma és szigorú bank-kimenet", () => {
  assert.ok(openTaskSchema.safeParse(task()).success);
  assert.equal(openTaskSchema.safeParse(task({ requiredOrder: [["egy"]] })).success, false, "legalább 2 csoport");
  const packet = normalizeStrictPacket({ tasks: [{ ...task(), requiredOrder: null, requiredPhrases: null, typedAnswers: null, requiredDistinct: null }], methods: [], quiz: [] }) as { tasks: Array<Record<string, unknown>> };
  assert.equal("requiredOrder" in packet.tasks[0], false);
});
