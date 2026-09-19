import test from "node:test";
import assert from "node:assert/strict";
import { autofixBankPacket } from "../server/studio/tools/bank-packet-autofix";
import { autofixOutline } from "../server/studio/tools/outline-autofix";
import { deterministicSectionVisuals, SECTION_VISUALS_TOOL } from "../server/studio/section-visuals";
import { ROLE_SKILLS, TOOL_SKILLS, ROLE_TOOLS } from "../server/studio/role-skills";
import { lessonSchema } from "../shared/lesson-schema";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import type { OpenTask } from "../shared/lesson-experience";

/* Eszközök (2026-09-19): determinisztikus javítás modellhívás helyett. */

test("bank-packet-autofix: formai hibák kódból, tartalom érintetlen", () => {
  const packet = {
    methods: [{ id: "m1", sectionIndex: 3, coversConceptIds: ["c1", "idegen"], kind: "gate", title: "T", prompt: "P", answer: "A", options: ["Igen", "igen ", "Nem"], correctIndex: 2 }],
    tasks: [{ id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Mi a szorzás?", required: [["szorzás"], ["összeadás"]], bonus: [], minWords: 5, needsSentence: true, sample: "A szorzást ismételt összeadásként végezzük.", mode: "written" }],
    quiz: [
      { id: "q1", sectionIndex: 0, coversConceptIds: ["c1", "c2"], question: "K1?", options: ["a", "b", "c"], correctIndex: 0, feedbackPerOption: ["x", "y", "z"] },
      { id: "q2", sectionIndex: 0, coversConceptIds: ["c1"], question: "K2?", options: ["a", "A", "b", "c"], correctIndex: 1, feedbackPerOption: ["f1", "f2", "f3", "f4"] },
    ],
    glossary: [],
  };
  const before = structuredClone(packet);
  const { packet: fixed, fixes } = autofixBankPacket(packet, { sectionIndex: 0, allowedConceptIds: ["c1", "c2"] });
  assert.deepEqual(packet, before, "a bemenet nem módosul");
  const p = fixed as typeof packet;
  // Binding is content (spec: tests/bank-binding-diagnostics) — the tool leaves it to the model.
  assert.equal(p.methods[0].sectionIndex, 3);
  assert.deepEqual(p.methods[0].coversConceptIds, ["c1", "idegen"]);
  assert.deepEqual(p.methods[0].options, ["Igen", "Nem"]);
  assert.equal(p.methods[0].correctIndex, 1, "a helyes opció indexe követi az elhagyást");
  const task = p.tasks[0] as unknown as OpenTask;
  assert.deepEqual(task.required[0], ["szorzás"], "a szótő-illesztés (szorzást→szorzás) már felismeri, nincs mit hozzáadni");
  assert.ok(task.required[1].includes("osszeadaskent"), "a minta ragozott alakja a rubrikába került");
  assert.equal(task.minWords, 5, "a minWords NEM csökken (spec: rövid minta → a modell ír hosszabbat)");
  assert.equal(evaluateOpenAnswer(task.sample, task).score, 1, "a minta teljes pontot ér a javított rubrikán");
  assert.deepEqual(p.quiz[0].coversConceptIds, ["c1", "c2"], "két címke: a modell dolga, nem az eszközé");
  assert.deepEqual(p.quiz[1].options, ["a", "b", "c"]);
  assert.equal(p.quiz[1].correctIndex, 0);
  assert.deepEqual(p.quiz[1].feedbackPerOption, ["f1", "f3", "f4"]);
  assert.equal((p.quiz[0] as { intent?: string }).intent, "recall");
  assert.equal((p.quiz[1] as { intent?: string }).intent, "apply");
  assert.ok(fixes.length >= 5, fixes.join("; "));
  assert.equal(p.tasks[0].q, "Mi a szorzás?");
});

test("bank-packet-autofix: nem talál ki tartalmat — idegen címke, kevés opció, hiányzó tétel marad a modellnek", () => {
  const packet = { methods: [], tasks: [], quiz: [{ id: "q1", sectionIndex: 0, coversConceptIds: ["idegen"], question: "K?", options: ["a", "a", "b"], correctIndex: 0, feedbackPerOption: ["1", "2", "3"] }], glossary: [] };
  const { packet: fixed, fixes } = autofixBankPacket(packet, { sectionIndex: 0, allowedConceptIds: ["c1"] });
  const q = (fixed as typeof packet).quiz[0];
  assert.deepEqual(q.coversConceptIds, ["idegen"], "csak-idegen címkét nem cserél");
  assert.deepEqual(q.options, ["a", "a", "b"], "3 alá nem csökkenti az opciókat");
  assert.deepEqual(fixes, ["q1: intent=recall"]);
  assert.deepEqual(autofixBankPacket("nem objektum", { sectionIndex: 0, allowedConceptIds: [] }).fixes, []);
});

test("outline-autofix: ismeretlen id, ismétlődő cím, hosszú ábra-javaslat, 13+ fejezet, idegen tévhit", () => {
  const concepts = [{ localId: "c1" }, { localId: "c2" }];
  const section = (heading: string, ids: string[]) => ({ heading, conceptIds: ids, plannedBlocks: ["explain"], animationSuggestions: ["x".repeat(150)] });
  const raw = {
    sections: [section("Szorzás", ["c1", "nincs"]), section(" szorzás", ["c2"]), section("Üres", ["nincs"]), ...Array.from({ length: 11 }, (_, i) => section(`F${i}`, ["c1"]))],
    misconceptions: [{ conceptId: "c1", text: "t" }, { conceptId: "nincs", text: "t" }],
  };
  const { outline, fixes } = autofixOutline(raw, concepts);
  const o = outline as typeof raw;
  assert.equal(o.sections.length, 12);
  assert.deepEqual(o.sections[0].conceptIds, ["c1"]);
  assert.equal(o.sections[1].heading, "szorzás (2)");
  assert.ok(o.sections.every(s => s.heading !== "Üres"));
  assert.ok(o.sections.every(s => s.animationSuggestions.every(a => a.length <= 120)));
  assert.deepEqual(o.sections[11].conceptIds, ["c1"], "az utolsóba olvasztott fejezet fogalmai egyediek");
  assert.equal(o.misconceptions.length, 1);
  assert.ok(fixes.some(f => /olvasztva/.test(f)) && fixes.some(f => /elhagyva/.test(f)));
  assert.deepEqual(autofixOutline({ sections: [{ ...section("A", ["c1"]), animationSuggestions: ["folyamatábra"] }], misconceptions: [] }, concepts).fixes, [], "jó vázlaton nincs változás");
});

test("section-visuals: ha minden fejezet kap ábrát a példájából, a modellhívás kimarad", () => {
  const lesson = lessonSchema.parse({
    title: "T", subject: "Matematika", classroom: 5, mapId: "m1", sourceOnly: true, misconceptions: [],
    sections: [
      { heading: "A", probaEnabled: true, blocks: [
        { kind: "explain", text: "Szorzás előbb.", depth: "core", readAloud: false, coversConceptIds: ["c1"] },
        { kind: "example", problem: "2+3·4", steps: ["3·4=12", "2+12=14"], answer: "14", coversConceptIds: ["c1"] },
      ] },
      { heading: "B", probaEnabled: true, blocks: [
        { kind: "explain", text: "Zárójel.", depth: "core", readAloud: false, coversConceptIds: ["c2"] },
        { kind: "animate", animKind: "process", params: { steps: ["a", "b"] }, caption: "c", coversConceptIds: ["c2"] },
      ] },
    ],
  });
  const result = deterministicSectionVisuals(lesson);
  assert.ok(result, "minden fejezetnek van ábrája → nincs modell");
  assert.ok(result!.sections.every(s => s.blocks.some(b => b.kind === "animate")));
  const noExample = { ...lesson, sections: [{ ...lesson.sections[0], blocks: [lesson.sections[0].blocks[0]] }] };
  assert.equal(deterministicSectionVisuals(noExample), null, "példa nélküli fejezet → a modell dolgozik");
  assert.equal(deterministicSectionVisuals(undefined), null);
  assert.equal(SECTION_VISUALS_TOOL, "tool:section-visuals");
});

test("az eszköz-skillek a megfelelő szerep-skillekben szerepelnek", () => {
  for (const [role, tools] of Object.entries(ROLE_TOOLS)) {
    const text = ROLE_SKILLS[role as keyof typeof ROLE_SKILLS];
    assert.ok(text.includes("## Eszközök"), role);
    for (const tool of tools!) assert.ok(text.includes(TOOL_SKILLS[tool].split("\n")[0]), `${role}: ${tool}`);
  }
  for (const text of Object.values(TOOL_SKILLS)) { assert.match(text, /Mit javít|Mit tesz/); assert.match(text, /NEM/); assert.match(text, /npm run studio:tool/); }
  // Only producers get tool text: the lektor/author/extract/ocr calls stay lean (token discipline, 2026-09-19).
  for (const role of ["extract", "ocr", "author", "lektor"] as const) assert.ok(!ROLE_SKILLS[role].includes("## Eszközök"), role);
  assert.ok(ROLE_SKILLS.bank.includes("SZÓ SZERINT a fejezet példáját követi"), "a bank az irányt/lépéseket a példából másolja");
});
