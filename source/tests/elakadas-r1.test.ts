import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { classifyNotes } from "../server/studio/lektor";
import { removeLektorBlockers } from "../server/studio/choice-gate";
import { finishStructuredImprovement } from "../server/studio/structured-improvement";
import { lessonRepairSchema } from "../shared/lesson-repair";
import { executeWorkflow, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Spec 2026-10-20-elakadas-gyokerok-elemzes (R1) + review #331 — mért: 8 futás állt meg az utolsó lektorkörben kivehető banktétel miatt. */

const blocker = (blockPath: string | undefined, message = "A rubrika hibás: a rossz válasz is teljes pontot kap.") =>
  classifyNotes([{ kind: "source_conflict", subkind: "contradicts_source", message, ...(blockPath ? { blockPath } : {}) }]).filter((n) => n.blocking);

test("removeLektorBlockers: PONTOSAN a blokkolt banktétel kerül ki, a többi marad", () => {
  const lesson = standardFusionFixture();
  const tasks = lesson.experience!.tasks;
  const notes = blocker("experience.tasks[3]");
  assert.equal(notes.length, 1, "a jegyzet blokkoló");
  const result = removeLektorBlockers(lesson, notes);
  assert.ok(!("error" in result), "error" in result ? result.error : "");
  const after = result.lesson.experience!.tasks.map((t) => t.id);
  assert.deepEqual(after, tasks.filter((_, i) => i !== 3).map((t) => t.id), "a 3. tétel hiányzik, a többi sorrendben megvan");
  assert.ok(!after.includes(tasks[3].id));
  assert.deepEqual(result.removed, ["experience.tasks[3]"]);
});

test("removeLektorBlockers: nem kivehető esetek — a régi megállás marad", () => {
  const lesson = standardFusionFixture();
  assert.ok("error" in removeLektorBlockers(lesson, blocker(undefined)), "útvonal nélküli (tanítási) jegyzet");
  assert.ok("error" in removeLektorBlockers(lesson, blocker("sections[0].blocks[0]")), "tanítási blokk");
  // Review #331: ellenőrző / ábra blokk és tévhit-elem itt nem vehető ki (a tanítás része; a leckeív-invariáns sem sérülhet).
  assert.ok("error" in removeLektorBlockers(lesson, blocker("sections[0].blocks[2]")), "ábra / ellenőrző blokk");
  assert.ok("error" in removeLektorBlockers(lesson, blocker("misconceptions[0]")), "tévhit-elem");
  assert.ok("error" in removeLektorBlockers(lesson, [...blocker("experience.tasks[3]"), ...blocker(undefined)]), "vegyes jegyzet");
  assert.ok("error" in removeLektorBlockers(lesson, blocker("experience.tasks[999]")), "nem létező tétel");
  assert.ok("error" in removeLektorBlockers(lesson, blocker("experience.tasks[3]"), [{ match: false }]), "eltérő tanítási megoldás");
  assert.ok("error" in removeLektorBlockers({ ...lesson, experience: undefined }, blocker("experience.tasks[3]")), "nincs bank");
});

test("Teljes lecke javítása: a lektor csak egy banktételt blokkol → a jelölt PONTOSAN e tétel nélkül tér vissza, a lista a javításban is megmarad", async () => {
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
  const ids = result!.candidate.experience!.tasks.map((t) => t.id);
  assert.equal(ids.length, e.tasks.length - 1);
  assert.ok(!ids.includes(e.tasks[3].id), "a blokkolt tétel hiányzik");
  // A javítás-artefaktum sémája megőrzi a listát (admin-nézet).
  assert.deepEqual(lessonRepairSchema.shape.lektorRemoved.parse(["experience.tasks[3]"]), ["experience.tasks[3]"]);
});

test("egyfutásos gyártás + javítás: a kivétel a megállás ELŐTT fut, a lista mentődik és az admin látja", () => {
  const src = fs.readFileSync("server/studio/single-run/engine.ts", "utf8");
  const at = src.indexOf("if (round === SINGLE_RUN_REVIEW_ROUNDS) {");
  assert.ok(at > 0);
  const block = src.slice(at, at + 1600);
  const call = block.indexOf("removeLektorBlockers(lesson, blocking, report.solutions)");
  const thrown = block.indexOf("throw new SingleRunError");
  assert.ok(call >= 0 && thrown >= 0, "a kivétel és a megállás is megvan");
  assert.ok(call < thrown);
  assert.match(block, /lektorRemoved: removal\.removed/);
  assert.match(block, /break;/);
  assert.match(fs.readFileSync("server/studio/structured-improvement.ts", "utf8"), /\.\.\.\(lektorRemoved\?\.length \? \{ lektorRemoved \} : \{\}\)/);
  assert.match(fs.readFileSync("client/src/components/LessonRepairPanel.tsx", "utf8"), /data-testid="lesson-repair-lektor-removed"/);
});
