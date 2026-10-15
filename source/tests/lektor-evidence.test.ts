import test from "node:test";
import assert from "node:assert/strict";
import { evidenceDiff, lektorEvidenceOf } from "../server/studio/step-runner";
import { executeWorkflow, workflowAllowResumeEdge, workflowPhase } from "../server/workflows/engine";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { Lesson } from "../shared/lesson-schema";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Spec 2026-10-15-tetelgyar T0 (mért: job 416ad01d — „a lektorált bemenet eltér a mostanitól”, a komponens nem volt megállapítható). */

const map = { id: "m1", title: "T", subject: "Környezetismeret", classroom: 4 };
const concepts = [{ id: "c2", term: "b" }, { id: "c1", term: "a" }];
const base = () => ({ lesson: standardFusionFixture() as Lesson, map, concepts });

test("T0.2: a bizonyíték kulcs- és fogalomsorrend-független", () => {
  const a = lektorEvidenceOf(base(), "h");
  const shuffled = base();
  shuffled.concepts = [...concepts].reverse();
  const q0 = shuffled.lesson.experience!.quiz[0] as Record<string, unknown>;
  shuffled.lesson.experience!.quiz[0] = Object.fromEntries(Object.entries(q0).reverse()) as never;
  assert.deepEqual(evidenceDiff(a, lektorEvidenceOf(shuffled), "h"), []);
});

test("T0.2: egy tétel változása csak azt a tételt nevezi meg; a tanítás változása a tanítást", () => {
  const a = lektorEvidenceOf(base(), "h");
  const changed = base();
  const t0 = changed.lesson.experience!.tasks[0] as Record<string, unknown>;
  changed.lesson.experience!.tasks[0] = { ...t0, q: `${String(t0.q)} (más)` } as never;
  assert.deepEqual(evidenceDiff(a, lektorEvidenceOf(changed), "h"), [`banktétel: tasks:${String(t0.id)}`]);
  const teaching = base();
  teaching.lesson.title = `${teaching.lesson.title} (más)`;
  assert.deepEqual(evidenceDiff(a, lektorEvidenceOf(teaching), "h"), ["tanítás"]);
});

test("T0.2: csak az előző blokkolók eltérése külön nevesítve; hiányzó tárolt bizonyíték jelezve", () => {
  const a = lektorEvidenceOf(base(), "h");
  assert.deepEqual(evidenceDiff(a, lektorEvidenceOf({ ...base(), previousBlockers: [{ kind: "x", message: "y" }] }), "h"), ["előző blokkolók"]);
  assert.deepEqual(evidenceDiff(undefined, a), ["nincs komponensenkénti bizonyíték"]);
});

test("T0.2: a komponens-bizonyíték csak a vele mentett teljes lenyomattal érvényes (hiányzó/régi lenyomat nem kerülhető meg)", () => {
  const stored = lektorEvidenceOf(base(), "full-hash");
  const current = lektorEvidenceOf({ ...base(), previousBlockers: [{ kind: "x" }] });
  assert.deepEqual(evidenceDiff(stored, current, "full-hash"), ["előző blokkolók"]);
  assert.deepEqual(evidenceDiff(stored, current, undefined), ["a bizonyíték nem a mentett lektori lenyomathoz kötött"]);
  assert.deepEqual(evidenceDiff(stored, current, "régi-verziójú-hash"), ["a bizonyíték nem a mentett lektori lenyomathoz kötött"]);
  assert.deepEqual(evidenceDiff(lektorEvidenceOf(base()), current, "full-hash"), ["a bizonyíték nem a mentett lektori lenyomathoz kötött"]);
});

test("T0.4b: a kapu → lektor visszaél csak kifejezett folytatásban, a kapu hibája után engedélyezett", async () => {
  const { store } = memoryWorkflows();
  const input = { id: "edge", owner: "o", mode: "upload" as const };
  const chain = ["source", "scope", "knowledge", "sourceCheck", "pedagogue", "author", "animator", "lektor"];
  await assert.rejects(executeWorkflow(store, input, async () => {
    for (const step of chain) await workflowPhase(step);
    assert.equal(await workflowAllowResumeEdge("gate", "lektor", "teszt"), false, "nem folytatás: nincs visszaél");
    await workflowPhase("gate");
    throw new Error("kapu hiba");
  }), /kapu hiba/);
  await assert.rejects(executeWorkflow(store, { ...input, retry: true, continuation: true }, async () => {
    await workflowPhase("lektor");
    return undefined;
  }), /Befejezetlen lépés után csak annak kifejezett folytatása megengedett/, "visszaél nélkül a régi szabály");
  const view = (await store.read("edge", "o"))!.view;
  assert.equal(view.visits.at(-1)?.step, "gate");
  const done = await executeWorkflow(store, { ...input, retry: true, continuation: true }, async () => {
    assert.equal(await workflowAllowResumeEdge("gate", "lektor", "teszt"), true);
    await workflowPhase("lektor"); await workflowPhase("gate"); await workflowPhase("readback");
    return { kind: "material" as const, id: "ok" };
  });
  assert.equal(done.state, "done");
  assert.ok(done.definition.steps.find((s) => s.id === "lektor")!.after.includes("gate"), "a definíció a futásban mentett");
  assert.deepEqual(done.resumeEdges?.map((e) => `${e.from}→${e.to}`), ["gate→lektor"], "a felhasznált visszaél naplózva");
  assert.equal(done.resumeEdge, undefined, "egyszer használatos");
  assert.equal(done.visits.filter((v) => v.step === "gate")[0].state, "error", "a hibás kapulátogatás hibaként marad");
});
