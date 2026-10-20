import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { classifyNotes } from "../server/studio/lektor";
import { removeLektorBlockers } from "../server/studio/choice-gate";
import { finishStructuredImprovement } from "../server/studio/structured-improvement";
import { executeWorkflow, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Spec 2026-10-20-elakadas-gyokerok-elemzes (R1) — mért: 8 futás állt meg az utolsó lektorkörben kivehető banktétel miatt. */

const blocker = (blockPath: string | undefined, message = "A rubrika hibás: a rossz válasz is teljes pontot kap.") =>
  classifyNotes([{ kind: "source_conflict", subkind: "contradicts_source", message, ...(blockPath ? { blockPath } : {}) }]).filter((n) => n.blocking);

test("removeLektorBlockers: a kivehető banktétel kikerül, a lecke továbbmegy", () => {
  const lesson = standardFusionFixture();
  const before = lesson.experience!.tasks.length;
  const notes = blocker("experience.tasks[3]");
  assert.equal(notes.length, 1, "a jegyzet blokkoló");
  const result = removeLektorBlockers(lesson, notes);
  assert.ok(!("error" in result), "error" in result ? result.error : "");
  assert.equal(result.lesson.experience!.tasks.length, before - 1);
  assert.deepEqual(result.removed, ["experience.tasks[3]"]);
});

test("removeLektorBlockers: tanítási / ténybeli (nem kivehető) jegyzetnél hiba — a régi megállás marad", () => {
  const lesson = standardFusionFixture();
  assert.ok("error" in removeLektorBlockers(lesson, blocker(undefined)));
  assert.ok("error" in removeLektorBlockers(lesson, blocker("sections[0].blocks[0]")));
  assert.ok("error" in removeLektorBlockers(lesson, [...blocker("experience.tasks[3]"), ...blocker(undefined)]), "vegyes: a ténybeli jegyzet miatt nem vehető ki");
  assert.ok("error" in removeLektorBlockers(lesson, blocker("experience.tasks[999]")), "nem létező tétel");
});

test("Teljes lecke javítása: a lektor csak egy banktételt blokkol → a jelölt a tétel nélkül tér vissza (nem áll meg)", async () => {
  const original = standardFusionFixture();
  const e = original.experience!;
  const source = { subject: "matematika", classroom: 7, concepts: [{ localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] };
  const { store } = memoryWorkflows();
  let result: Awaited<ReturnType<typeof finishStructuredImprovement>> | undefined;
  await executeWorkflow(store, { id: "r1-repair", owner: "owner", mode: "repair" }, async () => {
    await workflowPhase("source"); await workflowPhase("author");
    result = await finishStructuredImprovement(original, structuredClone(original), source, async (step) => {
      if (step === "lektor") return { notes: [{ kind: "source_conflict", subkind: "contradicts_source", message: "A rubrika hibás.", blockPath: "experience.tasks[3]" }] };
      return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
    });
    await workflowPhase("save"); await workflowPhase("readback");
    return { kind: "candidate", id: "r1" };
  });
  assert.ok(result, "a javítás nem állt meg");
  assert.deepEqual(result!.lektorRemoved, ["experience.tasks[3]"]);
  assert.equal(result!.candidate.experience!.tasks.length, e.tasks.length - 1);
});

test("egyfutásos gyártás: az utolsó lektorkörben a kivétel a megállás ELŐTT fut", () => {
  const src = fs.readFileSync("server/studio/single-run/engine.ts", "utf8");
  const at = src.indexOf("if (round === SINGLE_RUN_REVIEW_ROUNDS) {");
  assert.ok(at > 0);
  const block = src.slice(at, at + 1400);
  assert.ok(block.indexOf("removeLektorBlockers(lesson, blocking)") < block.indexOf("throw new SingleRunError"));
  assert.match(block, /break;/);
});
