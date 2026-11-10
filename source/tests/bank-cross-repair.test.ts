import test from "node:test";
import assert from "node:assert/strict";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { normalizeBankPacket } from "../server/studio/bank-normalize";
import { experiencePacketSchema, questionKey, quizDuplicateKey } from "../shared/lesson-experience";
import { planLessonBank } from "../shared/lesson-bank-plan";
import { lessonSchema } from "../shared/lesson-schema";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-11-10-gyartas-meres: J1 (célzott javítás teljes újragyártás helyett) és J1b (kiválasztó kérdés kulcsa). */

test("J1b — quizDuplicateKey: a kiválasztó kérdés kulcsa az opciókészlettel együtt; más kérdésé változatlan", () => {
  const a = { question: "Melyik állítás hamis?", options: ["A szén megújuló.", "A szél megújuló.", "A kőolaj fosszilis."] };
  const b = { question: "Melyik állítás hamis?", options: ["|−9| = 9", "A 0 ellentettje 0.", "|9| = −9"] };
  assert.notEqual(quizDuplicateKey(a), quizDuplicateKey(b), "eltérő opciók: két különböző kérdés");
  assert.equal(quizDuplicateKey(a), quizDuplicateKey({ question: "melyik állítás hamis", options: [...a.options].reverse() }), "azonos opciókészlet más sorrendben: ismétlődés");
  for (const stem of ["Melyik állítás igaz?", "Melyik mondat helyes?", "Melyik az igaz állítás?", "Melyik kijelentés téves?", "Melyik megállapítás helytelen?"]) {
    assert.notEqual(quizDuplicateKey({ question: stem, options: a.options }), quizDuplicateKey({ question: stem, options: b.options }), stem);
  }
  // Nem kiválasztó kérdés: a kulcs a kérdés szövege — eltérő opciókkal is ismétlődés.
  for (const question of ["Melyik a legnagyobb szám?", "Mennyi 8 : 2?", "Mi a Nílus?", "Melyik állítás hamis az energiáról?"]) {
    assert.equal(quizDuplicateKey({ question, options: a.options }), questionKey(question), question);
    assert.equal(quizDuplicateKey({ question, options: a.options }), quizDuplicateKey({ question, options: b.options }), question);
  }
  assert.equal(quizDuplicateKey({ question: "Melyik állítás hamis?" }), questionKey("Melyik állítás hamis?"), "opció nélkül a kérdés a kulcs");
});

test("J1b — a csomag-séma és a gépi normalizálás nem veszi ismétlődésnek az eltérő opciójú kiválasztó kérdést", () => {
  const e = standardFusionFixture().experience!;
  const duplicateIssues = (quiz: typeof e.quiz) => {
    const parsed = experiencePacketSchema.safeParse({ ...e, quiz });
    return parsed.success ? [] : parsed.error.issues.map((i) => i.message).filter((m) => m.includes("Ismétlődő kérdés"));
  };
  const selector = e.quiz.map((q, n) => (n < 2 ? { ...q, question: "Melyik állítás hamis?" } : q));
  assert.notDeepEqual([...selector[0].options].sort(), [...selector[1].options].sort(), "a fixture két kérdésének opciói eltérnek");
  assert.deepEqual(duplicateIssues(selector), []);
  const sameOptions = selector.map((q, n) => (n === 1 ? { ...q, options: [...selector[0].options].reverse(), feedbackPerOption: [...selector[0].feedbackPerOption].reverse(), correctIndex: selector[0].options.length - 1 - selector[0].correctIndex } : q));
  assert.equal(duplicateIssues(sameOptions).length, 1, "azonos opciókészlettel továbbra is ismétlődés");
  const specific = e.quiz.map((q, n) => (n < 2 ? { ...q, question: "Mi a terület?" } : q));
  assert.equal(duplicateIssues(specific).length, 1, "nem kiválasztó kérdésnél az opció nem számít");

  const packet = { tasks: [], quiz: structuredClone(selector.slice(0, 2)) };
  const prior = { tasks: [], quiz: [{ question: "Melyik állítás hamis?", options: ["x", "y", "z"] }] };
  assert.deepEqual(normalizeBankPacket(packet as never, prior, { tasks: 0, quiz: 0 }, questionKey, quizDuplicateKey), []);
  assert.equal(packet.quiz.length, 2, "egyik kiválasztó kérdés sem kerül ki");
  const dropped = { tasks: [], quiz: structuredClone(selector.slice(0, 2)) };
  normalizeBankPacket(dropped as never, { tasks: [], quiz: [{ question: "Melyik állítás hamis?", options: [...selector[0].options] }] }, { tasks: 0, quiz: 0 }, questionKey, quizDuplicateKey);
  assert.deepEqual(dropped.quiz.map((q) => q.id), [selector[1].id], "a korábbival azonos opciókészletű kikerül");
});

/** Két egység, egyszerre épülnek; a 2. egység válasza `second(sectionIndex)`. A hívások (fejezet + kérés) naplózva. */
async function buildTwoUnits(second: (suffix: string) => { methods: unknown[]; tasks: unknown[]; quiz: unknown[]; glossary: unknown[] }, repair: (user: string) => unknown) {
  const base = standardFusionFixture(), e = base.experience!;
  const lesson = lessonSchema.parse({ ...base, experience: undefined, sections: [base.sections[0], { ...base.sections[0], heading: "Második fejezet ugyanarról" }] });
  assert.equal(planLessonBank(lesson).units.length, 2, "két egység");
  const calls: Array<{ sectionIndex: number; user: string }> = [];
  const logs: string[] = [];
  const result = await buildLessonExperience(lesson, [], { concurrency: 3, call: async (_system, user) => {
    await new Promise((r) => setTimeout(r, 2));
    const sectionIndex = Number(/sectionIndex=(\d+)/.exec(user)![1]);
    calls.push({ sectionIndex, user });
    if (sectionIndex === 0) return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
    return calls.filter((c) => c.sectionIndex === 1).length === 1 ? second(" (B)") : repair(user);
  }, onToolFix: (tool, fixes) => { logs.push(...fixes.map((f) => `${tool}: ${f}`)); } });
  return { e, calls, result, logs };
}

test("J1 — egyetlen ütköző kvízkérdés: a kész csomag célzott javítást kap, nem épül újra", async () => {
  const e0 = standardFusionFixture().experience!;
  const second = (suffix: string) => ({
    methods: e0.methods.map((m) => ({ ...m, sectionIndex: 1, title: m.title + suffix, prompt: m.prompt + suffix })),
    tasks: e0.tasks.map((t) => ({ ...t, sectionIndex: 1, q: t.q + suffix })),
    // a kvíz ELSŐ kérdése megegyezik az 1. egységével (a két egység nem látta egymást)
    quiz: e0.quiz.map((q, n) => ({ ...q, sectionIndex: 1, question: n === 0 ? q.question : q.question + suffix })),
    glossary: [],
  });
  const { e, calls, result } = await buildTwoUnits(second, (user) => {
    assert.match(user, /JAVÍTÁSI MÓD: a teljes csomag már megvan/, "a harmadik hívás javítómódú");
    assert.ok(user.includes(`Ismétlődő kérdés egy korábbi csomaggal: ${e0.quiz[0].id} („`), "a hiba megnevezi a tételt");
    // csak az ütköző tétel megy vissza — a többi a kész csomagból marad
    return { quiz: [{ ...second(" (B)").quiz[0], question: e0.quiz[0].question + " (új változat)" }] };
  });
  // A fixture csomagja a tartalék fölött áll: az ütköző kvíztételt a gépi normalizálás veszi ki — a kész csomag modellhívás nélkül
  // átvehető (a javítómódú hívás útját a kapukérdéses teszt méri, ott a tétel nem vehető ki).
  assert.equal(calls.filter((c) => c.sectionIndex === 1).length, 1, "nincs újragyártás és nincs javítóhívás a 2. egységre");
  const unit1 = result.quiz.filter((q) => q.sectionIndex === 1).map((q) => q.question);
  assert.equal(new Set(result.quiz.map((q) => q.question)).size, result.quiz.length, "nincs ismétlődő kérdés");
  assert.equal(unit1.filter((q) => q.endsWith(" (B)")).length, e.quiz.length - 1, "a többi kvíztétel az első válaszból való");
  assert.equal(result.tasks.filter((t) => t.sectionIndex === 1 && t.q.endsWith(" (B)")).length, e.tasks.length, "a feladatok az első válaszból valók");
});

test("J1 — csomagok közti kapukérdés-ismétlődés: tételt nevez meg, célzottan javul", async () => {
  const e0 = standardFusionFixture().experience!;
  const gateIds = e0.methods.filter((m) => m.kind === "gate").map((m) => m.id);
  assert.ok(gateIds.length > 0, "a fixture-ben van kapukérdés");
  const second = (suffix: string, gateSuffix = "") => ({
    // a kapukérdések szövege megegyezik az 1. egységével; minden más eltér
    methods: e0.methods.map((m) => ({ ...m, sectionIndex: 1, title: m.title + suffix, prompt: m.kind === "gate" ? m.prompt + gateSuffix : m.prompt + suffix })),
    tasks: e0.tasks.map((t) => ({ ...t, sectionIndex: 1, q: t.q + suffix })),
    quiz: e0.quiz.map((q) => ({ ...q, sectionIndex: 1, question: q.question + suffix })),
    glossary: [],
  });
  const { calls, result } = await buildTwoUnits((suffix) => second(suffix), (user) => {
    assert.match(user, /JAVÍTÁSI MÓD: a teljes csomag már megvan/, "kapukérdés-ütközésnél is javítómód");
    for (const id of gateIds) assert.ok(user.includes(`Ismétlődő kérdés egy korábbi csomaggal: ${id} („`), `megnevezett kapukérdés: ${id}`);
    return { methods: second(" (B)", " (másik kapu)").methods.filter((m) => m.kind === "gate") };
  });
  assert.equal(calls.filter((c) => c.sectionIndex === 1).length, 2, "egy javítóhívás");
  const gates = result.methods.filter((m) => m.kind === "gate").map((m) => m.prompt);
  assert.equal(new Set(gates.map(questionKey)).size, gates.length, "nincs ismétlődő kapukérdés");
  assert.equal(result.tasks.filter((t) => t.sectionIndex === 1 && t.q.endsWith(" (B)")).length, e0.tasks.length, "a feladatok változatlanok");
});

test("J1b — csomagok közti „Melyik állítás hamis?” eltérő opciókkal: nincs javítóhívás", async () => {
  const e0 = standardFusionFixture().experience!;
  const stem = "Melyik állítás hamis?";
  const base = standardFusionFixture();
  const lesson = lessonSchema.parse({ ...base, experience: undefined, sections: [base.sections[0], { ...base.sections[0], heading: "Második fejezet ugyanarról" }] });
  const calls: number[] = [];
  const packetFor = (sectionIndex: number, suffix: string) => ({
    methods: e0.methods.map((m) => ({ ...m, sectionIndex, title: m.title + suffix, prompt: m.prompt + suffix })),
    tasks: e0.tasks.map((t) => ({ ...t, sectionIndex, q: t.q + suffix })),
    // mindkét egység ELSŐ kvízkérdése ugyanaz a kiválasztó kérdés, de az opciók szövege eltér
    quiz: e0.quiz.map((q, n) => ({ ...q, sectionIndex, question: n === 0 ? stem : q.question + suffix, ...(n === 0 ? { options: q.options.map((o) => o + suffix) } : {}) })),
    glossary: [],
  });
  const result = await buildLessonExperience(lesson, [], { concurrency: 3, call: async (_system, user) => {
    await new Promise((r) => setTimeout(r, 2));
    const sectionIndex = Number(/sectionIndex=(\d+)/.exec(user)![1]);
    calls.push(sectionIndex);
    return packetFor(sectionIndex, sectionIndex === 0 ? " (A)" : " (B)");
  } });
  assert.deepEqual(calls.sort(), [0, 1], "nincs harmadik hívás");
  assert.equal(result.quiz.filter((q) => q.question === stem).length, 2, "mindkét kiválasztó kérdés megmaradt");
});
