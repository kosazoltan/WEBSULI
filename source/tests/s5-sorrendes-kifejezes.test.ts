import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOpenAnswer, isComputedTask, isTypedTask, missingPhrases } from "../shared/lesson-experience-score";
import { openTaskSchema, scoringVersionFor, type OpenTask } from "../shared/lesson-experience";
import { PHRASE_SCORING_VERSION, LESSON_SCORING_VERSION, scoringGate } from "../shared/answer-value";
import { answerKeyNotes, answerKeyProblems, blockingWrongCases, type AnswerKeyCases } from "../shared/answer-key-tests";
import { arbiterCacheKey, buildArbiterUserMessage } from "../server/arbiter/arbiter";
import { ANSWER_KEY_SYSTEM, answerKeyCacheKey, answerKeyUserMessage } from "../server/studio/answer-key-writer";
import { rubricHash } from "../shared/lesson-result-email";
import { normalizeStrictPacket } from "../server/studio/bank-schema";
import { alignTaskToSample } from "../server/studio/bank-normalize";

/* Spec 2026-10-20-s5-sorrendes-kifejezes (S5a): sorrendérzékeny kötelező kifejezés (nyelvtani alak / szórend). */

const task = (over: Partial<OpenTask> = {}): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Írd le angolul: van egy kanapé és sok szék a házamban.",
  required: [["sofa"], ["chairs"]], bonus: [], minWords: 4, needsSentence: false,
  sample: "There is a sofa in my house. There are many chairs.", mode: "written",
  requiredPhrases: [["there is a sofa"], ["there are many chairs"]], ...over,
}) as OpenTask;

test("S5a: a helyes alak teljes pont; a felcserélt egyeztetés („There are a sofa… There is many chairs”) nem", () => {
  const t = task();
  assert.equal(evaluateOpenAnswer(t.sample, t).state, "ok");
  assert.equal(evaluateOpenAnswer("There is a sofa and there are many chairs in my house.", t).state, "ok");
  const wrong = evaluateOpenAnswer("There are a sofa in my house. There is many chairs.", t);
  assert.notEqual(wrong.state, "ok");
  assert.match(wrong.reason, /nyelvtani alak vagy szórend/);
  assert.deepEqual(missingPhrases("There are a sofa in my house. There is many chairs.", t), t.requiredPhrases);
});

test("S5a: a kifejezés pontos (tűrés és toldalék nélkül) és egymás utáni; az aposztróf elválaszt", () => {
  const t = task({ required: [["animals"]], requiredPhrases: [["mustn't feed", "must not feed"]], sample: "You mustn't feed the animals.", minWords: 3 });
  assert.equal(evaluateOpenAnswer("You mustn't feed the animals.", t).state, "ok");
  assert.equal(evaluateOpenAnswer("You must not feed the animals.", t).state, "ok", "VAGY-alternatíva");
  assert.notEqual(evaluateOpenAnswer("You don't must feed the animals.", t).state, "ok");
  assert.notEqual(evaluateOpenAnswer("You mustn't feeds the animals.", t).state, "ok", "feeds ≠ feed");
  assert.notEqual(evaluateOpenAnswer("Feed you mustn't the animals.", t).state, "ok", "a szórend számít");
  const q = task({ required: [["go"]], requiredPhrases: [["must he go"]], sample: "Must he go now? No, he mustn't.", minWords: 3 });
  assert.notEqual(evaluateOpenAnswer("Does he must go now? No, he doesn't.", q).state, "ok");
});

test("S5a: a kifejezéscsoport a kötelezőkkel együtt számít a fele-szabályba", () => {
  const t = task();
  // 2 fogalom + 2 kifejezés = 4 csoport; 2 találat (a két fogalom) = fele → 0,5
  assert.equal(evaluateOpenAnswer("My house: sofa, chairs, nothing else here.", t).score, 0.5);
  assert.equal(evaluateOpenAnswer("Nothing to say about this house today.", t).score, 0);
});

test("S5a: kifejezés nélkül a pontozás változatlan (v1 út), a típusos ismérvek", () => {
  const { requiredPhrases: _p, ...plain } = task();
  assert.equal(isTypedTask(plain as OpenTask), false, "kifejezés nélkül v1");
  assert.equal(isTypedTask(task()), true, "kifejezéssel v2");
  assert.equal(isComputedTask(task()), false, "a kifejezéses feladat nem számolós: tesztelt és kalibrált");
  assert.equal(evaluateOpenAnswer("There are a sofa in my house. There is many chairs.", plain as OpenTask).state, "ok", "a régi, sorrendvak viselkedés");
});

test("S5a: pontozási verzió 4 a kifejezéses leckénél; a régi (3-as) kliens frissítést kap", () => {
  assert.equal(LESSON_SCORING_VERSION, 4);
  assert.equal(scoringVersionFor([task()]), PHRASE_SCORING_VERSION);
  const { requiredPhrases: _p, ...plain } = task();
  assert.equal(scoringVersionFor([plain as OpenTask]), undefined, "típus nélküli bank: változatlan");
  assert.equal(scoringGate(4, "3").ok, false);
  assert.equal(scoringGate(4, "4").ok, true);
});

test("S5a: J1 — a szórend-cserés hibás próba kifejezéssel már megkülönböztethető, tehát blokkol", () => {
  const t = task({ required: [["she"], ["her"], ["kitchen"]], requiredPhrases: [["she is in the kitchen"], ["see her"]], sample: "She is in the kitchen. Can you see her?", minWords: 4 });
  const cases: AnswerKeyCases = {
    correct: ["She is in the kitchen. Can you see her?", "She is in the kitchen, can you see her?", "Can you see her? She is in the kitchen."],
    wrong: [{ kind: "forditott", text: "Her is in the kitchen. Can you see she?" }, { kind: "temaidegen", text: "I like apples." }],
  };
  assert.equal(blockingWrongCases(t, cases).length, 2, "a szórend-csere nem J1 (a kifejezést nem teljesíti)");
  assert.deepEqual(answerKeyProblems(t, cases), [], "a kifejezés kizárja a hibás alakot");
  assert.deepEqual(answerKeyNotes(t, cases), []);
  const { requiredPhrases: _p, ...plain } = t;
  assert.equal(blockingWrongCases(plain as OpenTask, cases).length, 1, "kifejezés nélkül J1 (megkülönböztethetetlen)");
});

test("S5a: a döntőbíró-kulcs és a rubrika-lenyomat kifejezés nélkül változatlan, kifejezéssel eltér", () => {
  const { requiredPhrases: _p, ...plain } = task();
  const a = "There is a sofa.";
  assert.notEqual(arbiterCacheKey(task(), a), arbiterCacheKey(plain as OpenTask, a));
  assert.equal(arbiterCacheKey(plain as OpenTask, a), arbiterCacheKey({ ...(plain as OpenTask), requiredPhrases: undefined }, a));
  assert.notEqual(rubricHash(task()), rubricHash(plain as OpenTask));
});

test("S5a: a séma és a szigorú bank-kimenet elfogadja; a null / üres lista hiányzó mező", () => {
  assert.ok(openTaskSchema.safeParse(task()).success);
  assert.equal(openTaskSchema.safeParse(task({ requiredPhrases: [] })).success, false, "üres lista nem érvényes a helyi sémában");
  const packet = normalizeStrictPacket({ tasks: [{ ...task(), requiredPhrases: null, typedAnswers: null, requiredDistinct: null }], methods: [], quiz: [] }) as { tasks: Array<Record<string, unknown>> };
  assert.equal("requiredPhrases" in packet.tasks[0], false);
  const empty = normalizeStrictPacket({ tasks: [{ ...task(), requiredPhrases: [], typedAnswers: null, requiredDistinct: null }], methods: [], quiz: [] }) as { tasks: Array<Record<string, unknown>> };
  assert.equal("requiredPhrases" in empty.tasks[0], false);
});

test("S5a: a minta-igazítás a kifejezéses feladat szócsoportjait is igazítja (a kifejezés nélkül próbálva)", () => {
  const t = task({ required: [["sofas"], ["chairs"]] });
  assert.equal(alignTaskToSample(t), true);
  assert.ok(t.required[0].length > 1, JSON.stringify(t.required));
  assert.deepEqual(t.requiredPhrases, task().requiredPhrases, "a kifejezés érintetlen");
});

test("review #341 (P1): a döntőbíró kifejezéses feladatnál megkapja a helyes alakot és a nyelvtani szabályt; más feladatnál a prompt változatlan", () => {
  const msg = buildArbiterUserMessage(task(), "", "There are a sofa.");
  assert.match(msg, /NYELVTANI ALAK/);
  assert.match(msg, /there is a sofa/);
  assert.match(msg, /nem lehet "ok"/);
  const { requiredPhrases: _p, ...plain } = task();
  assert.equal(buildArbiterUserMessage(plain as OpenTask, "", "x").includes("NYELVTANI ALAK"), false);
});

test("review #341 (P2): a tesztíró a kifejezéses feladatnál alak- és szórendhibás próbát kér; a gyorsítótár-kulcs csak ekkor bővül", () => {
  assert.match(ANSWER_KEY_SYSTEM, /KIVÉTEL — ha a feladatnál "kifejezesek"/);
  const ctx = { concepts: [], classroom: 5 } as unknown as Parameters<typeof answerKeyUserMessage>[1];
  assert.match(answerKeyUserMessage([task()], ctx), /"kifejezesek":\[\["there is a sofa"\]/);
  const { requiredPhrases: _p, ...plain } = task();
  assert.equal(answerKeyUserMessage([plain as OpenTask], ctx).includes("kifejezesek"), false);
  assert.notEqual(answerKeyCacheKey(task()), answerKeyCacheKey(plain as OpenTask));
});
