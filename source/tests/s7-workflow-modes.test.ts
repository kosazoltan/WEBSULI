import test from "node:test";
import assert from "node:assert/strict";
import { WORKFLOW_MODES, WORKFLOW_RESULT_KIND, workflowDefinition, type WorkflowMode } from "../shared/lesson-workflow";
import { skillForMode } from "../shared/lesson-skill";
import { runtimeKnowledge } from "../shared/runtime-knowledge";
import { skillSnapshot } from "../server/workflows/learning";
import { runToolWorkflow } from "../server/workflows/tool-run";
import { workflowMode, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";

/** Spec 2026-10-06-s7-workflow-rendbetetel §4/1–4: az új módok láncai, eredményfajtái és a közös segéd-futtató. */

const ids = (mode: WorkflowMode) => workflowDefinition(mode).steps.map((s) => s.id);

test("a meglévő hét lánc változatlan (a folyamatban lévő futások folytathatók)", () => {
  assert.deepEqual(ids("upload"), ["source", "scope", "knowledge", "sourceCheck", "pedagogue", "author", "animator", "lektor", "gate", "readback"]);
  assert.deepEqual(ids("studio"), ["pedagogue", "author", "animator", "lektor", "gate", "readback"]);
  assert.deepEqual(ids("web"), ["generate", "knowledge", "author", "gate", "publish", "readback"]);
  assert.deepEqual(ids("repair"), ["source", "author", "banks", "lektor", "gate", "save", "readback"]);
  assert.deepEqual(ids("concept"), ["source", "author", "banks", "lektor", "gate", "save", "apply", "readback"]);
  assert.deepEqual(ids("html"), ["source", "author", "gate", "save", "readback"]);
  assert.deepEqual(ids("apply"), ["source", "gate", "apply", "readback"]);
  const web = workflowDefinition("web").steps;
  assert.deepEqual(web.map((s) => s.maxVisits), [1, 3, 3, 1, 1, 1], "a webes HTML-út kerete változatlan");
});

test("az új módok láncai és eredményfajtái", () => {
  assert.deepEqual(ids("htmlAssist"), ["source", "author", "gate", "readback"]);
  assert.deepEqual(ids("creator"), ["source", "author", "gate", "readback"]);
  assert.deepEqual(ids("quiz"), ["source", "author", "gate", "save", "readback"]);
  assert.deepEqual(ids("map"), ["source", "scope", "knowledge", "gate", "readback"]);
  assert.deepEqual(ids("mapCheck"), ["source", "gate", "save", "readback"]);
  assert.deepEqual(ids("webStudio"), ["generate", ...ids("upload")]);
  assert.deepEqual(Object.keys(WORKFLOW_RESULT_KIND).sort(), [...WORKFLOW_MODES].sort());
  assert.equal(WORKFLOW_RESULT_KIND.htmlAssist, "proposal");
  assert.equal(WORKFLOW_RESULT_KIND.creator, "proposal");
  assert.equal(WORKFLOW_RESULT_KIND.map, "map");
  assert.equal(WORKFLOW_RESULT_KIND.mapCheck, "map");
  assert.equal(WORKFLOW_RESULT_KIND.repair, "candidate");
  assert.equal(WORKFLOW_RESULT_KIND.webStudio, "material");
});

test("a webes Studio-lánc a feltöltéses gyártás körszabályait kapja (a generate után)", () => {
  const upload = workflowDefinition("upload").steps;
  const web = workflowDefinition("webStudio").steps;
  for (const step of upload.slice(1)) {
    const same = web.find((s) => s.id === step.id)!;
    assert.deepEqual({ after: same.after, maxVisits: same.maxVisits, label: same.label }, { after: step.after, maxVisits: step.maxVisits, label: step.label }, step.id);
  }
  assert.deepEqual(web.find((s) => s.id === "source")!.after, ["generate"]);
});

test("skill-hozzárendelés: a régi HTML javaslata javító, a többi új mód készítő; a runbook felsorolja őket", () => {
  assert.equal(skillForMode("htmlAssist"), "tananyag-javito");
  for (const mode of ["creator", "quiz", "map", "mapCheck", "webStudio"] as const) assert.equal(skillForMode(mode), "tananyag-keszito", mode);
  const keszito = runtimeKnowledge(skillSnapshot("upload", []), []).documents["RUNBOOK.md"];
  for (const label of ["Anyagkészítő segéd", "Játék-kvízgenerálás", "Tudástár-kivonatolás", "Tudástár-ellenőrzés", "Internetes készítés (Studio)"]) assert.ok(keszito.includes(label), label);
  assert.ok(runtimeKnowledge(skillSnapshot("repair", []), []).documents["RUNBOOK.md"].includes("Régi HTML javítási javaslata"));
});

test("runToolWorkflow: kész futás a teljes lánccal, a munka saját értékét adja vissza", async () => {
  const { store, records } = memoryWorkflows();
  let inside: string | undefined;
  const value = await runToolWorkflow({ mode: "creator", owner: "admin", request: { q: 1 }, id: "creator:t1", store }, async () => {
    inside = workflowMode();
    for (const step of ids("creator")) await workflowPhase(step);
    return { value: "válasz", result: { kind: "proposal", id: "creator:t1" } };
  });
  assert.equal(value, "válasz");
  assert.equal(inside, "creator");
  const view = records.get("creator:t1")!.view;
  assert.equal(view.state, "done");
  assert.deepEqual(view.visits.map((v) => v.step), ids("creator"));
  assert.equal(view.skillAudit?.outcome, "passed");
});

test("runToolWorkflow: a hiba a futásban rögzül (lelet), és a hívóhoz jut", async () => {
  const { store, records } = memoryWorkflows();
  await assert.rejects(runToolWorkflow({ mode: "htmlAssist", owner: "admin", request: {}, id: "htmlAssist:t2", store }, async () => {
    await workflowPhase("source");
    await workflowPhase("author");
    throw new Error("A modell válaszában nincs JSON.");
  }), /nincs JSON/);
  const view = records.get("htmlAssist:t2")!.view;
  assert.equal(view.state, "error");
  assert.deepEqual(view.skillAudit?.findings.map((f) => f.code), ["schema"]);
});

test("runToolWorkflow: rossz eredményfajta nem zárható késznek", async () => {
  const { store, records } = memoryWorkflows();
  await assert.rejects(runToolWorkflow({ mode: "map", owner: "admin", request: {}, id: "map:t3", store }, async () => {
    for (const step of ids("map")) await workflowPhase(step);
    return { value: 1, result: { kind: "material", id: "x" } };
  }), /nem felel meg a készítési módnak/);
  assert.equal(records.get("map:t3")!.view.state, "error");
});

test("támogató szerepek saját lelet-kódjai: szabályszöveg és csak az elkövető szerephez rendelve (§4/9)", async () => {
  const { SKILL_RULES } = await import("../shared/lesson-skill");
  const { RULE_ROLES } = await import("../shared/instruction-bundles/roles");
  const expected: Record<string, string[]> = {
    scope_classification: ["scope"], source_correction: ["corrector"], topic_focus: ["topic-focus"], blind_solver: ["blind-solver"],
    bank_verifier: ["bank-verifier"], instruction_points: ["instruction-points"], instruction_check: ["instruction-checker"], ocr_uncertain: ["ocr", "extract"],
  };
  for (const [code, roles] of Object.entries(expected)) {
    assert.ok(Object.hasOwn(SKILL_RULES, code), code);
    assert.deepEqual([...RULE_ROLES[code]], roles, code);
  }
});

test("témafókusz: saját támogató skill a hívás elején; a modell hibája a futásban topic_focus lelet (§4/8–9)", async () => {
  const { decideTopicFocus } = await import("../server/studio/topic-focus");
  const { store, records } = memoryWorkflows();
  const systems: string[] = [];
  const concepts = [{ localId: "c1", term: "Oszthatóság 3-mal", definition: "", quote: "", examWeight: "core" }];
  await runToolWorkflow({ mode: "map", owner: "admin", request: {}, id: "map:tf", store }, async () => {
    await workflowPhase("source");
    await workflowPhase("scope");
    const focus = await decideTopicFocus("Csak a 3-mal való oszthatóságot tanítsd.", concepts as never, [
      async (system) => { systems.push(system); throw new Error("szolgáltató leállt"); },
    ]);
    assert.equal(focus, null);
    for (const step of ["knowledge", "gate", "readback"]) await workflowPhase(step);
    return { value: undefined, result: { kind: "map", id: "m1" } };
  });
  assert.ok(systems[0].startsWith("=== TÁMOGATÓ SKILL: topic-focus "), systems[0].slice(0, 60));
  assert.ok(records.get("map:tf")!.view.skillAudit!.findings.some((f) => f.code === "topic_focus" && f.step === "scope"));
});
