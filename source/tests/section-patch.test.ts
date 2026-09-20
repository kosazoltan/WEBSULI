import test from "node:test";
import assert from "node:assert/strict";
import { sectionIndexOfPath, sectionOfFlatBlock, targetedRepairSections, parseSectionPatch, mergeSectionPatches } from "../server/studio/section-patch";
import { falseArithmeticClaims, evaluateExpression, arithmeticClaimProblems } from "../server/studio/tools/arithmetic-claims";
import { lessonSchema } from "../shared/lesson-schema";

/* Spec 2026-09-19 §6 — célzott szerzői javítás: csak a kifogásolt fejezet változik. */

const lesson = lessonSchema.parse({
  title: "T", subject: "Matematika", classroom: 5, mapId: "m1", sourceOnly: true, misconceptions: [{ conceptId: "c1", text: "tévhit" }],
  sections: [
    { heading: "A", probaEnabled: true, blocks: [{ kind: "explain", text: "Első fejezet szövege.", depth: "core", readAloud: false, coversConceptIds: ["c1"] }, { kind: "recap", bullets: ["a"] }] },
    { heading: "B", probaEnabled: true, blocks: [{ kind: "explain", text: "Második fejezet szövege.", depth: "core", readAloud: false, coversConceptIds: ["c2"] }] },
    { heading: "C", probaEnabled: true, blocks: [{ kind: "explain", text: "Harmadik fejezet szövege.", depth: "core", readAloud: false, coversConceptIds: ["c3"] }] },
  ],
});

test("blockPath és lapos blokkindex → fejezet", () => {
  assert.equal(sectionIndexOfPath("3.2"), 3);
  assert.equal(sectionIndexOfPath("section.1"), 1);
  assert.equal(sectionIndexOfPath("sections.4"), 4);
  assert.equal(sectionIndexOfPath("sections[2].blocks[0]"), 2);
  assert.equal(sectionIndexOfPath("experience.quiz.3"), null);
  assert.equal(sectionIndexOfPath(undefined), null);
  assert.equal(sectionOfFlatBlock(lesson, 0), 0);
  assert.equal(sectionOfFlatBlock(lesson, 2), 1);
  assert.equal(sectionOfFlatBlock(lesson, 3), 2);
  assert.equal(sectionOfFlatBlock(lesson, 9), null);
});

test("célzott fejezetlista: fejezethez kötött jegyzetek és kapu-leletek; lecke-szintű kifogásnál teljes újraírás", () => {
  assert.deepEqual(targetedRepairSections(lesson, [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "1.0" }]), [1]);
  assert.deepEqual(targetedRepairSections(lesson, [{ kind: "source_conflict", blockPath: "2.0" }, { kind: "source_conflict", blockPath: "experience.quiz.4" }]), [2], "banktétel nem a szerzőé");
  assert.equal(targetedRepairSections(lesson, [{ kind: "coverage_gap", subkind: "core" }]), null, "útvonal nélküli jegyzet → teljes");
  assert.equal(targetedRepairSections(lesson, [{ kind: "source_conflict", subkind: "book_probably_wrong" }]), null, "csak admin-jegyzet → nincs mit javítani");
  assert.deepEqual(targetedRepairSections(lesson, [], { ok: false, ungrounded: [{ blockIndex: 2 }], arc: [{ sectionIdx: 0 }], reasons: ["x", "y"] }), [0, 1]);
  assert.equal(targetedRepairSections(lesson, [], { ok: false, missingCore: ["c9"], reasons: ["hiány"] }), null, "hiányzó core → teljes");
  assert.equal(targetedRepairSections(lesson, [], { ok: false, reasons: ["általános"] }), null, "csak szöveges indok → teljes");
  assert.equal(targetedRepairSections(lesson, [{ kind: "source_conflict", blockPath: "7.0" }]), null, "nem létező fejezet → teljes");
});

test("a patch egyesítése: a kijelölt fejezet cserélődik, a többi bájtra azonos, a tévhitek megmaradnak", () => {
  const patch = parseSectionPatch({ sections: { "1": { heading: "B javítva", probaEnabled: true, blocks: [{ kind: "explain", text: "Javított második.", depth: "core", readAloud: false, coversConceptIds: ["c2"] }] } } });
  assert.ok(patch && patch.size === 1);
  const merged = mergeSectionPatches(lesson, patch!, [1]);
  assert.equal(merged.sections[1].heading, "B javítva");
  assert.equal(JSON.stringify(merged.sections[0]), JSON.stringify(lesson.sections[0]));
  assert.equal(JSON.stringify(merged.sections[2]), JSON.stringify(lesson.sections[2]));
  assert.deepEqual(merged.misconceptions, lesson.misconceptions);
  assert.ok(lessonSchema.safeParse(merged).success);
  assert.throws(() => mergeSectionPatches(lesson, patch!, [0]), /nem volt javításra kijelölve/);
  assert.equal(parseSectionPatch({ sections: [] }), null, "teljes lecke (tömb) → nem patch");
  assert.equal(parseSectionPatch({ sections: { x: {} } }), null);
});

test("aritmetikai állítások: a mért hibaosztályok kódból buknak, a helyes állítás nem", () => {
  assert.equal(evaluateExpression("12 · 2"), 24);
  assert.equal(evaluateExpression("30+3·6–12:4"), 45);
  assert.equal(evaluateExpression("36 ÷ (3 · 2)"), null, "zárójelet nem értékel");
  assert.equal(evaluateExpression("7 : 2"), 3.5);
  assert.deepEqual(falseArithmeticClaims("A hibás út 12 · 2 = 48-at állít."), ["12 · 2 = 48 (helyesen: 24)"]);
  assert.deepEqual(falseArithmeticClaims("A zárójeles példa szerint 154 · 8 = 1238."), ["154 · 8 = 1238 (helyesen: 1232)"]);
  assert.deepEqual(falseArithmeticClaims("194·5 = 970"), []);
  assert.deepEqual(falseArithmeticClaims("Először 6 · 8 = 48, majd 148 + 48 = 196. 30+3·6–12:4 = 45."), []);
  assert.deepEqual(falseArithmeticClaims("36 ÷ (3 · 2) – 3 = 3"), [], "zárójeles kifejezésről nem ítél");
  // Mérve (regressziós futás 94a5ccf9): a tanulói lépéssor egyenlőség-LÁNC — tagonként kiértékelve mind 26.
  assert.deepEqual(falseArithmeticClaims("Egy tanuló így számolta: 40 – 2 · 9 + 4 = 40 – 18 + 4 = 22 + 4 = 26. Ellenőrizd!"), [], "lépéssor nem hamis");
  assert.deepEqual(falseArithmeticClaims("40 – 2 · 9 + 4 = 40 – 18 + 4 = 22 + 4 = 27"), ["22 + 4 = 27 (helyesen: 26)"], "a lánc utolsó, hibás tagja");
  assert.equal(evaluateExpression("26"), 26, "önálló szám önmaga");
  const problems = arithmeticClaimProblems({ quiz: [{ id: "q1", question: "Mennyi 12 · 2?", feedbackPerOption: ["Helyes: 12 · 2 = 24.", "Nem: 12 · 2 = 48 téves."] }], tasks: [{ id: "t1", sample: "148 + 6 · 8 = 196" }] });
  assert.equal(problems.length, 1); assert.match(problems[0], /q1: .*12 · 2 = 48/);
});
