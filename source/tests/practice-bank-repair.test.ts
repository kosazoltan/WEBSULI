import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { buildPracticeBankRepair } from "../server/studio/structured-improvement";
import { executeWorkflow, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";
import { repairArtefactSchema } from "../shared/lesson-repair";
import { repairHash } from "../server/studio/structured-improvement";

/** TG-P7b (docs/specs/2026-11-27-tananyag-gyakorlati-p7b-vegrehajtas.md): csak-bank gyakorlati javítás. */

const META = "Hány pontot ér a feladatlapon a 3. feladat?";
const PRACTICAL = "Egy háromszög alapja 6 cm, magassága 4 cm. Mekkora a területe?";

test("TG-P7b: a csak-bank javítás a tanítást érintetlenül hagyja, és csak a meta-tételt cseréli", async () => {
  const lesson = standardFusionFixture();
  const e = structuredClone(lesson.experience!);
  const packet = { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  lesson.experience = await buildLessonExperience(lesson, [], { call: async () => structuredClone(packet) });
  const clean = structuredClone(lesson);
  const victim = lesson.experience.quiz[0];
  victim.question = META;
  const source = { subject: "matematika", classroom: 7, concepts: [{ localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] };
  const steps: string[] = [];
  const bankPrompts: string[] = [];
  const { store } = memoryWorkflows();
  let result: Awaited<ReturnType<typeof buildPracticeBankRepair>> | undefined;
  await executeWorkflow(store, { id: "p7b", owner: "owner", mode: "repair" }, async () => {
    await workflowPhase("source");
    result = await buildPracticeBankRepair(lesson, source, async (step, _system, user, role) => {
      steps.push(`${step}/${role ?? ""}`);
      if (step === "lektor") return { notes: [] };
      bankPrompts.push(user);
      return { methods: [], tasks: [], quiz: [{ ...structuredClone(victim), question: PRACTICAL }], glossary: [] };
    });
    await workflowPhase("save"); await workflowPhase("readback");
    return { kind: "candidate", id: "p7b" };
  });
  assert.ok(result, "a javítás lefutott");
  assert.ok(!steps.some((s) => s.startsWith("pedagogue") || s.endsWith("/author") || s === "author/"), `nincs szerzői hívás: ${steps.join(", ")}`);
  assert.equal(bankPrompts.length, 1, "egyetlen célzott bankhívás");
  assert.match(bankPrompts[0], /JAVÍTÁSI MÓD/u);
  assert.deepEqual(result.candidate.sections, lesson.sections, "a tanítás bájtra azonos");
  const quiz = result.candidate.experience!.quiz;
  assert.equal(quiz.find((q) => q.id === victim.id)?.question, PRACTICAL);
  assert.deepEqual(quiz.filter((q) => q.id !== victim.id), clean.experience!.quiz.filter((q) => q.id !== victim.id));
  assert.deepEqual(result.candidate.experience!.tasks, clean.experience!.tasks);
});

test("TG-P7b: bekötés — a mode: practice-bank a csak-bank utat indítja, a panelen külön gomb", () => {
  const route = fs.readFileSync("server/improveAsync.ts", "utf8");
  assert.match(route, /mode === ["']practice-bank["']/u);
  assert.match(route, /generateStructuredImprovement\(originalFile\.id, customPrompt, \{ bankOnly: /u);
  assert.match(fs.readFileSync("server/studio/structured-improvement.ts", "utf8"), /opts\.bankOnly\s*\?\s*await buildPracticeBankRepair/u);
  assert.match(fs.readFileSync("client/src/components/LessonRepairPanel.tsx", "utf8"), /mode: "practice-bank"/u);
});

test("review #638: a csak-bank jelölt a TELJES olvasási sémával zárul — kikapcsolt forrásvizuál mellett is megmarad a sourceVisualId", () => {
  const lesson = standardFusionFixture();
  const block = lesson.sections.flatMap((s) => s.blocks).find((b) => b.kind === "example") as { sourceVisualId?: string };
  block.sourceVisualId = "sv-1";
  const artefact = { kind: "lesson-repair-fusion-1", lessonId: "l", baseVersion: 1, baselineHash: repairHash(lesson), baselineMaterialHash: repairHash("m"),
    sourceHash: repairHash("s"), previousLesson: lesson, candidate: lesson };
  const kept = repairArtefactSchema(true, false).parse(artefact);
  const keptBlock = kept.candidate.sections.flatMap((s) => s.blocks).find((b) => b.kind === "example") as { sourceVisualId?: string };
  assert.equal(keptBlock.sourceVisualId, "sv-1", "csak-bank: a tárolt tanítás bájtra marad");
  const model = repairArtefactSchema(false, false).parse(artefact);
  const modelBlock = model.candidate.sections.flatMap((s) => s.blocks).find((b) => b.kind === "example") as { sourceVisualId?: string };
  assert.equal(modelBlock.sourceVisualId, undefined, "a szerzői (modell-) ág sémája változatlan");
});

test("review #638: a gyakorlati bankjavítás gombjának felirata 320 px-en is tördelhető", () => {
  const src = fs.readFileSync("client/src/components/LessonRepairPanel.tsx", "utf8");
  const btn = src.slice(src.indexOf('data-testid="lesson-repair-practice-bank"') - 300, src.indexOf('data-testid="lesson-repair-practice-bank"'));
  assert.match(btn, /whitespace-normal/u);
  assert.match(btn, /h-auto/u);
});

/** P7C-LEKTOR-REGI (docs/specs/2026-11-28-p7c-lektor-regi-tetel.md): a kifogásolt, ki nem vehető régi tétel fogalma újragyártódik. */
async function lektorRetryRun(blockTwice: boolean) {
  const lesson = standardFusionFixture();
  const e = structuredClone(lesson.experience!);
  const packet = { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  lesson.experience = await buildLessonExperience(lesson, [], { call: async () => structuredClone(packet) });
  const source = { subject: "matematika", classroom: 7, concepts: [{ localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] };
  // Minden kvíztétel kifogásolt: a kivétel után a bank nem felelne meg (hiányzó felidéző kvíz) — a 9370eb25… lecke mintája.
  const notes = lesson.experience.quiz.map((_q, i) => ({ kind: "source_conflict", subkind: "contradicts_source", message: "Nem tanított tény a helyes opcióban.", blockPath: `experience.quiz[${i}]` }));
  let lektorCalls = 0, bankCalls = 0;
  const { store } = memoryWorkflows();
  let result: Awaited<ReturnType<typeof buildPracticeBankRepair>> | undefined;
  let error: unknown;
  await executeWorkflow(store, { id: `lr-${blockTwice}`, owner: "owner", mode: "repair" }, async () => {
    await workflowPhase("source");
    try {
      result = await buildPracticeBankRepair(lesson, source, async (step) => {
        if (step === "lektor") { lektorCalls++; return { notes: lektorCalls === 1 || blockTwice ? notes : [] }; }
        bankCalls++;
        return structuredClone(packet);
      });
    } catch (err) { error = err; throw err; }
    await workflowPhase("save"); await workflowPhase("readback");
    return { kind: "candidate", id: "lr" };
  }).catch(() => undefined);
  return { result, error, lektorCalls, bankCalls };
}

test("P7C-LEKTOR-REGI L1: a ki nem vehető kifogásolt régi tétel fogalma újragyártódik, a javítás lefut (két lektorkör)", async () => {
  const run = await lektorRetryRun(false);
  assert.equal(run.error, undefined, String(run.error));
  assert.ok(run.result, "a javítás lefutott");
  assert.equal(run.lektorCalls, 2, "egyetlen újrakör");
  assert.ok(run.bankCalls >= 1, "a második kör bankhívással újragyártja az érintett fogalmat");
});

test("P7C-LEKTOR-REGI L2+L3: ha az újrakör lektora is blokkol, a régi megállás jön (pontosan két kör), az üzenetben az ok és az útvonal", async () => {
  const run = await lektorRetryRun(true);
  assert.equal(run.lektorCalls, 2);
  assert.match(String(run.error), /A lektor javítást kér, az eredeti érintetlen \(.+\): experience\.quiz\[0\]/u);
});
