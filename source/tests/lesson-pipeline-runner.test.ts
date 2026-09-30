import assert from "node:assert/strict";
import test from "node:test";

import {
  PIPELINE_PROMPT_VERSION,
  advanceJob,
  fixConceptOnLesson,
  approveOutline,
  runPipelineStep,
  retryTimedOutLektor,
  retryFailedBankBuild,
  startJobFromMap,
  type JobPatch,
  type JobView,
  type MapMeta,
  type PipelineStore,
} from "../server/studio/step-runner";
import { recordOneStepFailure } from "../server/studio/lesson-pipeline-routes";
import { computeStepHash, MAX_AUTHOR_ROUNDS, MAX_BANK_ONLY_ROUNDS } from "../server/studio/pipeline";
import { buildLektorPrompt, buildPedagoguePrompt } from "../server/studio/step-io";
import { withRoleSkill } from "../server/studio/role-skills";
import { visualWorld } from "../shared/lesson-visuals";
import { fromMapBody } from "../server/studio/from-map-body";
import { AIProviderTimeoutError, type AIMessage, type IAIProvider } from "../server/ai/AIProvider";
import type { MapConcept } from "../server/studio/coverage";
import { lessonSchema, type Block, type Lesson } from "../shared/lesson-schema";
import { classifyNotes, type LektorNote } from "../server/studio/lektor";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { buildLessonExperience, type ExperienceCheckpoint } from "../server/studio/experience-builder";
import { canReuseLessonVisuals } from "../server/studio/visual-reuse";
import { studioJobs } from "../shared/schema";
import { executeWorkflow, workflowPhase, workflowStepVisitsLeft, workflowEnsureRepairBudget, REPAIR_BUDGET_GRANTS, WorkflowWaiting, redactWorkflowError } from "../server/workflows/engine";
import { BLIND_SOLVER_MODEL, sourceHashOf } from "../server/studio/blind-solver";
import { memoryWorkflows } from "./helpers/workflow-store";

import { __resetRunsForTest, createRun, getRun, updateRun } from "../server/studio/one-step-progress";

test("bank resume requires the exact failed workflow visit and retains checkpoints and round", async () => {
  const deps = makeDeps("{}");
  const error = "A 2. fejezet bankcsomagja a javító kör után sem megfelelő: Bankterven kívüli tétel.";
  const output = { lesson: standardFusionFixture(), experienceCheckpoint: { hash: "fusion-7.4-4", parts: { complete: { preserved: true } } } };
  const seed = () => deps.store.seed({ id: "bank-retry", mapId: "m1", lessonId: "draft", step: "error", status: "error", round: 2, error, output: structuredClone(output) });
  const visit = { step: "animator", state: "error", error };
  for (const invalid of [undefined, { ...visit, step: "lektor" }, { ...visit, state: "running" }, { ...visit, error: "different" }]) {
    seed();
    await assert.rejects(retryFailedBankBuild("bank-retry", invalid, deps), /naplóval igazolt/);
    assert.equal(deps.store.jobs.get("bank-retry")!.step, "error");
  }
  seed();
  deps.store.jobs.get("bank-retry")!.output!.htmlFileId = "published";
  await assert.rejects(retryFailedBankBuild("bank-retry", visit, deps), /nem publikált/);
  seed();
  const blocked = "A lektor 1 tartalmi javítást kér.";
  deps.store.jobs.get("bank-retry")!.error = blocked;
  await assert.rejects(retryFailedBankBuild("bank-retry", { ...visit, error: blocked }, deps), /bankgyártási/);
  seed();
  await retryFailedBankBuild("bank-retry", visit, deps);
  const job = deps.store.jobs.get("bank-retry")!;
  assert.equal(job.step, "animator"); assert.equal(job.status, "pending"); assert.equal(job.round, 2);
  assert.deepEqual(job.output, { ...output, previousBankError: error, bankRecoveryAttempt: 1 });
  job.step = "error"; job.status = "error"; job.error = error;
  await retryFailedBankBuild("bank-retry", visit, deps);
  assert.equal(job.output!.bankRecoveryAttempt, 2);
  assert.equal(deps.calls.length, 0);
  job.step = "done";
  await retryFailedBankBuild("bank-retry", visit, deps);
  assert.equal(job.step, "done");
});

test("bank resume recognizes redacted long errors but rejects malformed retry state", async () => {
  const deps = makeDeps("{}");
  const error = 'A(z) "author" lépés modellhívása hibára futott: https://example.invalid/request ' + "provider detail ".repeat(200);
  deps.store.seed({ id: "bank-redacted", mapId: "m1", lessonId: "draft", step: "error", status: "error", error, output: { lesson: standardFusionFixture() } });
  const visit = { step: "animator", state: "error", error: redactWorkflowError(new Error(error)) };
  assert.notEqual(visit.error, error);
  const job = deps.store.jobs.get("bank-redacted")!;
  for (const invalid of [-1, 1.5, "1", Number.MAX_SAFE_INTEGER]) {
    job.output!.bankRecoveryAttempt = invalid;
    await assert.rejects(retryFailedBankBuild(job.id, visit, deps), /sorszám/);
    assert.equal(job.step, "error");
  }
  delete job.output!.bankRecoveryAttempt;
  await retryFailedBankBuild(job.id, visit, deps);
  assert.equal(job.step, "animator");
});

test("bank resume reaches the provider with a new request while keeping teaching unchanged", async () => {
  const deps = makeDeps("{}");
  const lesson = standardFusionFixture(); lesson.mapId = "m1"; delete lesson.experience;
  const saved = { lesson, methodVersion: "fusion-7.4-4", bankRecoveryAttempt: 2 };
  deps.store.seed({ id: "bank-fresh", mapId: "m1", step: "animator", status: "pending", lessonId: "draft", output: saved });
  const messages: AIMessage[][] = [];
  deps.providerFactory = () => ({ name: "stub", model: "stub", isAvailable: async () => true,
    chat: async (input: AIMessage[]) => { messages.push(input); throw new Error("provider unavailable"); },
  } as unknown as IAIProvider);
  assert.equal((await runPipelineStep("bank-fresh", deps)).ok, false);
  assert.equal(messages.length, 1);
  assert.match(String(messages[0][1].content), /Explicit bankfolytatás: 2/);
  assert.deepEqual(deps.store.jobs.get("bank-fresh")!.output, saved);
});

test("mért hiba 2026-09-19 (run 45233b4b): hosszkorlátos bankválasz után a következő kísérlet fut, nem hal meg a lépés", async () => {
  const deps = makeDeps("{}");
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const e = lesson.experience!;
  const teaching = { ...lesson, experience: undefined };
  deps.store.seed({ id: "bank-length", mapId: "m1", step: "animator", status: "pending", output: { lesson: teaching, methodVersion: "fusion-7.4-4" } });
  const models: string[] = [];
  deps.providerFactory = (model: string) => ({ name: "stub", model, isAvailable: async () => true,
    chat: async () => {
      models.push(model);
      if (models.length === 1) return { content: '{"methods":[', finishReason: "length", usage: { promptTokens: 1, completionTokens: 24000, totalTokens: 24001 } };
      return { content: JSON.stringify({ methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] }), finishReason: "stop" };
    },
  } as unknown as IAIProvider);
  const result = await runPipelineStep("bank-length", deps);
  assert.equal(result.ok, true, JSON.stringify(deps.store.jobs.get("bank-length")!.error));
  assert.equal(models.length, 2, "a csonka válasz után egy új kísérlet");
  assert.equal(models[0], resolveStudioModel("bank"));
  assert.ok((deps.store.jobs.get("bank-length")!.output as { lesson: { experience?: unknown } }).lesson.experience, "a bank elkészült");
});

test("bank provider failure preserves its cause and the saved teaching without publication", async () => {
  const deps = makeDeps("{}");
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  assert.equal(canReuseLessonVisuals(lesson), true);
  const saved = { lesson, methodVersion: "fusion-7.4-4", experienceCheckpoint: { hash: "fusion-7.4-4", parts: {} } };
  // No bank is attached to the newly authored teaching, forcing its own provider call.
  const teaching = { ...lesson, experience: undefined };
  saved.lesson = teaching;
  deps.store.seed({ id: "bank-provider-failure", mapId: "m1", step: "animator", status: "pending", lessonId: "draft", output: saved });
  let publications = 0;
  deps.store.publishLesson = async () => { publications++; throw new Error("Must not publish"); };
  deps.providerFactory = () => ({ name: "stub", model: "stub", isAvailable: async () => true,
    chat: async () => { throw new Error("[xAI] Request timed out after 180000ms"); },
  } as unknown as IAIProvider);
  const result = await runPipelineStep("bank-provider-failure", deps);
  assert.equal(result.ok, false);
  assert.match(deps.store.jobs.get("bank-provider-failure")!.error!, /Request timed out after 180000ms/);
  assert.deepEqual(deps.store.jobs.get("bank-provider-failure")!.output, saved);
  assert.equal(publications, 0);
});

// Spec §7o (mérve, 4. mérés): a bank-hívás időtúllépése a modell lassúsága → a következő kísérlet/modell
// kapja meg (bukott kísérlet), nem a futás vége; a csomag-ciklus végigmegy az összes kísérleten.
test("bank timeout is a failed attempt that moves on to the next model, not a job-killing provider failure", async () => {
  const deps = makeDeps("{}");
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const saved = { lesson: { ...lesson, experience: undefined }, methodVersion: "fusion-7.4-4", experienceCheckpoint: { hash: "fusion-7.4-4", parts: {} } };
  deps.store.seed({ id: "bank-timeout", mapId: "m1", step: "animator", status: "pending", lessonId: "draft", output: saved });
  const models: string[] = [];
  deps.providerFactory = (model: string) => ({ name: "stub", model, isAvailable: async () => true,
    chat: async () => { models.push(model); throw new AIProviderTimeoutError("stub", 240_000); },
  } as unknown as IAIProvider);
  const result = await runPipelineStep("bank-timeout", deps);
  assert.equal(result.ok, false);
  const error = deps.store.jobs.get("bank-timeout")!.error!;
  assert.match(error, /javító kör után sem megfelelő/, "a csomag-ciklus futott végig, nem a szolgáltatói hiba lépett ki");
  assert.match(error, /időtúllépés/);
  assert.ok(models.length >= 4, `minden kísérlet sorra került (${models.length})`);
  assert.ok(models.includes("gpt-5.6-terra"), "a tartalék és a mentőkör az erős modellen fut");
});

for (const missingCall of [1, 2]) {
  test(`fogalomjavítás: hiányzó ${missingCall === 1 ? "author" : "lektor"} kulcsnál nem indul modellhívás`, async () => {
    const deps = makeDeps("{}");
    let checks = 0;
    deps.keyConfigured = () => ++checks !== missingCall;
    deps.providerFactory = () => { throw new Error("Nem indulhat fizetős hívás"); };
    const result = await fixConceptOnLesson("unused", "area", deps, "test");
    assert.equal(result.ok, false);
    assert.equal(checks, missingCall);
    assert.match("error" in result ? result.error : "", /kulcs/i);
  });
}

test("lektori timeout folytatása megőrzi a bankot és hibát, tartalmi hibát nem kerül meg", async () => {
  const deps = makeDeps("{}");
  const output = { lesson: standardFusionFixture(), experienceCheckpoint: { preserved: true } };
  const error = 'A(z) "lektor" lépés modellhívása hibára futott: a szolgáltató hibát jelzett ([xAI] Request timed out.)';
  deps.store.seed({ id: "timeout", mapId: "m1", step: "error", status: "error", lessonId: "saved-lesson", output, error });
  await retryTimedOutLektor("timeout", deps);
  const job = deps.store.jobs.get("timeout")!;
  assert.equal(job.step, "lektor");
  assert.equal(job.status, "pending");
  assert.deepEqual(job.output!.lesson, output.lesson);
  assert.deepEqual(job.output!.experienceCheckpoint, output.experienceCheckpoint);
  assert.equal(job.output!.previousLektorError, error);
  assert.equal(deps.calls.length, 0);
  job.step = "error"; job.status = "error"; job.error = "A lektor 1 tartalmi javítást kér.";
  await assert.rejects(retryTimedOutLektor("timeout", deps), /Csak mentett/);
  assert.equal(job.step, "error");
  job.step = "done";
  await retryTimedOutLektor("timeout", deps);
  assert.equal(job.step, "done");
});

test("a terminal one-step állapotot a generikus háttérhiba nem írja felül", async () => {
  __resetRunsForTest();
  const doneId = createRun();
  updateRun(doneId, { phase: "done", detail: "A lecke elkészült.", lessonId: "lesson-1" });
  recordOneStepFailure(doneId, new Error("readback-failed"));
  const done = await getRun(doneId);
  assert.equal(done?.phase, "done");
  assert.equal(done?.error, null);

  const parkedId = createRun();
  updateRun(parkedId, { phase: "parked", detail: "Forrásellenőrzés szükséges.", mapId: "map-1" });
  recordOneStepFailure(parkedId, new Error("readback-failed"));
  const parked = await getRun(parkedId);
  assert.equal(parked?.phase, "parked");
  assert.equal(parked?.error, null);
});

test("teljes Studio futás: valós lépésvezérlő, jóváhagyás, bank, kapu és visszaolvasott eredmény", async () => {
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
  lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => standardFusionFixture().experience! });
  const outline = { sections: [{ heading: lesson.sections[0].heading, conceptIds: ["area"], plannedBlocks: ["explain", "example", "animate", "recap"], animationSuggestions: [] }], misconceptions: [] };
  const deps = makeDeps("{}");
  deps.store.maps.set("m1", { meta: { id: "m1", title: lesson.title, subject: lesson.subject, classroom: lesson.classroom }, concepts });
  const answers = [outline, lesson, { notes: [] }]; let calls = 0; let publications = 0;
  // SPEC-VÁLTOZÁS (docs/specs/2026-09-29-egy-helyes-valasz.md, döntés 3): a bank-ellenőr vak megoldás nélkül is
  // fut, a lektorral párhuzamosan. A stub a bank-ellenőrnek a helyes opciónkénti ítéletet adja, a sorrendi
  // válaszlista (és a 3 lépéshívás) a többi lépésé marad.
  let verifierCalls = 0;
  deps.providerFactory = (model: string) => ({ name: "stub", model, isAvailable: async () => true,
    chat: async (messages: AIMessage[]) => (messages[0]?.content ?? "").includes("TÁMOGATÓ SKILL: bank-verifier")
      ? (verifierCalls++, { content: JSON.stringify({ errors: [], choices: keyedChoices(lesson) }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } })
      : { content: JSON.stringify(answers[calls++]), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
  } as unknown as IAIProvider);
  deps.store.publishLesson = async () => { publications++; return { htmlFileId: "published-fixture", exportedQuizItems: lesson.experience!.quiz.length }; };
  const started = await startJobFromMap("m1", undefined, deps); assert.ok(started.ok);
  const { store } = memoryWorkflows(); const input = { id: started.jobId, owner: "test", mode: "studio" as const };
  await assert.rejects(executeWorkflow(store, input, async () => {
    const first = await runPipelineStep(started.jobId, deps); assert.ok(first.ok);
    await advanceJob(started.jobId, first.next, { status: "ok" }, deps);
    throw new WorkflowWaiting("Vázlat jóváhagyása", true);
  }), WorkflowWaiting);
  const done = await executeWorkflow(store, { ...input, retry: true, continuation: true }, async () => {
    assert.equal((await approveOutline(started.jobId, outline, deps)).ok, true);
    for (let i = 0; i < 4; i++) {
      const step = await runPipelineStep(started.jobId, deps); assert.ok(step.ok, JSON.stringify(step));
      await advanceJob(started.jobId, step.next, { status: "running" }, deps);
    }
    await workflowPhase("readback");
    const job = await deps.store.loadJob(started.jobId); assert.equal(job!.step, "done");
    assert.equal(job!.output?.htmlFileId, "published-fixture");
    assert.ok(deps.store.lessons.has(job!.lessonId!));
    return { kind: "material", id: String(job!.output?.htmlFileId) };
  });
  assert.equal(done.state, "done"); assert.equal(publications, 1); assert.equal(calls, 3); assert.equal(verifierCalls, 1);
  assert.deepEqual(done.visits.map(v => v.step), ["pedagogue", "author", "animator", "lektor", "gate", "readback"]);
  assert.equal(done.visits[2].tokensOut, undefined, "újrahasznált banknál nincs kitalált tokenhasználat");
});

test("the pipeline prompt version fits the persisted job column", () => {
  const sqlType = studioJobs.promptVersion.getSQLType();
  const width = /^varchar\((\d+)\)$/.exec(sqlType);
  assert.ok(width, `Expected bounded prompt column, received ${sqlType}.`);
  assert.ok(PIPELINE_PROMPT_VERSION.length <= Number(width[1]),
    `Prompt version has ${PIPELINE_PROMPT_VERSION.length} characters; database allows ${width[1]}.`);
});

test("mért hiba 2026-09-19 (run b5d07f3d): a 2. körös, blokkolómentes lektorálás átmegy a 7.4 végkapun (a kapu az előző kör blokkolóival hashel)", async () => {
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
  lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => standardFusionFixture().experience! });
  const deps = makeDeps(JSON.stringify({ notes: [] }));
  deps.store.maps.set("m1", { meta: { id: "m1", title: lesson.title, subject: lesson.subject, classroom: lesson.classroom }, concepts });
  deps.store.seed({ id: "proof-r1", mapId: "m1", lessonId: "lesson-proof", step: "lektor", round: 1, output: { lesson } });
  // Round 0 blocked one bank item; round 1 reviews with that note as previousBlockers.
  await deps.store.saveNotes("proof-r1", classifyNotes([{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.tasks.0", message: "A minta rossz irányt ír." }]), 0);
  const reviewed = await runPipelineStep("proof-r1", deps);
  assert.ok(reviewed.ok, JSON.stringify(reviewed));
  assert.equal(reviewed.ok && reviewed.next.step, "gate");
  await advanceJob("proof-r1", reviewed.next, { status: "running" }, deps);
  let publications = 0;
  deps.store.publishLesson = async () => { publications++; return { htmlFileId: "published-r1", exportedQuizItems: lesson.experience!.quiz.length }; };
  const gated = await runPipelineStep("proof-r1", deps);
  assert.ok(gated.ok, `a kapu átenged: ${JSON.stringify(gated)}`);
  assert.equal(publications, 1);
});

for (const corruption of ["missing", "changed-lesson", "changed-source", "blocking"] as const) {
  test(`7.4 végkapu lektor-bizonyíték nélkül nem publikál: ${corruption}`, async () => {
    const lesson = standardFusionFixture(); lesson.mapId = "m1";
    const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
    lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => standardFusionFixture().experience! });
    const deps = makeDeps(JSON.stringify({ notes: [] }));
    deps.store.maps.set("m1", { meta: { id: "m1", title: lesson.title, subject: lesson.subject, classroom: lesson.classroom }, concepts });
    deps.store.seed({ id: "proof", mapId: "m1", lessonId: "lesson-proof", step: "lektor", output: { lesson } });
    const reviewed = await runPipelineStep("proof", deps); assert.ok(reviewed.ok);
    await advanceJob("proof", reviewed.next, { status: "running" }, deps);
    const job = deps.store.jobs.get("proof")!;
    if (corruption === "missing") delete job.output!.reviewInputHash;
    if (corruption === "changed-lesson") (job.output!.lesson as typeof lesson).title += " módosítva";
    if (corruption === "changed-source") deps.store.maps.get("m1")!.meta.title += " módosítva";
    if (corruption === "blocking") job.output!.report = { notes: [{ kind: "coverage_gap", subkind: "core", message: "Hiány" }] };
    let publications = 0;
    deps.store.publishLesson = async () => { publications++; throw new Error("Nem publikálhat"); };
    const gated = await runPipelineStep("proof", deps);
    assert.equal(gated.ok, false);
    assert.equal(publications, 0);
    assert.match("reason" in gated ? gated.reason ?? "" : "", /aktuális tanításhoz/);
  });
}

/**
 * LS-2c — the runner that finally pays model calls for pedagogue/author/lektor.
 *
 * The pure layer (step-io, run-step) is committed; this pins the orchestration:
 * one step per invocation, provider injectable, DB behind a thin store adapter,
 * fail-closed on schema/coverage violations, and an input-hash cache so a resumed
 * job never pays twice for the same input.
 */

const MAP_META: MapMeta = { id: "m1", title: "Sejtbiológia", subject: "biológia", classroom: 7 };
const MAP_CONCEPTS: MapConcept[] = [
  { localId: "c1", examWeight: "core" },
  { localId: "s1", examWeight: "supporting" },
];

const GOOD_OUTLINE = {
  sections: [
    {
      heading: "A sejt",
      conceptIds: ["c1", "s1"],
      plannedBlocks: ["explain", "check", "recap"],
      animationSuggestions: [],
    },
  ],
  misconceptions: [],
};

const GOOD_LESSON = {
  title: "A sejt",
  subject: "biológia",
  classroom: 7,
  mapId: "m1",
  sections: [
    {
      heading: "A sejt",
      probaEnabled: true,
      blocks: [
        {
          kind: "explain",
          text: "A sejt az élőlények alapegysége.",
          depth: "core",
          readAloud: true,
          coversConceptIds: ["c1"],
        },
      ],
    },
  ],
  misconceptions: [],
  sourceOnly: true,
};

const INVENTED_LESSON = JSON.stringify({
  ...GOOD_LESSON,
  sections: [
    {
      heading: "A sejt",
      probaEnabled: true,
      blocks: [
        {
          kind: "explain",
          text: "A sejt az élőlények alapegysége.",
          depth: "core",
          readAloud: true,
          coversConceptIds: ["c1", "kitalalt-id"],
        },
      ],
    },
  ],
});

type StoredJob = JobView & {
  model: string | null;
  promptVersion: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  finishedAt: Date | null;
};

class MemoryStore implements PipelineStore {
  jobs = new Map<string, StoredJob>();
  maps = new Map<string, { meta: MapMeta; concepts: MapConcept[] }>();
  notes = new Map<string, Array<LektorNote & { round: number }>>();
  lessons = new Map<string, { id: string; mapId: string; json: unknown }>();

  async loadJob(id: string): Promise<JobView | null> {
    return this.jobs.get(id) ?? null;
  }

  async loadMap(id: string) {
    return this.maps.get(id) ?? null;
  }

  async loadBlockerNotes(jobId: string, round: number) {
    return (this.notes.get(jobId) ?? [])
      .filter((n) => n.severity === "blocker" && n.round === round)
      .map((n) => ({ kind: n.kind, subkind: n.subkind, message: n.message, blockPath: n.blockPath }));
  }

  async loadReviewNotes(jobId: string, round: number) {
    return (this.notes.get(jobId) ?? []).filter(n => n.round === round);
  }

  async saveStep(id: string, patch: JobPatch): Promise<void> {
    const job = this.jobs.get(id);
    assert.ok(job, `saveStep: nincs ilyen job: ${id}`);
    Object.assign(job, patch);
  }

  async saveNotes(jobId: string, notes: LektorNote[], round: number): Promise<void> {
    this.notes.set(jobId, [
      ...(this.notes.get(jobId) ?? []),
      ...notes.map((n) => ({ ...n, round })),
    ]);
  }

  async publishLesson(): Promise<{ htmlFileId: string; exportedQuizItems: number }> {
    throw new Error("publishLesson: ebben a tesztben a kapu nem futhat");
  }

  async upsertLesson(lessonId: string | null, mapId: string, json: unknown): Promise<string> {
    if (lessonId) {
      const row = this.lessons.get(lessonId);
      assert.ok(row, `upsertLesson: nincs ilyen lecke: ${lessonId}`);
      row.json = json;
      return lessonId;
    }
    const id = `lesson-${this.lessons.size + 1}`;
    this.lessons.set(id, { id, mapId, json });
    return id;
  }

  async createJob(input: {
    mapId: string;
    step: "pedagogue";
    status: string;
    model: string;
    promptVersion: string;
    inputHash: string;
  }): Promise<string> {
    const id = `job-${this.jobs.size + 1}`;
    this.jobs.set(id, {
      id,
      lessonId: null,
      mapId: input.mapId,
      step: input.step,
      status: input.status,
      round: 0,
      inputHash: input.inputHash,
      output: null,
      error: null,
      model: input.model,
      promptVersion: input.promptVersion,
      tokensIn: null,
      tokensOut: null,
      finishedAt: null,
    });
    return id;
  }

  /** Test-only: seed an arbitrary job state. */
  seed(job: Partial<StoredJob> & { id: string; mapId: string; step: StoredJob["step"] }): void {
    this.jobs.set(job.id, {
      lessonId: null,
      status: "pending",
      round: 0,
      inputHash: "",
      output: null,
      error: null,
      model: null,
      promptVersion: null,
      tokensIn: null,
      tokensOut: null,
      finishedAt: null,
      ...job,
    });
  }
}

function makeDeps(cannedResponse: string) {
  const store = new MemoryStore();
  store.maps.set("m1", { meta: MAP_META, concepts: MAP_CONCEPTS });

  // The prompt lookup is the DB-backed seam: production uses studioPromptStore (which
  // reads `system_prompts` and fails open to the inline prompt); the test keeps the
  // inline builder result and records which prompt name the runner asked for.
  const promptNames: string[] = [];
  const promptLookup = async (name: string, fallback: string) => {
    promptNames.push(name);
    return fallback;
  };

  const calls: Array<{ model: string; system: string; user: string }> = [];
  const providerFactory = (model: string): IAIProvider => ({
    name: "stub",
    model,
    chat: async (messages: AIMessage[]) => {
      calls.push({ model, system: messages[0]?.content ?? "", user: messages[1]?.content ?? "" });
      // Review R1(c) (spec „Review-javítás 2026-09-29”): az ítélet nélküli egyválasztós tétel mindig kapu-jelzés, ezért
      // a bank-ellenőr hívására a stub a helyes modell viselkedését adja: a lektorált lecke kulcsa szerinti ítéletet.
      if ((messages[0]?.content ?? "").includes("TÁMOGATÓ SKILL: bank-verifier")) {
        const reviewed = [...store.jobs.values()].find((j) => j.step === "lektor" && (j.output?.lesson as Lesson | undefined)?.experience);
        const choices = reviewed ? keyedChoices(reviewed.output!.lesson as Lesson) : [];
        return { content: JSON.stringify({ errors: [], choices }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
      }
      return { content: cannedResponse, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    isAvailable: async () => true,
  } as unknown as IAIProvider);

  return { store, calls, promptNames, promptLookup, providerFactory, keyConfigured: () => true };
}

for (const repair of ["valid", "unknown-id", "invalid-schema", "provider-error"] as const) {
  test(`author concept-id repair: ${repair}`, async () => {
    const correctId = "terulet-mertekegysege";
    const typo = "terulet-mertekegyseg";
    const valid = structuredClone(GOOD_LESSON);
    valid.sections[0].blocks[0].coversConceptIds = [correctId];
    const broken = structuredClone(valid);
    broken.sections[0].blocks[0].coversConceptIds = [typo];
    const deps = makeDeps("");
    deps.store.maps.set("m1", { meta: MAP_META, concepts: [{ localId: correctId, examWeight: "core" }] });
    deps.store.seed({ id: "id-repair", mapId: "m1", step: "author", status: "running", output: { approvedOutline: GOOD_OUTLINE } });
    let calls = 0;
    const providerFactory = (model: string) => ({
      ...deps.providerFactory(model),
      chat: async (messages: AIMessage[]) => {
        calls++;
        if (calls === 2) {
          assert.ok(messages[1].content.includes(typo));
          const payload = JSON.parse(messages[1].content.slice(messages[1].content.lastIndexOf('\n') + 1));
          assert.deepEqual(payload.previousLesson, broken);
          assert.deepEqual(payload.allowedConceptIds, [correctId]);
          assert.ok(payload.originalInput);
          if (repair === "provider-error") throw new Error("test provider failure");
        }
        return { content: JSON.stringify(calls === 1 || repair === "unknown-id" ? broken : repair === "invalid-schema" ? { sections: [] } : valid),
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
      },
    });
    const result = await runPipelineStep("id-repair", { ...deps, providerFactory });
    assert.equal(calls, 2, "exactly one correction, no endless regeneration");
    assert.equal(result.ok, repair === "valid");
    assert.equal(deps.store.lessons.size, repair === "valid" ? 1 : 0);
    if (result.ok) {
      assert.equal(result.next.step, "animator");
      assert.deepEqual([...deps.store.lessons.values()][0].json, valid);
      const job = deps.store.jobs.get("id-repair");
      assert.equal(job?.tokensIn, 20);
      assert.equal(job?.tokensOut, 10);
    } else {
      assert.equal((await deps.store.loadJob("id-repair"))?.status, "error");
    }
  });
}

test("lektor receives measured inflection scores from the current lesson, including failed samples", async () => {
  const lesson = standardFusionFixture();
  const base = lesson.experience!.tasks[0];
  lesson.experience!.tasks = [
    { ...base, id: "body", minWords: 1, needsSentence: false, sample: "A virágos növények testét növényi szervek építik fel.", required: [["növényi szervek", "szervek"], ["virágos növények teste", "virágos növény testét"]] },
    { ...base, id: "lily", minWords: 1, needsSentence: false, sample: "A liliom lepellevelei két körben helyezkednek el, egyformák, és alakjukban, színükben nem különülnek el.", required: [["lepellevelek", "lepellevél"], ["egyformák", "egyforma"], ["két körben", "két kör"], ["nem különülnek el", "nem különülnek", "nem különül el"]] },
    { ...base, id: "wrong", minWords: 1, sample: "Bicikli", required: [["gyökér"]] },
  ];
  const deps = makeDeps(JSON.stringify({ notes: [] }));
  deps.store.seed({ id: "scoring", mapId: "m1", step: "lektor", output: { lesson, sampleGradingEvidence: [{ id: "stale", score: 1 }] } });
  await runPipelineStep("scoring", { ...deps, promptLookup: async () => "Konfigurált lektori prompt." });
  // SPEC-VÁLTOZÁS (docs/specs/2026-09-29-egy-helyes-valasz.md, döntés 3): a bank-ellenőr vak megoldás nélkül is
  // fut a lektorral párhuzamosan, ezért a lektor-hívást tartalom szerint választjuk ki (nem a 0. hívás).
  const lektorCall = deps.calls.find((c) => !c.system.includes("TÁMOGATÓ SKILL: bank-verifier"))!;
  const evidenceText = lektorCall.system.split("A program pontozási mérése (adat):\n")[1];
  assert.equal(lektorCall.system.split("A program pontozási mérése (adat):\n").length, 2, "configured prompts include the evidence exactly once");
  assert.ok(evidenceText, "the measured scores must reach the actual provider request");
  const evidence = JSON.parse(evidenceText.split("\n")[0]);
  assert.deepEqual(evidence.map((e: { id: string; blockPath: string; score: number }) => [e.id, e.blockPath, e.score]),
    [["body", "experience.tasks.0", 1], ["lily", "experience.tasks.1", 1], ["wrong", "experience.tasks.2", 0]]);
  assert.deepEqual(evidence[0].missingRequired, []);
  assert.deepEqual(evidence[2].missingRequired, [["gyökér"]]);
  assert.match(lektorCall.system, /tényleges értékelő/);
  assert.match(lektorCall.system, /tartalmi helyesség/);
  const defaultEvidence = buildLektorPrompt(lesson, { ...MAP_META, concepts: MAP_CONCEPTS }).split("A program pontozási mérése (adat):\n")[1];
  assert.deepEqual(JSON.parse(defaultEvidence), evidence, "direct lesson repair receives the same measured evidence");
  const legacy = makeDeps(JSON.stringify({ notes: [] }));
  legacy.store.seed({ id: "legacy", mapId: "m1", step: "lektor", output: { lesson: GOOD_LESSON } });
  await runPipelineStep("legacy", legacy);
  assert.equal(legacy.calls[0].system.includes("A program pontozási mérése (adat):"), false);
});

test("lektor-tanítás 2026-09-24: a vak megoldó jobonként egyszer fut, a lektor független bizonyítékként kapja", async () => {
  const base = makeDeps("");
  base.store.maps.set("m1", { meta: { ...MAP_META, sourceText: "9. Marci, Gergő, Réka és Janka tömör téglatestet épített…" }, concepts: MAP_CONCEPTS });
  const calls: Array<{ model: string; system: string; user: string }> = [];
  const providerFactory = (model: string): IAIProvider => ({
    name: "stub", model,
    chat: async (messages: AIMessage[]) => {
      calls.push({ model, system: messages[0]?.content ?? "", user: messages[1]?.content ?? "" });
      const content = model === BLIND_SOLVER_MODEL
        ? JSON.stringify({ solutions: [{ task: "Téglatest: élek", answer: "7, 11, 6" }, { task: "Réka", answer: "NINCS ELÉG ADAT" }] })
        : JSON.stringify({ solutions: [{ task: "Téglatest: élek", own: "7, 11, 6", lesson: "7, 11, 6", match: true }], notes: [] });
      return { content, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    isAvailable: async () => true,
  } as unknown as IAIProvider);
  base.store.seed({ id: "blind", mapId: "m1", step: "lektor", output: { lesson: GOOD_LESSON } });
  await runPipelineStep("blind", { ...base, providerFactory });
  const solver = calls.filter((c) => c.model === BLIND_SOLVER_MODEL);
  assert.equal(solver.length, 1, "a vak megoldó egyszer fut");
  assert.doesNotMatch(solver[0].user + solver[0].system, /A sejt az élőlények/, "a vak megoldó NEM látja a leckét");
  const lektor = calls.find((c) => c.model !== BLIND_SOLVER_MODEL)!;
  assert.match(lektor.system, /FÜGGETLEN VAK MEGOLDÁSOK[^]*7, 11, 6/);
  assert.doesNotMatch(lektor.system, /NINCS ELÉG ADAT"/, "a bizonytalan tétel kimarad");
  const job = base.store.jobs.get("blind")!;
  assert.equal((job.output?.blindSolutions as { solutions: unknown[] }).solutions.length, 1, "a vak megoldás a jobban tárolódik");
  assert.equal((job.output?.report as { solutions?: unknown[] }).solutions?.length, 1, "a lektor önálló megoldása tárolódik");
  // Második lektorkör: a gyorsítótár szolgál, nincs újabb vak megoldó hívás.
  job.step = "lektor"; job.round = 1; job.status = "running";
  await runPipelineStep("blind", { ...base, providerFactory });
  assert.equal(calls.filter((c) => c.model === BLIND_SOLVER_MODEL).length, 1, "körönként nem fut újra");
});

test("kész, forrásfogalomhoz kötött ábrák: nulla animátorhívás, utána a lektor ténylegesen fut", async () => {
  const lesson = standardFusionFixture();
  delete lesson.experience;
  const deps = makeDeps(JSON.stringify({ notes: [] }));
  deps.store.seed({ id: "reuse", mapId: "m1", step: "animator", output: { lesson } });
  const result = await runPipelineStep("reuse", deps);
  assert.ok(result.ok && result.next.step === "lektor");
  assert.equal(deps.calls.length, 0);
  const saved = deps.store.jobs.get("reuse")!;
  assert.deepEqual(saved.output?.lesson, lesson);
  assert.equal(saved.output?.animatorReused, true);
  assert.equal(saved.model, null, "kihagyott hívás nem szerepel modellfutásként");
  assert.equal(saved.tokensIn, 0);
  saved.step = "lektor";
  const checked = await runPipelineStep("reuse", deps);
  assert.ok(checked.ok && checked.next.step === "gate");
  assert.equal(deps.calls.length, 1, "a tartalmi ellenőrzés nem maradhat ki");
});

test("a kész bank és ábra változatlan újrafuttatása megtartja a kérdésazonosítókat modellhívás nélkül", async () => {
  const lesson = standardFusionFixture();
  const packet = lesson.experience!;
  const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
  lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => packet });
  const deps = makeDeps("{}");
  deps.store.maps.set("m1", { meta: MAP_META, concepts });
  deps.store.seed({ id: "bank-reuse", mapId: "m1", step: "animator", output: { lesson } });
  const result = await runPipelineStep("bank-reuse", deps);
  assert.ok(result.ok);
  assert.equal(deps.calls.length, 0);
  assert.deepEqual((deps.store.jobs.get("bank-reuse")?.output?.lesson as typeof lesson).experience?.quiz, lesson.experience.quiz);
});

test("hibás vagy helyőrző ábra, tanítatlan fogalom, hiányzó szakaszábra nem jogosít újrahasználatra", () => {
  const lesson = standardFusionFixture();
  assert.equal(canReuseLessonVisuals(lesson), true);
  assert.equal(canReuseLessonVisuals({}), false);
  const noData = structuredClone(lesson);
  const visual = noData.sections[0].blocks.find(b => b.kind === "animate")!;
  assert.equal(visual.kind, "animate");
  if (visual.kind !== "animate") throw new Error("Hiányzó tesztábra");
  visual.params = {};
  assert.equal(canReuseLessonVisuals(noData), false);
  visual.params = { steps: ["", ""] };
  assert.equal(canReuseLessonVisuals(noData), false);
  visual.params = { steps: ["Első lépés", "Második lépés"] };
  visual.coversConceptIds = ["nem-tanított"];
  assert.equal(canReuseLessonVisuals(noData), false);
  const missing = structuredClone(lesson);
  missing.sections.push({ ...missing.sections[0], blocks: missing.sections[0].blocks.filter(b => b.kind !== "animate") });
  assert.equal(canReuseLessonVisuals(missing), false);
});

// Spec §7o (mérve, 5. mérés, run a0eb2bed): csak-bank körben az ábra-modellhívás újra lefutott (glm 609 s +
// deepseek 113 s, mindkettő hosszkorlát) és semmit nem adott — a lektorált szöveg és ábrái változatlanok maradnak.
test("csak-bank körben nincs ábra-modellhívás akkor sem, ha az ábrák nem újrahasznosíthatók", async () => {
  const lesson = standardFusionFixture();
  const packet = structuredClone(lesson.experience!);
  const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
  lesson.subject = MAP_META.subject; lesson.classroom = MAP_META.classroom; lesson.mapId = "m1";
  // Nem renderelhető ábra (egylépéses folyamat): az ábra önmagában nem újrahasznosítható, a tanítás változatlan.
  for (const block of lesson.sections[0].blocks) if (block.kind === "animate") block.params = { steps: ["egyetlen lépés"] };
  assert.equal(canReuseLessonVisuals(lesson), false);
  let checkpoint: ExperienceCheckpoint | undefined;
  lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => packet, save: async cp => { checkpoint = structuredClone(cp); } });
  const notes = [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.tasks.0", message: "RUBRIKA-HIBA: több helyes példát enged a kérdés." }];
  const deps = makeDeps(JSON.stringify({ notes }));
  deps.store.maps.set("m1", { meta: MAP_META, concepts });
  deps.store.seed({ id: "bank-only-visuals", mapId: "m1", step: "lektor", output: { lesson, experienceCheckpoint: checkpoint, methodVersion: lesson.experience.version } });
  const reviewed = await runPipelineStep("bank-only-visuals", deps);
  assert.ok(reviewed.ok && reviewed.next.step === "animator" && reviewed.next.round === 1, JSON.stringify(reviewed));
  const job = deps.store.jobs.get("bank-only-visuals")!;
  job.step = "animator"; job.round = 1; job.status = "ok";
  const bankDeps = makeDeps(JSON.stringify({ tasks: lesson.experience.tasks }));
  const repaired = await runPipelineStep(job.id, { ...bankDeps, store: deps.store });
  assert.ok(repaired.ok, `${JSON.stringify(repaired)} ${job.error ?? ""}`);
  assert.equal(bankDeps.calls.length, 1, "egyetlen hívás: a bankcsomag — ábra-modellhívás nélkül");
  assert.match(bankDeps.calls[0].system, /RUBRIKA-HIBA/);
  const after = (job.output?.lesson as typeof lesson).sections[0].blocks.find(b => b.kind === "animate");
  assert.deepEqual(after && after.kind === "animate" ? after.params : null, { steps: ["egyetlen lépés"] }, "a szöveg és az ábrák változatlanok");
});

test("lektori bankhiba közvetlenül a banképítőhöz jut (csak-bank kör); a nyelvi javítás sem vész el", async () => {
  const lesson = standardFusionFixture();
  const packet = structuredClone(lesson.experience!);
  const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
  lesson.subject = MAP_META.subject; lesson.classroom = MAP_META.classroom; lesson.mapId = "m1";
  let checkpoint: ExperienceCheckpoint | undefined;
  lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => packet, save: async cp => { checkpoint = structuredClone(cp); } });
  const notes = [
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.tasks.0", message: "RUBRIKA-HIBA: több helyes példát enged a kérdés." },
    { kind: "language", blockPath: "experience.tasks.1.sample", message: "NYELVI-HIBA: hibás alany." },
    { kind: "source_conflict", subkind: "book_probably_wrong", message: "ADMIN-ONLY-FORRAS" },
  ];
  const deps = makeDeps(JSON.stringify({ notes }));
  deps.store.maps.set("m1", { meta: MAP_META, concepts });
  deps.store.seed({ id: "review-bank", mapId: "m1", step: "lektor", output: { lesson, experienceCheckpoint: checkpoint, methodVersion: lesson.experience.version } });
  // Spec-változás 2026-09-19 (mérve run b5d07f3d): ha minden blokkoló banktétel, nincs szerzői
  // kör — a lektor közvetlenül a csak-bank animátor körre küld, a nyelvi jegyzet is a banképítőé.
  const reviewed = await runPipelineStep("review-bank", deps);
  assert.ok(reviewed.ok && reviewed.next.step === "animator" && reviewed.next.round === 1, JSON.stringify(reviewed));
  const job = deps.store.jobs.get("review-bank")!;
  assert.equal(job.output?.reportRound, 0);
  assert.equal(job.output?.bankOnlyRepairRound, 1);
  job.step = "animator"; job.round = 1; job.status = "ok";
  const bankDeps = makeDeps(JSON.stringify({ tasks: lesson.experience.tasks }));
  assert.ok((await runPipelineStep(job.id, { ...bankDeps, store: deps.store })).ok);
  assert.equal(bankDeps.calls.length, 1);
  assert.match(bankDeps.calls[0].system, /RUBRIKA-HIBA/); assert.match(bankDeps.calls[0].system, /NYELVI-HIBA/);
  assert.match(bankDeps.calls[0].system, /previousItem/);
  assert.doesNotMatch(bankDeps.calls[0].system, /ADMIN-ONLY-FORRAS/);
  const result = (job.output?.lesson as typeof lesson).experience!;
  assert.equal(result.quiz.length, packet.quiz.length);
  job.round = 2;
  const staleDeps = makeDeps("{}");
  assert.ok((await runPipelineStep(job.id, { ...staleDeps, store: deps.store })).ok);
  assert.equal(staleDeps.calls.length, 0);
  assert.deepEqual((job.output?.lesson as typeof lesson).experience, result);
});

/** The pedagogue input hash the runner must compute — recomputed here to pin equality. */
function pedagogueHash(): string {
  return computeStepHash(
    "pedagogue",
    PIPELINE_PROMPT_VERSION,
    {
      map: { id: MAP_META.id, title: MAP_META.title, subject: MAP_META.subject, classroom: MAP_META.classroom },
      concepts: MAP_CONCEPTS,
    },
    0,
  );
}

const CANNED_PEDAGOGUE = JSON.stringify(GOOD_OUTLINE);
const CANNED_AUTHOR = JSON.stringify(GOOD_LESSON);

test("a tárolt prompt mellett is eljut a teljes forrás a tényleges modellkérésbe", async () => {
  for (const step of ['pedagogue','author','animator','lektor'] as const) {
    const deps=makeDeps(step==='pedagogue'?CANNED_PEDAGOGUE:step==='lektor'?JSON.stringify({notes:[]}):CANNED_AUTHOR);
    deps.store.maps.get('m1')!.concepts=[{id:'internal-uuid-should-not-leak',localId:'c1',examWeight:'core',term:'A sejt',definition:'Az élőlények szerkezeti alapegysége.',quote:'A sejt az élőlények alapegysége.'},MAP_CONCEPTS[1]];
    deps.store.seed({id:'evidence',mapId:'m1',step,output:{approvedOutline:GOOD_OUTLINE,lesson:GOOD_LESSON}});
    await runPipelineStep('evidence',{...deps,promptLookup:async()=> 'Egyéni stílus: tömör magyar szöveg.'});
    assert.equal(deps.calls.length,1);
    const system=deps.calls[0].system;
    assert.ok(system.includes('Egyéni stílus'));
    assert.ok(system.includes('Az élőlények szerkezeti alapegysége.'));
    assert.ok(system.includes('A sejt az élőlények alapegysége.'));
    assert.ok(system.includes('"term": "A sejt"'));
    assert.ok(!system.includes('internal-uuid-should-not-leak'));
  }
});

test("megváltozott tárolt prompt érvényteleníti a modellválasz gyorsítótárát", async () => {
  const deps=makeDeps(CANNED_PEDAGOGUE);
  deps.store.seed({id:'prompt-cache',mapId:'m1',step:'pedagogue',output:null});
  let style='Stílus A';const options={...deps,promptLookup:async()=>style};
  await runPipelineStep('prompt-cache',options);
  const cached=await runPipelineStep('prompt-cache',options);
  assert.ok(cached.ok);assert.equal(cached.cached,true);
  style='Stílus B';
  await runPipelineStep('prompt-cache',options);
  assert.equal(deps.calls.length,2);
  assert.ok(deps.calls[1].system.includes('Stílus B'));
});

test("a szerző metaadata nem írhatja felül a forrásból felismert osztályt és térképet", async () => {
  const deps=makeDeps(JSON.stringify({...GOOD_LESSON,classroom:4,subject:"téves",mapId:"kitalált"}));
  deps.store.seed({id:"scope",mapId:"m1",step:"author",output:{approvedOutline:GOOD_OUTLINE}});
  assert.equal((await runPipelineStep("scope",deps)).ok,true);
  const lesson=deps.store.jobs.get("scope")?.output?.lesson as typeof GOOD_LESSON;
  assert.equal(lesson.classroom,7);assert.equal(lesson.subject,"biológia");assert.equal(lesson.mapId,"m1");
});

test("a kapu konkrét hibái és az előző lecke visszajutnak a szerző javító köréhez", async () => {
  // Spec 2026-09-30 (U4, C4): a kapu fejezethez kötött hibája CÉLZOTT módot jelent — a szerző folt-alakban válaszol.
  const deps = makeDeps(JSON.stringify({ sections: { "0": GOOD_LESSON.sections[0] } }));
  const gate = {ok:false,reasons:["A fogalom magyarázata hiányzik"],ungrounded:[{blockIndex:0,conceptId:"c1"}]};
  deps.store.seed({id:"retry",mapId:"m1",step:"author",round:1,output:{approvedOutline:GOOD_OUTLINE,lesson:GOOD_LESSON,gate}});
  assert.equal((await runPipelineStep("retry",deps)).ok,true);
  const input=JSON.parse(deps.calls[0].system.split('A kapu javítandó megállapításai és az előző lecke:\n')[1]);
  assert.deepEqual(input.gateFeedback,gate);
  assert.deepEqual(input.previousLesson,GOOD_LESSON);
});

test("a lektori javítókör már a még le nem futott fogalmi kapu hibáit is megkapja", async () => {
  const deps = makeDeps(CANNED_AUTHOR);
  deps.store.maps.get("m1")!.concepts[0] = { localId: "c1", examWeight: "core", term: "háromszög területe" };
  deps.store.seed({ id: "early-gate", mapId: "m1", step: "author", round: 1,
    output: { approvedOutline: GOOD_OUTLINE, lesson: GOOD_LESSON, reportRound: 0, report: { notes: [] } } });
  assert.ok((await runPipelineStep("early-gate", deps)).ok);
  const gateData = deps.calls[0].system.split("A kapu javítandó megállapításai és az előző lecke:\n")[1];
  assert.ok(gateData, "A szerzőnek már most meg kell kapnia a kapu hibáit.");
  const input = JSON.parse(gateData);
  assert.equal(input.gateFeedback?.ok, false);
  assert.ok(input.gateFeedback.ungrounded.some((u: { conceptId: string }) => u.conceptId === "c1"));
  assert.match(deps.calls[0].system, /háromszög területe/);
  assert.equal(deps.store.jobs.get("early-gate")!.output?.gate, undefined,
    "A korai mérés nem válhat a későbbi, már javított lecke elavult kapujelentésévé.");
});

test("tiszta lektor utáni kapujavítás megőrzi az előző kör feloldott bankjavítását", async () => {
  const lesson = standardFusionFixture();
  lesson.mapId = "m1";
  const packet = structuredClone(lesson.experience!);
  const feedback = [{ note: { kind: "source_conflict", subkind: "contradicts_source", message: "KORABBI-PONTOZAS", blockPath: "experience.tasks.0" },
    conceptIds: ["area"], previousItem: packet.tasks[0] }];
  for (const [priorRound, priorMap, expectedCount] of [[1, "m1", 1], [0, "m1", 0], [1, "other-map", 0]] as const) {
    lesson.mapId = priorMap;
    const deps = makeDeps(JSON.stringify({ ...lesson, experience: undefined }));
    deps.store.maps.set("m1", { meta: MAP_META, concepts: [{ localId: "area", examWeight: "core" }] });
    deps.store.seed({ id: "carry-review", mapId: "m1", step: "author", round: 2,
      output: { approvedOutline: GOOD_OUTLINE, lesson, methodVersion: packet.version, reportRound: 1, report: { notes: [] },
        gate: { ok: false, reasons: ["Fogalmi pontosítás"] }, bankReview: { round: priorRound, feedback: [...feedback,
          { note: { kind: "source_conflict", subkind: "book_probably_wrong", message: "ADMIN-ONLY-NEM-OROKOLHETO" } }] } } });
    assert.ok((await runPipelineStep("carry-review", deps)).ok);
    const job = deps.store.jobs.get("carry-review")!;
    const saved = job.output?.bankReview as { round: number; feedback: unknown[] };
    assert.equal(saved.round, 2);
    assert.equal(saved.feedback.length, expectedCount);
    if (expectedCount === 1) {
      assert.deepEqual(saved.feedback, feedback);
      job.step = "animator";
      const bankDeps = makeDeps(JSON.stringify(packet));
      assert.ok((await runPipelineStep(job.id, { ...bankDeps, store: deps.store })).ok);
      assert.match(bankDeps.calls[0].system, /KORABBI-PONTOZAS/);
      assert.match(bankDeps.calls[0].system, /previousItem/);
      assert.doesNotMatch(bankDeps.calls[0].system, /ADMIN-ONLY-NEM-OROKOLHETO/);
    }
  }
});
const CANNED_LEKTOR_BENIGN = JSON.stringify({
  notes: [{ kind: "source_conflict", subkind: "book_probably_wrong", message: "A könyv téved." }],
});
const CANNED_LEKTOR_BLOCKER = JSON.stringify({
  notes: [{ kind: "source_conflict", subkind: "not_in_map", message: "A c1 állítás nincs a térképen." }],
});

test("végső lektorhiba az aktuális jelentést menti és megnevezi a valódi okot", async () => {
  const lesson = standardFusionFixture();
  const deps = makeDeps(CANNED_LEKTOR_BLOCKER);
  deps.store.seed({ id: "final-review", mapId: "m1", step: "lektor", round: 2,
    output: { lesson, report: { notes: [] }, reportRound: 1 } });
  const result = await runPipelineStep("final-review", deps);
  assert.equal(result.ok, false);
  const job = deps.store.jobs.get("final-review")!;
  assert.match(job.error!, /A c1 állítás nincs a térképen/);
  assert.equal(job.output!.reportRound, 2);
  assert.deepEqual(job.output!.report, JSON.parse(CANNED_LEKTOR_BLOCKER));
});

test("(a) pedagogue: a vázlat elmentődik, a következő lépés author", async () => {
  const { store, calls, promptNames, providerFactory, keyConfigured, promptLookup } = makeDeps(CANNED_PEDAGOGUE);
  const jobId = await store.createJob({
    mapId: "m1",
    step: "pedagogue",
    status: "pending",
    model: "x-ai/grok-4.6",
    promptVersion: PIPELINE_PROMPT_VERSION,
    inputHash: pedagogueHash(),
  });

  const outcome = await runPipelineStep(jobId, { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "author");
  assert.equal(calls.length, 1, "pontosan egy modellhívás");
  assert.ok(calls[0].system.includes("Sejtbiológia"), "a térkép címe a promptban");

  const job = await store.loadJob(jobId);
  assert.equal(job?.status, "ok");
  // Spec 2026-09-20 (színes tananyag): a runner véletlen világot javasol; az input és a prompt is tartalmazza.
  const world = visualWorld((job?.output?.visual as { world?: string } | undefined)?.world)!;
  assert.ok(world, "a pedagógus rögzíti a vizuális világot");
  assert.equal(job?.inputHash, computeStepHash("pedagogue", PIPELINE_PROMPT_VERSION, {
    input: { map: MAP_META, concepts: MAP_CONCEPTS, visual: world.id },
    // Szerep-skill (2026-09-19): az effektív prompt a pedagógus skilljével indul, a hash ezt is rögzíti.
    system: withRoleSkill("pedagogue", buildPedagoguePrompt({title: MAP_META.title, subject: MAP_META.subject, classroom: MAP_META.classroom, concepts: MAP_CONCEPTS}, world)),
  }, 0), "a vázlat hash-e a bemenetet és az effektív promptot is rögzíti");
  assert.deepEqual(job?.output?.outline, GOOD_OUTLINE);

  // The system prompt is fetched through the prompt store under the versioned name
  // (studio.pedagogue.v1) — the owner can revise it in `system_prompts` without a deploy.
  assert.deepEqual(promptNames, ["studio.pedagogue.v1"]);

  const stored = store.jobs.get(jobId);
  assert.equal(stored?.tokensIn, 10);
  assert.equal(stored?.tokensOut, 5);
});

test("(b) pedagogue: a térképet nem fedő vázlat hibára fut, megnevezve a hiányzót", async () => {
  const badOutline = JSON.stringify({
    sections: [{ heading: "Fél", conceptIds: ["s1"], plannedBlocks: ["explain"] }],
    misconceptions: [],
  });
  const { store, providerFactory, keyConfigured, promptLookup } = makeDeps(badOutline);
  const jobId = await store.createJob({
    mapId: "m1",
    step: "pedagogue",
    status: "pending",
    model: "x-ai/grok-4.6",
    promptVersion: PIPELINE_PROMPT_VERSION,
    inputHash: pedagogueHash(),
  });

  const outcome = await runPipelineStep(jobId, { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.next.step, "error");
  assert.match(outcome.reason, /c1/, "a hiányzó kulcsfogalom megnevezve");

  const job = await store.loadJob(jobId);
  assert.equal(job?.status, "error");
  assert.equal(job?.step, "error");
  assert.match(job?.error ?? "", /c1/);
  assert.equal(job?.output, null, "félkész vázlat soha nem kerül a jobra");
});

test("(c) author: a lecke elmentődik, a következő lépés animator", async () => {
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeDeps(CANNED_AUTHOR);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "author",
    status: "running",
    output: { approvedOutline: GOOD_OUTLINE },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "animator");
  assert.equal(calls.length, 1);

  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok");
  assert.deepEqual(job?.output?.lesson, GOOD_LESSON);
  assert.ok(job?.lessonId, "a lecke-sor létrejött és a job hivatkozza");
  assert.deepEqual(store.lessons.get(job?.lessonId ?? "")?.json, GOOD_LESSON);
});

test("(d) author: kitalált fogalom-azonosítóval a lecke hibára fut, megnevezve", async () => {
  const { store, providerFactory, keyConfigured, promptLookup } = makeDeps(INVENTED_LESSON);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "author",
    status: "running",
    output: { approvedOutline: GOOD_OUTLINE },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.next.step, "error");
  assert.match(outcome.reason, /kitalalt-id/);

  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "error");
  assert.equal(store.lessons.size, 0, "nem jött létre lecke-sor");
});

test("(e) lektor: csak book_probably_wrong jegyzet → gate, 0 blokkoló", async () => {
  const { store, providerFactory, keyConfigured, promptLookup } = makeDeps(CANNED_LEKTOR_BENIGN);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "lektor",
    status: "running",
    output: { lesson: GOOD_LESSON },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "gate");

  const job = await store.loadJob("job-1");
  assert.deepEqual(job?.output?.blockers, 0);
  const notes = store.notes.get("job-1") ?? [];
  assert.equal(notes.length, 1);
  assert.equal(notes[0].severity, "info", "a book_probably_wrong az adminé, nem blokkol (D1)");
});

test("(f) lektor: not_in_map blokkoló → author, round+1", async () => {
  const { store, providerFactory, keyConfigured, promptLookup } = makeDeps(CANNED_LEKTOR_BLOCKER);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "lektor",
    status: "running",
    round: 0,
    output: { lesson: GOOD_LESSON },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "author");
  assert.equal(outcome.ok && outcome.next.round, 1);

  const job = await store.loadJob("job-1");
  assert.deepEqual(job?.output?.blockers, 1);
  const notes = store.notes.get("job-1") ?? [];
  assert.equal(notes.length, 1);
  assert.equal(notes[0].severity, "blocker");
});

test("(g) lektor: round>=2 blokkolókkal → LS-7 (#189): a kapu dönt, jelzéssel", async () => {
  // SPEC-VÁLTOZÁS (tulajdonosi döntés, 2026-09-06): nincs emberi kapu. A limit
  // után a blokkoló nem öli meg a futást — a kapu felé megy, és a hiány
  // `qualityNotes` jelzésként utazik a leckével.
  const { store, providerFactory, keyConfigured, promptLookup } = makeDeps(CANNED_LEKTOR_BLOCKER);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "lektor",
    status: "running",
    round: 2,
    output: { lesson: GOOD_LESSON },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true, "a futás nem hal meg");
  assert.equal(outcome.next.step, "gate", "a lektor a kapu felé enged, nem error-ra");

  // A `step` léptetése az advanceJob dolga (a hívó végzi) — itt a lépés SAJÁT
  // mentését ellenőrizzük: nem hibás, és a blokkoló jelzésként megmaradt.
  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok", "nem error-ra mentette a lépést");
  assert.notEqual(job?.step, "error");
  const notes = (job?.output as { qualityNotes?: Array<{ reason: string; note: string }> })?.qualityNotes ?? [];
  assert.equal(notes.length, 1, "a blokkoló jelzésként megmarad");
  assert.equal(notes[0].reason, "lektor_blocker");
  assert.match(notes[0].note ?? "", /lektor/i);
});

test("(h) approve-outline: ismeretlen azonosítójú vázlat elutasítva, hívás nélkül", async () => {
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeDeps(CANNED_AUTHOR);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "author",
    status: "ok",
    output: { outline: GOOD_OUTLINE },
  });

  const bad = {
    sections: [
      {
        heading: "Hamis",
        conceptIds: ["c1", "s1", "kitalalt-id"],
        plannedBlocks: ["explain"],
      },
    ],
    misconceptions: [],
  };
  const result = await approveOutline("job-1", bad, { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(result.ok, false);
  assert.match(result.reason, /kitalalt-id/);
  assert.equal(calls.length, 0, "elutasított vázlatért nem fizetünk");

  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok", "a job várakozik, nem futott el");
  assert.equal(job?.output?.approvedOutline, undefined);
});

test("(i) resume: azonos input-hash → gyorsítótár, nincs második hívás", async () => {
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeDeps(CANNED_PEDAGOGUE);
  const jobId = await store.createJob({
    mapId: "m1",
    step: "pedagogue",
    status: "pending",
    model: "x-ai/grok-4.6",
    promptVersion: PIPELINE_PROMPT_VERSION,
    inputHash: pedagogueHash(),
  });

  const first = await runPipelineStep(jobId, { store, providerFactory, keyConfigured, promptLookup });
  assert.equal(first.ok, true);
  assert.equal(calls.length, 1);

  // Resume before the caller applied the transition: the current step's input is
  // still identical, so the stored output must be reused — never a second payment.
  const second = await runPipelineStep(jobId, { store, providerFactory, keyConfigured, promptLookup });
  assert.equal(second.ok, true);
  assert.equal(second.cached, true);
  assert.equal(calls.length, 1, "a gyorsítótár-találat nem hívja újra a modellt");
  assert.equal(second.ok && second.next.step, "author");
});

test("saját API-kulcsa hiányában a job hibára fut, tiszta magyar üzenettel", async () => {
  const { store, providerFactory } = makeDeps(CANNED_PEDAGOGUE);
  const jobId = await store.createJob({
    mapId: "m1",
    step: "pedagogue",
    status: "pending",
    model: "x-ai/grok-4.6",
    promptVersion: PIPELINE_PROMPT_VERSION,
    inputHash: pedagogueHash(),
  });

  const outcome = await runPipelineStep(jobId, {
    store,
    providerFactory,
    keyConfigured: () => false,
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.next.step, "error");
  assert.match(outcome.reason, /saját API-kulcsa/);

  const job = await store.loadJob(jobId);
  assert.equal(job?.status, "error");
  assert.match(job?.error ?? "", /saját API-kulcsa/);
});

test("(j) animator: az érvényes kiegészítés elmentődik, a következő lépés lektor", async () => {
  const animatedLesson = {
    ...GOOD_LESSON,
    sections: [
      {
        ...GOOD_LESSON.sections[0],
        blocks: [
          ...GOOD_LESSON.sections[0].blocks,
          {
            kind: "animate",
            animKind: "numberLine",
            params: { from: 0, to: 10 },
            // Spec 2026-09-19: an animate label must be grounded in the caption, else it is
            // stripped as cosmetic; the shared fixture's c1 term varies between tests.
            caption: "A sejt és a háromszög területe a számegyenesen lépésről lépésre",
            coversConceptIds: ["c1"],
          },
        ],
      },
    ],
  };
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeDeps(JSON.stringify(animatedLesson));
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "animator",
    status: "running",
    output: { lesson: GOOD_LESSON },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "lektor");
  assert.equal(calls.length, 1);

  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok");
  assert.equal((job?.output?.lesson as { sections: Array<{ blocks: unknown[] }> }).sections[0].blocks.length, 2, "az új animate blokk a leckében van");
});

test("(k) animator: invariáns-sértő kimenet FALLBACK — az eredeti lecke megy tovább (#169 spec-változás)", async () => {
  const tampered = {
    ...GOOD_LESSON,
    sections: [
      {
        ...GOOD_LESSON.sections[0],
        blocks: [
          {
            ...GOOD_LESSON.sections[0].blocks[0],
            text: "A gép átírta a magyarázatot.",
          },
        ],
      },
    ],
  };
  const { store, providerFactory, keyConfigured, promptLookup } = makeDeps(JSON.stringify(tampered));
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "animator",
    status: "running",
    output: { lesson: GOOD_LESSON },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  // #169: az animáció kozmetika — a sértés nem öli meg a gyártást, hanem az
  // EREDETI lecke megy tovább a lektorra. A szerződés-ellenőrzés maga szigorú
  // maradt (a rontott kimenet SOSEM kerül ki), csak a következménye változott.
  assert.equal(outcome.ok, true, "a futás életben marad");
  assert.equal(outcome.ok && outcome.next.step, "lektor", "a lánc megy tovább");

  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok");
  assert.deepEqual(job?.output?.lesson, GOOD_LESSON, "a tárolt lecke bájtra az eredeti — félkész animáció sosem kerül ki");
});

/* ------------------------------------------------------------------ *
 * Audit 2026-09-05 (szelet C) — lektor-kör integritás + finished_at
 * ------------------------------------------------------------------ */

test("(l) author round 2 CSAK a round-1 lektor blokkolóit kapja, a round-0 stale jegyzetet nem", async () => {
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeDeps(CANNED_AUTHOR);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "author",
    status: "running",
    round: 2,
    output: { approvedOutline: GOOD_OUTLINE },
  });
  await store.saveNotes(
    "job-1",
    [{ kind: "source_conflict", subkind: "not_in_map", severity: "blocker", blocking: true, message: "REGI-HIBA-ROUND0" } as LektorNote],
    0,
  );
  await store.saveNotes(
    "job-1",
    [{ kind: "source_conflict", subkind: "not_in_map", severity: "blocker", blocking: true, message: "AKTUALIS-HIBA-ROUND1" } as LektorNote],
    1,
  );

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].user + calls[0].system, /AKTUALIS-HIBA-ROUND1/);
  assert.doesNotMatch(calls[0].user + calls[0].system, /REGI-HIBA-ROUND0/, "a már javított kör hibája nem kerül újra a szerző elé");
});

test("(m) lektor a saját körével címkézi a jegyzeteit", async () => {
  const { store, providerFactory, keyConfigured, promptLookup } = makeDeps(CANNED_LEKTOR_BLOCKER);
  store.seed({ id: "job-1", mapId: "m1", step: "lektor", status: "running", round: 1, output: { lesson: GOOD_LESSON } });

  await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  const notes = store.notes.get("job-1") ?? [];
  assert.equal(notes.length, 1);
  assert.equal(notes[0].round, 1);
});

test("(n) advanceJob: köztes átmenet finishedAt=null, terminális átmenet finishedAt kitöltve", async () => {
  const { store } = makeDeps(CANNED_AUTHOR);
  store.seed({ id: "job-1", mapId: "m1", step: "pedagogue", status: "ok", finishedAt: new Date(0) });

  await advanceJob("job-1", { step: "author", round: 0 }, { status: "ok" }, { store });
  assert.equal(store.jobs.get("job-1")?.finishedAt, null, "author-ra lépés nem 'kész'");

  await advanceJob("job-1", { step: "done", round: 0 }, { status: "ok" }, { store });
  assert.ok(store.jobs.get("job-1")?.finishedAt instanceof Date);

  await advanceJob("job-1", { step: "error", round: 0, reason: "x" }, { status: "ok" }, { store });
  assert.ok(store.jobs.get("job-1")?.finishedAt instanceof Date);
});

// #180 — measured live (admin "Lecke-készítés indítása", 2026-09-05 22:54): the client posts
// an EMPTY body, the route demanded subject+classroom -> 400 "Hibás kérés." The UI text
// promises "a lecke a térkép szerinti tantárgyból és osztályba készül", so the map IS the
// source of truth: no scope -> use the map's; an explicit but different scope stays a 409.
test("(o) startJobFromMap: hiányzó scope → a térkép tantárgya/osztálya (#180)", async () => {
  const { store } = makeDeps(CANNED_AUTHOR);
  const started = await startJobFromMap("m1", undefined, { store });
  assert.equal(started.ok, true, JSON.stringify(started));
  const job = store.jobs.get((started as { jobId: string }).jobId);
  assert.equal(job?.step, "pedagogue");
  assert.equal(job?.mapId, "m1");
});

test("(p) startJobFromMap: a térképpel EGYEZŐ explicit scope továbbra is indít, az eltérő 409-et ad", async () => {
  const { store } = makeDeps(CANNED_AUTHOR);
  const same = await startJobFromMap("m1", { subject: MAP_META.subject, classroom: MAP_META.classroom }, { store });
  assert.equal(same.ok, true);
  const other = await startJobFromMap("m1", { subject: "matematika", classroom: MAP_META.classroom }, { store });
  assert.equal(other.ok, false);
  assert.match((other as { reason: string }).reason, /térkép/);
});

test("(q) fromMapBody: az üres törzs érvényes (a scope opcionális), a hiányos scope nem", () => {
  assert.equal(fromMapBody.safeParse({}).success, true, "üres body = térkép scope");
  assert.equal(fromMapBody.safeParse(undefined).success, true, "body nélkül is");
  assert.equal(fromMapBody.safeParse({ subject: "biológia", classroom: 7 }).success, true);
  assert.equal(fromMapBody.safeParse({ subject: "biológia" }).success, false, "fél scope nem elfogadható");
});

/* ------------------------------------------------------------------ *
 * 2026-09-09 — éles hiba: az animátor OpenRouter 429-en (rate limit) végleg elhalt,
 * pedig a FALLBACK_MODELS csak dokumentálva volt, a runner nem használta.
 * ------------------------------------------------------------------ */
import { FALLBACK_MODELS, SECOND_FALLBACK_MODELS, providerForModel, resolveStudioModel } from "../server/ai/models";
import { lektorReportSchema } from "../server/studio/step-io";

function makeFailoverDeps(opts: { failModels: Set<string>; cannedResponse: string }) {
  const base = makeDeps(opts.cannedResponse);
  const calls: string[] = [];
  const providerFactory = (model: string): IAIProvider => ({
    name: "stub",
    model,
    chat: async () => {
      calls.push(model);
      if (opts.failModels.has(model)) throw new Error("[OpenRouter] Rate limit exceeded");
      return { content: opts.cannedResponse, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    isAvailable: async () => true,
  } as unknown as IAIProvider);
  return { ...base, providerFactory, calls };
}

test("(m) modellhiba: az elsődleges modell 429-e után a lépés a FALLBACK_MODELS modelljén fut le", async () => {
  const primary = resolveStudioModel("pedagogue");
  const fallback = FALLBACK_MODELS.pedagogue!;
  assert.notEqual(primary, fallback);
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeFailoverDeps({
    failModels: new Set([primary]),
    cannedResponse: CANNED_PEDAGOGUE,
  });
  store.seed({ id: "job-1", mapId: "m1", step: "pedagogue", status: "running", output: { approvedOutline: GOOD_OUTLINE } });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true);
  assert.deepEqual(calls, [primary, fallback], "előbb az elsődleges, majd a fallback modell");
  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok");
  assert.equal((job as { model?: string | null })?.model, fallback, "a job a ténylegesen használt modellt rögzíti");
});

// Spec 2026-09-30-nem-elakado-kozzetetel (4. szelet): élő bukás 2026-09-28 — az elsődleges ÉS a tartalék modell is hibázott.
test("(m2) modellhiba: ha az elsődleges és a tartalék is hibázik, a második tartalék (más család) még lefuttatja a lépést", async () => {
  const primary = resolveStudioModel("pedagogue");
  const fallback = FALLBACK_MODELS.pedagogue!;
  const last = SECOND_FALLBACK_MODELS.pedagogue;
  assert.ok(new Set([primary, fallback, last]).size === 3);
  assert.equal((SECOND_FALLBACK_MODELS as Record<string, string>).author, undefined, "a szerzőnek nincs idegen családú második tartaléka (tulajdonosi döntés 2026-09-29)");
  assert.notEqual(providerForModel(SECOND_FALLBACK_MODELS.lektor), providerForModel(resolveStudioModel("author")), "a lektor független a szerzőtől");
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeFailoverDeps({ failModels: new Set([primary, fallback]), cannedResponse: CANNED_PEDAGOGUE });
  store.seed({ id: "job-2", mapId: "m1", step: "pedagogue", status: "running", output: { approvedOutline: GOOD_OUTLINE } });
  const outcome = await runPipelineStep("job-2", { store, providerFactory, keyConfigured, promptLookup });
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  assert.deepEqual(calls, [primary, fallback, last]);
  assert.equal(((await store.loadJob("job-2")) as { model?: string | null })?.model, last);

  const all = makeFailoverDeps({ failModels: new Set([primary, fallback, last]), cannedResponse: CANNED_PEDAGOGUE });
  all.store.seed({ id: "job-3", mapId: "m1", step: "pedagogue", status: "running", output: { approvedOutline: GOOD_OUTLINE } });
  const failed = await runPipelineStep("job-3", { store: all.store, providerFactory: all.providerFactory, keyConfigured: all.keyConfigured, promptLookup: all.promptLookup });
  assert.equal(failed.ok, false);
  assert.match((await all.store.loadJob("job-3"))?.error ?? "", /második tartalék/);
});

test("(m3) a lektor jelentése 40-nél több önálló megoldással sem bukik (levágva)", () => {
  const solutions = Array.from({ length: 45 }, (_, i) => ({ task: `f${i}`, own: "1", lesson: "1", match: true }));
  const parsed = lektorReportSchema.safeParse({ solutions, notes: [] });
  assert.ok(parsed.success);
  assert.equal(parsed.data.solutions?.length, 40);
});

// Spec-változás 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md): a 2026-09-19-es eszköz-kiváltás („példa
// mellett nincs animátor-modellhívás”) okozta a szövegdobozos ábrákat — mindhárom élő futásban. Most példa
// mellett is az ábra-modell dolgozik, a foltját a program illeszti be; a példa-process csak tartalék.
test("(n2) spec 2026-09-24: példa mellett is az ábra-modell tervez, a folt beillesztve, a tanítás érintetlen", async () => {
  const withExample = { ...GOOD_LESSON, sections: [{ ...GOOD_LESSON.sections[0], blocks: [...GOOD_LESSON.sections[0].blocks,
    { kind: "example", problem: "2+3·4", steps: ["3·4=12", "2+12=14"], answer: "14", coversConceptIds: ["c1"] }] }] };
  const exampleIndex = withExample.sections[0].blocks.length - 1;
  const patch = { sections: [{ index: 0, visuals: [{ after: exampleIndex, animKind: "numberLine",
    params: { from: 0, to: 14, step: 1, jumps: [{ from: 2, to: 14, label: "+12" }] }, caption: "A műveleti sorrend a számegyenesen: 2 + 12 = 14", coversConceptIds: ["c1"] }] }] };
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeFailoverDeps({ failModels: new Set(), cannedResponse: JSON.stringify(patch) });
  // Saját térkép: a közös MAP c1-nevét egy korábbi teszt átírja (sorrendfüggés); a felirat-őr a nevet méri.
  store.maps.set("m1", { meta: MAP_META, concepts: [{ localId: "c1", examWeight: "core", term: "műveleti sorrend" }] });
  store.seed({ id: "job-1", mapId: "m1", step: "animator", status: "running", output: { lesson: withExample } });
  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls, [resolveStudioModel("animator")], "az ábra-modell egyszer hívva");
  const job = await store.loadJob("job-1");
  const lesson = job?.output?.lesson as typeof withExample;
  const blocks = lesson.sections[0].blocks;
  assert.equal(blocks[exampleIndex + 1]?.kind, "animate", "az ábra a példa után");
  assert.equal((blocks[exampleIndex + 1] as { animKind?: string }).animKind, "numberLine", "a modell ábrája, nem a példa lépéseinek szövegdoboza");
  assert.deepEqual(blocks.filter(b => b.kind !== "animate"), withExample.sections[0].blocks.filter(b => b.kind !== "animate"), "a tanítás érintetlen");
});

test("(n3) élő mérés 2026-09-24: hibás alakú ábra-válasz után egy célzott újrakérés ugyanazon a modellen", async () => {
  const withExample = { ...GOOD_LESSON, sections: [{ ...GOOD_LESSON.sections[0], blocks: [...GOOD_LESSON.sections[0].blocks,
    { kind: "example", problem: "2+3·4", steps: ["3·4=12", "2+12=14"], answer: "14", coversConceptIds: ["c1"] }] }] };
  const patch = { sections: [{ index: 0, visuals: [{ after: 0, animKind: "numberLine", params: { from: 0, to: 14, step: 1, marks: [{ value: 14, label: "14" }] },
    caption: "A műveleti sorrend eredménye a számegyenesen", coversConceptIds: ["c1"] }] }] };
  const base = makeDeps("{}");
  const calls: Array<{ model: string; user: string }> = [];
  const providerFactory = (model: string): IAIProvider => ({
    name: "stub", model,
    chat: async (messages: Array<{ role: string; content: string }>) => {
      calls.push({ model, user: messages.at(-1)?.content ?? "" });
      return { content: calls.length === 1 ? '{"figures":"nem folt"}' : JSON.stringify(patch), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    isAvailable: async () => true,
  } as unknown as IAIProvider);
  base.store.maps.set("m1", { meta: MAP_META, concepts: [{ localId: "c1", examWeight: "core", term: "műveleti sorrend" }] });
  base.store.seed({ id: "job-r", mapId: "m1", step: "animator", status: "running", output: { lesson: withExample } });
  const outcome = await runPipelineStep("job-r", { ...base, providerFactory });
  assert.equal(outcome.ok, true);
  assert.equal(calls.length, 2, "egy újrakérés");
  assert.equal(calls[1].model, calls[0].model, "ugyanazon a modellen");
  assert.match(calls[1].user, /nem a kért alakú JSON/);
  const lesson = (await base.store.loadJob("job-r"))?.output?.lesson as typeof withExample;
  assert.equal((lesson.sections[0].blocks[1] as { animKind?: string }).animKind, "numberLine", "az újrakért folt bekerült");
});

test("(n4) spec 2026-09-24 (4. szelet): a példa lépéseit ismétlő ábra után célzott újrakérés, a csere beillesztve", async () => {
  const withExample = { ...GOOD_LESSON, sections: [{ ...GOOD_LESSON.sections[0], blocks: [...GOOD_LESSON.sections[0].blocks,
    { kind: "example", problem: "2+3·4", steps: ["3·4=12", "2+12=14"], answer: "14", coversConceptIds: ["c1"] }] }] };
  const n = withExample.sections[0].blocks.length;
  const echo = { sections: [{ index: 0, visuals: [{ after: n - 1, animKind: "process", params: { steps: ["3·4=12", "2+12=14"] }, caption: "A műveleti sorrend lépései", coversConceptIds: ["c1"] }] }] };
  const fixed = { sections: [{ index: 0, visuals: [{ replace: n, animKind: "numberLine", params: { from: 0, to: 14, step: 1, jumps: [{ from: 2, to: 14, label: "+12" }] }, caption: "A műveleti sorrend a számegyenesen", coversConceptIds: ["c1"] }] }] };
  const base = makeDeps("{}");
  const users: string[] = [];
  const providerFactory = (model: string): IAIProvider => ({
    name: "stub", model,
    chat: async (messages: Array<{ role: string; content: string }>) => {
      users.push(messages.at(-1)?.content ?? "");
      return { content: JSON.stringify(users.length === 1 ? echo : fixed), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    isAvailable: async () => true,
  } as unknown as IAIProvider);
  base.store.maps.set("m1", { meta: MAP_META, concepts: [{ localId: "c1", examWeight: "core", term: "műveleti sorrend" }] });
  base.store.seed({ id: "job-w", mapId: "m1", step: "animator", status: "running", output: { lesson: withExample } });
  const outcome = await runPipelineStep("job-w", { ...base, providerFactory });
  assert.equal(outcome.ok, true);
  assert.equal(users.length, 2, "egy célzott újrakérés");
  assert.match(users[1], /a példa lépéseit ismétli/);
  const blocks = ((await base.store.loadJob("job-w"))?.output?.lesson as typeof withExample).sections[0].blocks;
  assert.equal((blocks[n] as { animKind?: string }).animKind, "numberLine", "a szövegdoboz helyére valódi ábra került");
  assert.equal(blocks.filter((b) => b.kind === "animate").length, 1);
});

test("(n5) élő mérés 2026-09-24: a fogalmat meg nem nevező ábra elutasítva; a fejezet a tartalékkal sem marad ábra nélkül", async () => {
  const withExample = { ...GOOD_LESSON, sections: [{ ...GOOD_LESSON.sections[0], blocks: [...GOOD_LESSON.sections[0].blocks,
    { kind: "example", problem: "Mennyi 2 + 3 · 4 a műveleti sorrend szerint?", steps: ["A műveleti sorrend szerint előbb szorzunk: 3 · 4 = 12.", "Utána összeadunk: 2 + 12 = 14."], answer: "14", coversConceptIds: ["c1"] }] }] };
  // A modell mindkétszer olyan ábrát ad, amelynek felirata nem nevezi meg a fogalmat („műveleti sorrend”).
  const unnamed = { sections: [{ index: 0, visuals: [{ after: 0, animKind: "numberLine", params: { from: 0, to: 14, step: 1, marks: [{ value: 14, label: "14" }] }, caption: "Egy szám a számegyenesen, jól látható helyen", coversConceptIds: ["c1"] }] }] };
  const base = makeDeps(JSON.stringify(unnamed));
  base.store.maps.set("m1", { meta: MAP_META, concepts: [{ localId: "c1", examWeight: "core", term: "műveleti sorrend" }] });
  base.store.seed({ id: "job-g", mapId: "m1", step: "animator", status: "running", output: { lesson: withExample } });
  const outcome = await runPipelineStep("job-g", base);
  assert.equal(outcome.ok, true);
  assert.ok(base.calls.length >= 2, "az elutasítás okával célzott újrakérés ment");
  assert.match(base.calls[1].user, /egyik jelölt fogalmat sem nevezi meg szó szerint — írd bele: „műveleti sorrend”/);
  const blocks = ((await base.store.loadJob("job-g"))?.output?.lesson as typeof withExample).sections[0].blocks;
  const visual = blocks.find((b) => b.kind === "animate") as { animKind?: string } | undefined;
  assert.ok(visual, "a fejezet nem maradt ábra nélkül");
  assert.equal(visual!.animKind, "process", "a tartalék a példa lépéseiből pótolt");
});

test("(n) animator: ha az elsődleges ÉS a fallback modell is hibázik, az eredeti lecke megy tovább a lektorra", async () => {
  const primary = resolveStudioModel("animator");
  const fallback = FALLBACK_MODELS.animator!;
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeFailoverDeps({
    failModels: new Set([primary, fallback]),
    cannedResponse: "{}",
  });
  store.seed({ id: "job-1", mapId: "m1", step: "animator", status: "running", output: { lesson: GOOD_LESSON } });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true, "a gyártás nem áll meg");
  assert.equal(outcome.ok && outcome.next.step, "lektor");
  assert.deepEqual(calls, [primary, fallback]);
  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok");
  assert.deepEqual(job?.output?.lesson, GOOD_LESSON, "az eredeti lecke változatlanul megy tovább");
});

// Spec-változás 2026-09-29 (docs/specs/2026-09-29-szerzomodell-gpt6-luna.md, tulajdonosi döntés): a szerzőnek
// van tartaléka (GPT-5.6 Terra), de az a szerző SAJÁT (openai) családjában marad — külső családra továbbra sincs
// visszaesés, a lektor független marad. Ha az elsődleges és a tartalék is bukik, a job hibára áll.
test("(o) author hiba esetén nincs külső modellre visszaesés", async () => {
  const primary = resolveStudioModel("author");
  const fallback = FALLBACK_MODELS.author!;
  assert.ok(fallback, "a szerzőnek van tartaléka");
  assert.equal(providerForModel(fallback), providerForModel(primary), "a tartalék a szerző saját családjában marad");
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeFailoverDeps({
    failModels: new Set([primary, fallback]),
    cannedResponse: CANNED_AUTHOR,
  });
  store.seed({ id: "job-1", mapId: "m1", step: "author", status: "running", output: { approvedOutline: GOOD_OUTLINE } });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, false);
  assert.deepEqual(calls, [primary, fallback]);
  assert.equal((await store.loadJob("job-1"))?.status, "error");
  assert.match(outcome.reason, /Rate limit exceeded/);
});

test("(p) spec 2026-09-19 — lektor: az elsődleges modell időtúllépése után a FALLBACK_MODELS.lektor modellen fut le", async () => {
  const primary = resolveStudioModel("lektor");
  const fallback = FALLBACK_MODELS.lektor!;
  assert.notEqual(primary, fallback);
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeFailoverDeps({
    failModels: new Set([primary]),
    cannedResponse: JSON.stringify({ notes: [] }),
  });
  store.seed({ id: "job-1", mapId: "m1", step: "lektor", status: "running", output: { approvedOutline: GOOD_OUTLINE, lesson: GOOD_LESSON } });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true, `a lektor lépés a tartalék-modellen sikeres: ${JSON.stringify(outcome)}`);
  assert.deepEqual(calls, [primary, fallback], "előbb az elsődleges, majd a tartalék lektor");
  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok");
  assert.equal((job as { model?: string | null })?.model, fallback, "a job a ténylegesen használt lektor-modellt rögzíti");
});

/* Spec 2026-09-19 — bank-only lektor blockers at the round limit get one targeted bank round. */
test("(q) körlimitnél csak bank-tételes blokkoló → egy animátor bankjavító kör, utána a lektor dönt", async () => {
  const lesson = standardFusionFixture();
  const packet = structuredClone(lesson.experience!);
  const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
  lesson.subject = MAP_META.subject; lesson.classroom = MAP_META.classroom; lesson.mapId = "m1";
  let checkpoint: ExperienceCheckpoint | undefined;
  lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => packet, save: async cp => { checkpoint = structuredClone(cp); } });
  const bankBlocker = { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz.3", message: "A kvíz a föld alatti részt kizárólag gyökérnek adja." };
  const deps = makeDeps(JSON.stringify({ notes: [bankBlocker] }));
  deps.store.maps.set("m1", { meta: MAP_META, concepts });
  deps.store.seed({ id: "bank-only", mapId: "m1", step: "lektor", round: MAX_AUTHOR_ROUNDS, output: { lesson, experienceCheckpoint: checkpoint, methodVersion: lesson.experience.version } });

  const first = await runPipelineStep("bank-only", deps);
  assert.ok(first.ok, `a bank-only kör elindul: ${JSON.stringify(first)}`);
  assert.deepEqual(first.ok && first.next, { step: "animator", round: MAX_AUTHOR_ROUNDS + 1 });
  const job = deps.store.jobs.get("bank-only")!;
  assert.equal(job.output?.bankOnlyRepairRound, MAX_AUTHOR_ROUNDS + 1);
  assert.equal((job.output?.bankReview as { round: number; feedback: unknown[] }).round, MAX_AUTHOR_ROUNDS + 1);
  assert.equal((job.output?.bankReview as { feedback: unknown[] }).feedback.length, 1);

  // The animator rebuilds only the criticised items; the teaching is untouched.
  job.step = "animator"; job.round = MAX_AUTHOR_ROUNDS + 1; job.status = "ok";
  const bankDeps = makeDeps(JSON.stringify({ quiz: [lesson.experience.quiz[3]] }));
  const rebuilt = await runPipelineStep(job.id, { ...bankDeps, store: deps.store });
  assert.ok(rebuilt.ok && rebuilt.next.step === "lektor", `animátor után lektor: ${JSON.stringify(rebuilt)}`);
  assert.equal(bankDeps.calls.length, 1);
  assert.match(bankDeps.calls[0].system, /kizárólag gyökérnek/);

  // Spec 2026-09-19 (mérve run 525b2797): a második csak-bank blokkoló (más tétel) még egy csak-bank
  // kört kap (MAX_BANK_ONLY_ROUNDS = 2); a harmadik verdikt a limiten végleges.
  job.step = "lektor"; job.round = MAX_AUTHOR_ROUNDS + 1; job.status = "ok";
  const second = await runPipelineStep(job.id, { ...makeDeps(JSON.stringify({ notes: [bankBlocker] })), store: deps.store });
  assert.deepEqual(second.ok && second.next, { step: "animator", round: MAX_AUTHOR_ROUNDS + 2 }, `második csak-bank kör: ${JSON.stringify(second)}`);
  assert.equal(job.output?.bankOnlyRepairRounds, 2);
  job.step = "lektor"; job.round = MAX_AUTHOR_ROUNDS + 2; job.status = "ok";
  const again = await runPipelineStep(job.id, { ...makeDeps(JSON.stringify({ notes: [bankBlocker] })), store: deps.store });
  // Spec 2026-09-29-limit-banktetel-kivetel (4. döntés, dokumentált változás): a harmadik verdikt a limiten nem buktatja
  // a leckét — a hibás banktétel kapu-jelzés lesz; a kapu kiveszi, ha a bank így is megfelel, különben nem publikál.
  assert.deepEqual(again.ok && again.next, { step: "gate", round: MAX_AUTHOR_ROUNDS + 2 }, JSON.stringify(again));
  assert.deepEqual((deps.store.jobs.get("bank-only")!.output?.choiceFlags as Array<{ path: string }>).map((f) => f.path), ["experience.quiz[3]"]);
});

test("(q3) élő mérés 2026-09-24 (run 29a13b45): elfogyott workflow-keretnél nincs csak-bank kör — tiszta lektori hiba, nem kivétel", async () => {
  const lesson = standardFusionFixture();
  const packet = structuredClone(lesson.experience!);
  const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
  lesson.subject = MAP_META.subject; lesson.classroom = MAP_META.classroom; lesson.mapId = "m1";
  let checkpoint: ExperienceCheckpoint | undefined;
  lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => packet, save: async cp => { checkpoint = structuredClone(cp); } });
  const bankBlocker = { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz.3", message: "Réka és Janka is 273 kiskockát épített." };
  const deps = makeDeps(JSON.stringify({ notes: [bankBlocker] }));
  deps.store.maps.set("m1", { meta: MAP_META, concepts });
  // Three author rounds (r0–r2) and one bank-only round (r3) already used 4 animator visits.
  deps.store.seed({ id: "budget", mapId: "m1", step: "lektor", round: MAX_AUTHOR_ROUNDS + 1, output: { lesson, experienceCheckpoint: checkpoint, methodVersion: lesson.experience.version, bankOnlyRepairRounds: 1 } });
  const { store } = memoryWorkflows();
  // The work ends with a marker error: anything else (e.g. „Elfogyott a lépés javítási kerete”) fails the test.
  await assert.rejects(executeWorkflow(store, { id: "budget-run", owner: "test", mode: "studio" }, async () => {
    for (const step of ["pedagogue", "author", "animator", "lektor", "author", "animator", "lektor", "author", "animator", "lektor", "animator"]) await workflowPhase(step);
    const result = await runPipelineStep("budget", deps);
    // Spec 2026-09-29-limit-banktetel-kivetel (4. döntés, dokumentált változás): nincs 5. animátor-látogatás és nincs
    // workflow-kivétel (a teszt fő szándéka) — a hibás banktétel a kapuhoz megy kivételre, nem a lektor buktat.
    assert.deepEqual(result.ok && result.next, { step: "gate", round: MAX_AUTHOR_ROUNDS + 1 }, `nincs 5. animátor-látogatás: ${JSON.stringify(result)}`);
    throw new Error("teszt-vég: a lektor döntött");
  }), /teszt-vég: a lektor döntött/);
  const job = deps.store.jobs.get("budget")!;
  assert.notEqual(job.status, "error");
  assert.deepEqual((job.output?.choiceFlags as Array<{ path: string; message: string }>).map((f) => f.path), ["experience.quiz[3]"]);
  assert.match((job.output?.choiceFlags as Array<{ message: string }>)[0].message, /273/);
});

test("(q2) mérve run b5d07f3d: már az első körben is csak-bank javítás jön, ha minden blokkoló banktétel — nincs szerzői újraírás", async () => {
  const lesson = standardFusionFixture();
  const packet = structuredClone(lesson.experience!);
  const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
  lesson.subject = MAP_META.subject; lesson.classroom = MAP_META.classroom; lesson.mapId = "m1";
  let checkpoint: ExperienceCheckpoint | undefined;
  lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => packet, save: async cp => { checkpoint = structuredClone(cp); } });
  const bankBlocker = { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.tasks.0", message: "A mintaválasz jobbról balra halad." };
  const deps = makeDeps(JSON.stringify({ notes: [bankBlocker] }));
  deps.store.maps.set("m1", { meta: MAP_META, concepts });
  deps.store.seed({ id: "bank-only-early", mapId: "m1", step: "lektor", round: 0, output: { lesson, experienceCheckpoint: checkpoint, methodVersion: lesson.experience.version } });
  const first = await runPipelineStep("bank-only-early", deps);
  assert.ok(first.ok, JSON.stringify(first));
  assert.deepEqual(first.ok && first.next, { step: "animator", round: 1 }, "animátor bank-kör, nem szerző");
  const job = deps.store.jobs.get("bank-only-early")!;
  assert.equal(job.output?.bankOnlyRepairRound, 1);
  assert.equal((job.output?.bankReview as { feedback: unknown[] }).feedback.length, 1);
});

// Spec-változás 2026-09-30 (docs/specs/2026-09-30-nem-elakado-kozzetetel.md, D2, tulajdonosi döntés): a limiten maradt
// tanítási TÉNYHIBA továbbra sem publikálható, de előbb EGY célzott szerzői javítás jár (ha van keret); csak az utáni
// tényhiba buktat. Bank-only kör változatlanul nincs tanítási blokkoló mellett.
test("(r) körlimitnél tanítási tényhiba mellett nincs bank-only kör: egy célzott szerzői javítás, utána hiba", async () => {
  const lesson = standardFusionFixture();
  lesson.subject = MAP_META.subject; lesson.classroom = MAP_META.classroom; lesson.mapId = "m1";
  const notes = [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections.0.blocks.0", message: "Tanítási tényhiba." },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz.1", message: "Bankhiba." }];
  const deps = makeDeps(JSON.stringify({ notes }));
  deps.store.maps.set("m1", { meta: MAP_META, concepts: [{ localId: "area", examWeight: "core" }] });
  deps.store.seed({ id: "mixed", mapId: "m1", step: "lektor", round: MAX_AUTHOR_ROUNDS, output: { lesson, methodVersion: lesson.experience!.version } });
  const outcome = await runPipelineStep("mixed", deps);
  assert.ok(outcome.ok && outcome.next.step === "author" && outcome.next.round === MAX_AUTHOR_ROUNDS + 1, `célzott szerzői kör: ${JSON.stringify(outcome)}`);
  assert.equal(deps.store.jobs.get("mixed")!.output?.targetedLektorRepairRound, MAX_AUTHOR_ROUNDS + 1);

  const again = makeDeps(JSON.stringify({ notes }));
  again.store.maps.set("m1", { meta: MAP_META, concepts: [{ localId: "area", examWeight: "core" }] });
  again.store.seed({ id: "mixed2", mapId: "m1", step: "lektor", round: MAX_AUTHOR_ROUNDS + 1, output: { lesson, methodVersion: lesson.experience!.version, targetedLektorRepairRound: MAX_AUTHOR_ROUNDS + 1 } });
  const second = await runPipelineStep("mixed2", again);
  assert.equal(second.ok, false);
  assert.match(again.store.jobs.get("mixed2")!.error ?? "", /A lektor 2 tartalmi javítást kér — tényhiba maradt, nem publikálható/);
});

/* Spec 2026-09-19 — Studio lektor convergence across author rounds. */
test("(s) 1. körben új, korábban nem jelzett fejezet fedettségi hiánya figyelmeztetés → kapu; a tényhiba blokkol", async () => {
  const notes = [{ kind: "coverage_gap", subkind: "core", blockPath: "sections.0.blocks.0", message: "Új fejezeti hiány, az előző kör nem jelezte." }];
  const deps = makeDeps(JSON.stringify({ notes }));
  deps.store.seed({ id: "converge", mapId: "m1", step: "lektor", round: 1, output: { approvedOutline: GOOD_OUTLINE, lesson: GOOD_LESSON } });
  await deps.store.saveNotes("converge", classifyNotes([{ kind: "coverage_gap", subkind: "core", blockPath: "sections.1.blocks.0", message: "Előző kör hiánya." }]), 0);
  const outcome = await runPipelineStep("converge", deps);
  assert.ok(outcome.ok && outcome.next.step === "gate", `a késői fedettségi jegyzet nem blokkol: ${JSON.stringify(outcome)}`);
  assert.match(deps.calls[0].system, /KONVERGENCIA-SZABÁLY/);
  assert.match(deps.calls[0].system, /Előző kör hiánya/);
  const saved = await deps.store.loadBlockerNotes("converge", 1);
  assert.equal(saved.length, 0, "a leminősített jegyzet nem blokkolóként tárolódik");

  const factual = makeDeps(JSON.stringify({ notes: [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections.0.blocks.0", message: "Tényhiba." }] }));
  factual.store.seed({ id: "factual", mapId: "m1", step: "lektor", round: 1, output: { approvedOutline: GOOD_OUTLINE, lesson: GOOD_LESSON } });
  const blocked = await runPipelineStep("factual", factual);
  assert.ok(blocked.ok && blocked.next.step === "author" && blocked.next.round === 2, `a tényhiba új szerzői kört indít: ${JSON.stringify(blocked)}`);
});

/* Spec 2026-09-19 §6 (D10) — célzott szerzői javítás: a nem érintett fejezet bájtra azonos, a bankcsomagja újrahasznosul. */
test("(t) célzott javítás: csak a kifogásolt fejezet cserélődik, a másik fejezet csomagja modellhívás nélkül marad", async () => {
  const base = standardFusionFixture(); const e = base.experience!;
  const lesson = lessonSchema.parse({ ...base, mapId: "m1", subject: MAP_META.subject, classroom: MAP_META.classroom, experience: undefined,
    sections: [base.sections[0], { ...base.sections[0], heading: "Második fejezet ugyanarról" }] });
  const packetFor = (sectionIndex: number, suffix: string) => ({
    methods: e.methods.map(m => ({ ...m, sectionIndex, title: m.title + suffix, prompt: m.prompt + suffix })),
    tasks: e.tasks.map(t => ({ ...t, sectionIndex, q: t.q + suffix })),
    quiz: e.quiz.map(q => ({ ...q, sectionIndex, question: q.question + suffix })),
    glossary: [],
  });
  const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
  let checkpoint: ExperienceCheckpoint | undefined;
  const experience = await buildLessonExperience(lesson, concepts, {
    call: async (_s, user) => packetFor(Number(/sectionIndex=(\d+)/.exec(user)![1]), ` (${/sectionIndex=(\d+)/.exec(user)![1]}. fejezet)`),
    save: async cp => { checkpoint = structuredClone(cp); },
  });
  const previous = { ...lesson, experience };
  // The lektor blocked one teaching block in section 1 (blockPath "1.0").
  const note = { kind: "source_conflict", subkind: "contradicts_source", blockPath: "1.0", message: "A második fejezet magyarázata ellentmond a forrásnak." };
  const explain = previous.sections[1].blocks.find(b => b.kind === "explain")!;
  const patched = { ...previous.sections[1], blocks: previous.sections[1].blocks.map(b => b === explain && b.kind === "explain" ? { ...b, text: b.text + " (javítva a forrás szerint)" } : b) };
  const deps = makeDeps(JSON.stringify({ sections: { "1": patched } }));
  deps.store.maps.set("m1", { meta: MAP_META, concepts });
  deps.store.seed({ id: "targeted", mapId: "m1", step: "author", round: 1, output: {
    approvedOutline: { sections: [{ heading: "A", conceptIds: ["area"], plannedBlocks: ["explain"], animationSuggestions: [] }, { heading: "B", conceptIds: ["area"], plannedBlocks: ["explain"], animationSuggestions: [] }], misconceptions: [] },
    lesson: previous, experienceCheckpoint: checkpoint, methodVersion: e.version, report: { notes: [note] }, reportRound: 0,
  } });
  const authored = await runPipelineStep("targeted", deps);
  assert.ok(authored.ok, JSON.stringify(authored));
  assert.match(deps.calls[0].system, /CÉLZOTT JAVÍTÁS: kizárólag a\(z\) 2\. fejezetet/);
  const job = deps.store.jobs.get("targeted")!;
  const result = job.output?.lesson as typeof previous;
  assert.equal(JSON.stringify(result.sections[0]), JSON.stringify(previous.sections[0]), "az érintetlen fejezet bájtra azonos");
  assert.match(JSON.stringify(result.sections[1]), /javítva a forrás szerint/);
  assert.deepEqual(result.misconceptions, previous.misconceptions);

  // The animator rebuilds only the changed section's packet; section 0 comes from the checkpoint.
  job.step = "animator"; job.status = "ok";
  const bankDeps = makeDeps(JSON.stringify(packetFor(1, " (1. fejezet, javított)")));
  const rebuilt = await runPipelineStep(job.id, { ...bankDeps, store: deps.store });
  assert.ok(rebuilt.ok, JSON.stringify(rebuilt));
  const bankCalls = bankDeps.calls.filter(c => /allowedConceptIds=/.test(c.user));
  assert.equal(bankCalls.length, 1, `csak a változott fejezet csomagját kéri: ${bankCalls.length}`);
  assert.match(bankCalls[0].user, /sectionIndex=1/);
});

/* Mérve run 4a4fb9f2 (2026-09-20): a kapu a limiten egy fejezethez köthető lelettel ne dobja el a leckét. */
test("(u) kapu a körlimiten, fejezethez köthető lelettel → egy célzott szerzői javítás, nem hiba", async () => {
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const concepts: MapConcept[] = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept, { localId: "idegen", term: "Pitagorasz-tétel", examWeight: "supporting" } as MapConcept];
  lesson.experience = await buildLessonExperience(lesson, [concepts[0]], { call: async () => standardFusionFixture().experience! });
  // A 0. fejezet egy check blokkja idegen fogalom címkéjét viseli (a szövege nem tanítja) → a kapu
  // megalapozatlan címkét mér; a bankterv (explain/example alapú) érintetlen.
  lesson.sections[0].blocks.splice(lesson.sections[0].blocks.length - 1, 0, { kind: "check", question: "Melyik állítás igaz a fenti számolásra?", options: ["Az első", "A második"], correctIndex: 0, feedbackPerOption: ["Igen.", "Nem."], coversConceptIds: ["idegen"] });
  const deps = makeDeps(JSON.stringify({ notes: [] }));
  deps.store.maps.set("m1", { meta: { id: "m1", title: lesson.title, subject: lesson.subject, classroom: lesson.classroom }, concepts });
  deps.store.seed({ id: "gate-limit", mapId: "m1", lessonId: "lesson-gl", step: "lektor", round: MAX_AUTHOR_ROUNDS, output: { lesson, methodVersion: lesson.experience.version } });
  const reviewed = await runPipelineStep("gate-limit", deps);
  assert.ok(reviewed.ok && reviewed.next.step === "gate", JSON.stringify(reviewed));
  await advanceJob("gate-limit", reviewed.next, { status: "running" }, deps);
  const gated = await runPipelineStep("gate-limit", deps);
  assert.ok(gated.ok, `célzott javítás indul, nem hiba: ${JSON.stringify(gated)}`);
  assert.deepEqual(gated.ok && gated.next, { step: "author", round: MAX_AUTHOR_ROUNDS + 1 });
  const job = deps.store.jobs.get("gate-limit")!;
  assert.equal(job.output?.targetedGateRepairRound, MAX_AUTHOR_ROUNDS + 1);
  assert.ok((job.output?.gate as { ungrounded: unknown[] }).ungrounded.length === 1);
  // Másodszor ugyanez a kapu-lelet a limiten már végleges.
  job.step = "gate"; job.round = MAX_AUTHOR_ROUNDS + 1; job.status = "running";
  const again = await runPipelineStep("gate-limit", deps);
  assert.equal(again.ok, false);
  assert.match("reason" in again ? again.reason ?? "" : "", /tanítása hiányos/);
});

/* Spec 2026-09-20 — színes tananyag: a világ a tervezőnél dől el, az emoji a vázlatból másolódik, a bank témája a világ. */
test("(v) vizuális világ: a pedagógus rögzíti, a szerző fejezetei megkapják az emoji-t, a bank témája a világ", async () => {
  const deps = makeDeps(JSON.stringify({ ...GOOD_OUTLINE, sections: GOOD_OUTLINE.sections.map((s) => ({ ...s, emoji: "🦋", keyPhrases: ["sejt"] })), visual: { world: "meadow" } }));
  deps.store.seed({ id: "vis", mapId: "m1", step: "pedagogue", status: "running", output: { approvedOutline: GOOD_OUTLINE } });
  const planned = await runPipelineStep("vis", deps);
  assert.ok(planned.ok, JSON.stringify(planned));
  assert.match(deps.calls[0].system, /Javasolt vizuális világ: /, "a runner világot javasol");
  const job = deps.store.jobs.get("vis")!;
  assert.deepEqual(job.output?.visual, { world: "meadow" }, "a tervező által megerősített világ rögzül");
  assert.equal((job.output?.outline as { sections: Array<{ emoji?: string }> }).sections[0].emoji, "🦋");

  // Szerző: a lecke fejezetei a vázlat emoji-ját kapják, akkor is, ha a modell nem adta vissza.
  job.step = "author"; job.status = "ok"; job.output = { ...job.output, approvedOutline: job.output!.outline };
  const authorDeps = makeDeps(JSON.stringify(GOOD_LESSON));
  assert.ok((await runPipelineStep("vis", { ...authorDeps, store: deps.store })).ok);
  const lesson = deps.store.jobs.get("vis")!.output?.lesson as { sections: Array<{ emoji?: string }> };
  assert.equal(lesson.sections[0].emoji, "🦋");

  // Bank: a téma a világ (nem hash).
  const fusion = standardFusionFixture(); fusion.mapId = "m1";
  const e = fusion.experience!;
  const bankJob = { id: "vis-bank", mapId: "m1", step: "animator" as const, status: "pending" as const, output: { lesson: { ...fusion, experience: undefined }, methodVersion: e.version, visual: { world: "meadow" } } };
  deps.store.seed(bankJob);
  const bankDeps = makeDeps(JSON.stringify({ methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] }));
  assert.ok((await runPipelineStep("vis-bank", { ...bankDeps, store: deps.store })).ok);
  const built = deps.store.jobs.get("vis-bank")!.output?.lesson as { experience?: { theme: string } };
  assert.equal(built.experience?.theme, "meadow");
});

/* Spec 2026-09-24 (docs/specs/2026-09-24-bank-ellenor.md): a bank-ellenőr a lektor-lépésben. */
/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-egy-helyes-valasz.md, döntés 3): a bank-ellenőr minden egyválasztós
 * tételre opciónkénti ítéletet (`choices`) ad; ítélet nélkül a tétel nem „cleared”. A stub-modell ezért a helyes
 * modell viselkedését adja: a kulcs szerinti ítéletet (`override` útvonalanként felülírja).
 */
function keyedChoices(lesson: Lesson, override: Record<string, boolean[]> = {}) {
  const e = lesson.experience!;
  const items: Array<[string, { options?: string[]; correctIndex?: number }]> = [
    ...e.quiz.map((q, i): [string, typeof q] => [`experience.quiz[${i}]`, q]),
    ...e.methods.map((m, i): [string, typeof m] => [`experience.methods[${i}]`, m]),
    ...lesson.sections.flatMap((s, i) => s.blocks.flatMap((b, j): Array<[string, { options?: string[]; correctIndex?: number }]> => (b.kind === "check" ? [[`sections[${i}].blocks[${j}]`, b]] : []))),
  ];
  return items.filter(([, it]) => Array.isArray(it.options) && Number.isInteger(it.correctIndex))
    .map(([path, it]) => ({ path, truths: override[path] ?? it.options!.map((_, k) => k === it.correctIndex) }));
}

async function bankVerifierSetup(id: string, extraOutput: Record<string, unknown>, verifierErrors: unknown[], override: Record<string, boolean[]> = {}) {
  const lesson = standardFusionFixture();
  const packet = structuredClone(lesson.experience!);
  const concepts: MapConcept[] = [{ localId: "area", examWeight: "core" }];
  lesson.subject = MAP_META.subject; lesson.classroom = MAP_META.classroom; lesson.mapId = "m1";
  let checkpoint: ExperienceCheckpoint | undefined;
  lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => packet, save: async cp => { checkpoint = structuredClone(cp); } });
  const sourceText = "1. Számold ki: 24 + 15!";
  const base = makeDeps("");
  base.store.maps.set("m1", { meta: { ...MAP_META, sourceText }, concepts });
  const calls: Array<{ model: string; system: string }> = [];
  const providerFactory = (model: string): IAIProvider => ({
    name: "stub", model,
    chat: async (messages: AIMessage[]) => {
      const system = messages[0]?.content ?? "";
      calls.push({ model, system });
      const content = system.includes("TÁMOGATÓ SKILL: bank-verifier") ? JSON.stringify({ errors: verifierErrors, choices: keyedChoices(lesson, override) }) : JSON.stringify({ notes: [] });
      return { content, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    isAvailable: async () => true,
  } as unknown as IAIProvider);
  const blindSolutions = { sourceHash: sourceHashOf(sourceText), model: BLIND_SOLVER_MODEL, solutions: [{ task: "1.", answer: "39" }] };
  base.store.seed({ id, mapId: "m1", step: "lektor", round: 0, output: { lesson, experienceCheckpoint: checkpoint, methodVersion: lesson.experience.version, blindSolutions, ...extraOutput } });
  return { deps: { ...base, providerFactory }, store: base.store, calls, lesson };
}

const verifierCallsOf = (calls: Array<{ system: string }>) => calls.filter((c) => c.system.includes("TÁMOGATÓ SKILL: bank-verifier"));
const QUIZ_ERROR = { path: "experience.quiz[3]", message: "Mi hamis: két igaz opció | Bizonyíték: 12 + 9 − 17 = 4 | Javítás iránya: 4" };

test("bank-ellenőr: a lektor mellett fut; a talált banktétel-hiba csak-bank javító kört indít, kitalált útvonal nélkül", async () => {
  const { deps, store, calls, lesson } = await bankVerifierSetup("bv-repair", {}, [QUIZ_ERROR, { path: "experience.quiz[9999]", message: "kitalált" }]);
  const result = await runPipelineStep("bv-repair", deps);
  assert.deepEqual(result.ok && result.next, { step: "animator", round: 1 }, JSON.stringify(result));
  assert.equal(verifierCallsOf(calls).length, 1, "egy fejezet = egy bank-ellenőr hívás");
  assert.equal(calls.filter((c) => !c.system.includes("TÁMOGATÓ SKILL: bank-verifier")).length, 1, "a lektor is fut");
  const job = store.jobs.get("bv-repair")!;
  const feedback = (job.output?.bankReview as { feedback: Array<{ note: { blockPath?: string; message: string } }> }).feedback;
  assert.deepEqual(feedback.map((f) => f.note.blockPath), ["experience.quiz[3]"]);
  assert.match(feedback[0].note.message, /^Bank-ellenőr: .*Javítás iránya: 4/);
  const e = lesson.experience!;
  assert.equal((job.output?.bankVerifierCleared as string[]).length, e.methods.length + e.tasks.length + e.quiz.length - 1);
  assert.deepEqual(job.output?.bankVerifier, { round: 0, checked: e.methods.length + e.tasks.length + e.quiz.length, errors: 1, failedChunks: 0 });
});

test("bank-ellenőr: elfogyott csak-bank keretnél a hiba figyelmeztetés — a lecke nem bukik miatta", async () => {
  const { deps, store } = await bankVerifierSetup("bv-late", { bankOnlyRepairRounds: MAX_BANK_ONLY_ROUNDS }, [QUIZ_ERROR]);
  const job = store.jobs.get("bv-late")!;
  job.round = MAX_AUTHOR_ROUNDS;
  const result = await runPipelineStep("bv-late", deps);
  assert.deepEqual(result.ok && result.next, { step: "gate", round: MAX_AUTHOR_ROUNDS }, JSON.stringify(result));
  assert.equal(job.output?.blockers, 0);
  const saved = store.notes.get("bv-late") ?? [];
  assert.equal(saved.length, 1);
  assert.equal(saved[0].subkind, "bank_check_late");
  assert.equal(saved[0].blocking, false);
});

// SPEC-VÁLTOZÁS (docs/specs/2026-09-29-egy-helyes-valasz.md, döntés 3): „A bank-ellenőr vak megoldás NÉLKÜL is
// fut” — a korábbi „vak megoldás nélkül nem fut” (0 hívás) állítás ezért 1 hívásra fordult; a cache-rész változatlan.
test("bank-ellenőr: vak megoldás nélkül is fut; a korábban hibátlannak talált tételeket nem ellenőrzi újra", async () => {
  const none = await bankVerifierSetup("bv-none", { blindSolutions: undefined }, [QUIZ_ERROR]);
  none.store.maps.set("m1", { meta: MAP_META, concepts: [{ localId: "area", examWeight: "core" }] });
  await runPipelineStep("bv-none", none.deps);
  assert.equal(verifierCallsOf(none.calls).length, 1);
  assert.match(verifierCallsOf(none.calls)[0].system, /FÜGGETLEN VAK MEGOLDÁSOK[^\n]*\n\[\]/, "üres kulcslistával");

  const first = await bankVerifierSetup("bv-cache", {}, []);
  await runPipelineStep("bv-cache", first.deps);
  assert.equal(verifierCallsOf(first.calls).length, 1);
  const job = first.store.jobs.get("bv-cache")!;
  job.step = "lektor"; job.round = 1; job.status = "running";
  await runPipelineStep("bv-cache", first.deps);
  assert.equal(verifierCallsOf(first.calls).length, 1, "változatlan bank: nincs újabb bank-ellenőr hívás");
});

/* Spec 2026-09-29 (docs/specs/2026-09-29-egy-helyes-valasz.md): egyválasztós tétel — pontosan egy helyes opció. */
const ALL_TRUE = { "experience.quiz[5]": [true, true, true] };
const published = (store: MemoryStore) => {
  const log: number[] = [];
  store.publishLesson = async () => { log.push(log.length + 1); return { htmlFileId: "published-choice", exportedQuizItems: 0 }; };
  return log;
};

test("spec 2026-09-29 (E3): több helyes opció az opciónkénti ítéletben → blokkoló jegyzet a csak-bank javító körbe", async () => {
  const { deps, store } = await bankVerifierSetup("bv-choice-repair", {}, [], ALL_TRUE);
  const result = await runPipelineStep("bv-choice-repair", deps);
  assert.deepEqual(result.ok && result.next, { step: "animator", round: 1 }, JSON.stringify(result));
  const feedback = (store.jobs.get("bv-choice-repair")!.output?.bankReview as { feedback: Array<{ note: { blockPath?: string; message: string } }> }).feedback;
  assert.deepEqual(feedback.map((f) => f.note.blockPath), ["experience.quiz[5]"]);
  assert.match(feedback[0].note.message, /^Bank-ellenőr: Egyválasztós tétel: 3 helyes opció/);
});

test("spec 2026-09-29 (E3/E4): elfogyott csak-bank keretnél az egyválasztós hiba NEM figyelmeztetés — a kapu kiveszi a tételt, ha a bank így is megfelel", async () => {
  const { deps, store, lesson } = await bankVerifierSetup("bv-choice", { bankOnlyRepairRounds: MAX_BANK_ONLY_ROUNDS }, [], ALL_TRUE);
  const e = lesson.experience!;
  e.quiz.push({ ...e.quiz[6], id: `${e.quiz[6].id}-extra`, question: "A háromszög alapja 99 cm, magassága 2 cm. Mekkora a területe?", options: ["99 cm²", "198 cm²", "100 cm²"] });
  const flagged = e.quiz[5].question;
  const job = store.jobs.get("bv-choice")!;
  job.round = MAX_AUTHOR_ROUNDS; job.lessonId = "lesson-bv";
  store.lessons.set("lesson-bv", { id: "lesson-bv", mapId: "m1", json: lesson });
  const reviewed = await runPipelineStep("bv-choice", deps);
  assert.deepEqual(reviewed.ok && reviewed.next, { step: "gate", round: MAX_AUTHOR_ROUNDS }, JSON.stringify(reviewed));
  assert.equal(job.output?.blockers, 0);
  assert.equal((store.notes.get("bv-choice") ?? []).some((n) => n.subkind === "bank_check_late"), false, "nem késői figyelmeztetés");
  assert.deepEqual((job.output?.choiceFlags as Array<{ path: string }>).map((f) => f.path), ["experience.quiz[5]"]);

  job.step = "gate"; job.status = "running";
  const log = published(store);
  const gated = await runPipelineStep("bv-choice", deps);
  assert.ok(gated.ok, JSON.stringify(gated));
  assert.equal(log.length, 1);
  const saved = store.lessons.get("lesson-bv")!.json as Lesson;
  assert.equal(saved.experience!.quiz.length, 75);
  assert.equal(saved.experience!.quiz.some((q) => q.question === flagged), false, "a hibás tétel nem jut a gyerekhez");
  assert.deepEqual((job.output?.choiceGate as { removed: string[] }).removed, ["experience.quiz[5]"]);
});

test("spec 2026-09-29 (E4): ha a kivétel után a bank nem felelne meg, a kapu NEM publikál", async () => {
  const { deps, store } = await bankVerifierSetup("bv-choice-min", { bankOnlyRepairRounds: MAX_BANK_ONLY_ROUNDS }, [], ALL_TRUE);
  const job = store.jobs.get("bv-choice-min")!;
  job.round = MAX_AUTHOR_ROUNDS; job.lessonId = "lesson-min";
  store.lessons.set("lesson-min", { id: "lesson-min", mapId: "m1", json: job.output!.lesson });
  assert.ok((await runPipelineStep("bv-choice-min", deps)).ok);
  job.step = "gate"; job.status = "running";
  const log = published(store);
  const gated = await runPipelineStep("bv-choice-min", deps);
  assert.equal(gated.ok, false);
  assert.equal(log.length, 0);
  assert.match(job.error ?? "", /Egyválasztós hiba maradt a bankban.*nem felelne meg/);
});

test("spec 2026-09-29 (E4): a lecke check blokkjában maradt determinisztikus egyválasztós hiba → a kapu NEM publikál", async () => {
  const deps = makeDeps("{}");
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  lesson.sections[0].blocks.push({ kind: "check", question: "Melyik szám osztható 9-cel?", options: ["234", "567", "891", "648"], correctIndex: 0, feedbackPerOption: ["a", "b", "c", "d"], coversConceptIds: ["area"] });
  deps.store.lessons.set("lesson-chk", { id: "lesson-chk", mapId: "m1", json: lesson });
  deps.store.seed({ id: "gate-chk", mapId: "m1", lessonId: "lesson-chk", step: "gate", status: "running", output: { lesson } });
  const log = published(deps.store);
  const gated = await runPipelineStep("gate-chk", deps);
  assert.equal(gated.ok, false);
  assert.equal(log.length, 0);
  assert.match(deps.store.jobs.get("gate-chk")!.error ?? "", /Egyválasztós hiba maradt a leckében.*sections\[0\]\.blocks\[4\].*4 opció osztható 9-cel/);
});

/* Review-javítás 2026-09-29 (PR #134; spec „Review-javítás 2026-09-29”): R1 fail-open, R4 régi lektor-bizonyíték. */
function withVerifierReplies(deps: Awaited<ReturnType<typeof bankVerifierSetup>>["deps"], lesson: Lesson, replies: Array<"none" | "keyed">) {
  const systems: string[] = [];
  const inner = deps.providerFactory;
  const providerFactory = (model: string): IAIProvider => {
    const provider = inner(model);
    return { ...provider, chat: async (...args: Parameters<IAIProvider["chat"]>) => {
      const system = args[0][0]?.content ?? "";
      if (!system.includes("TÁMOGATÓ SKILL: bank-verifier")) return provider.chat(...args);
      const reply = replies[Math.min(systems.length, replies.length - 1)];
      systems.push(system);
      return { content: JSON.stringify({ errors: [], choices: reply === "keyed" ? keyedChoices(lesson) : [] }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    } } as IAIProvider;
  };
  return { systems, deps: { ...deps, providerFactory } };
}

test("review R1(b): ítélet nélküli bank-ellenőr válasz → egy azonnali újraellenőrzés CSAK az érintett útvonalakkal", async () => {
  const setup = await bankVerifierSetup("r1-retry", {}, []);
  const { systems, deps } = withVerifierReplies(setup.deps, setup.lesson, ["none", "keyed"]);
  const result = await runPipelineStep("r1-retry", deps);
  assert.deepEqual(result.ok && result.next, { step: "gate", round: 0 }, JSON.stringify(result));
  assert.equal(systems.length, 2, "egy újraellenőrzés");
  assert.match(systems[1], /"path":"experience\.quiz\[74\]"/);
  assert.doesNotMatch(systems[1], /"path":"experience\.tasks\[/, "csak az ítélet nélküli egyválasztós tételek");
  assert.equal(setup.store.jobs.get("r1-retry")!.output?.choiceFlags, undefined, "a második ítélet lezárta");
});

test("review R1(c): javítható körben is — ami ítélet nélkül marad, kapu-jelzés; a kapu NEM publikál", async () => {
  const setup = await bankVerifierSetup("r1-open", {}, []);
  const { systems, deps } = withVerifierReplies(setup.deps, setup.lesson, ["none"]);
  const job = setup.store.jobs.get("r1-open")!;
  job.lessonId = "lesson-r1";
  setup.store.lessons.set("lesson-r1", { id: "lesson-r1", mapId: "m1", json: setup.lesson });
  const reviewed = await runPipelineStep("r1-open", deps);
  assert.deepEqual(reviewed.ok && reviewed.next, { step: "gate", round: 0 }, JSON.stringify(reviewed));
  assert.equal(systems.length, 2);
  const e = setup.lesson.experience!;
  const keyed = e.quiz.length + e.methods.filter((m) => m.options).length;
  assert.equal((job.output?.choiceFlags as unknown[] | undefined)?.length, keyed, "minden ítélet nélküli egyválasztós tétel nyitott");
  job.step = "gate"; job.status = "running";
  const log = published(setup.store);
  const gated = await runPipelineStep("r1-open", deps);
  assert.equal(gated.ok, false);
  assert.equal(log.length, 0);
  assert.match(job.error ?? "", /Egyválasztós hiba maradt a bankban/);
});

test("review R4: telepítés előtti (skill-7.4-review-1) lektor-bizonyítékkal a kapu NEM publikál", async () => {
  const { deps, store } = await bankVerifierSetup("r4", {}, []);
  const job = store.jobs.get("r4")!;
  job.lessonId = "lesson-r4";
  store.lessons.set("lesson-r4", { id: "lesson-r4", mapId: "m1", json: job.output!.lesson });
  const reviewed = await runPipelineStep("r4", deps);
  assert.deepEqual(reviewed.ok && reviewed.next, { step: "gate", round: 0 }, JSON.stringify(reviewed));
  job.output!.reviewInputHash = computeStepHash("lektor", "skill-7.4-review-1", {
    lesson: job.output!.lesson, map: { id: MAP_META.id, title: MAP_META.title, subject: MAP_META.subject, classroom: MAP_META.classroom },
    concepts: [{ localId: "area", examWeight: "core" }],
  }, 0);
  job.step = "gate"; job.status = "running";
  const log = published(store);
  const gated = await runPipelineStep("r4", deps);
  assert.equal(gated.ok, false);
  assert.equal(log.length, 0);
  assert.match(job.error ?? "", /aktuális tanításhoz/);
});

/* Spec 2026-09-29 (docs/specs/2026-09-29-szerzomodell-gpt6-luna.md, tulajdonosi döntés): a szerző elsődleges
 * modellje GPT-6 Luna, tartaléka GPT-5.6 Terra. Élesben mérve: egyetlen érvénytelen szerzői JSON az egész
 * gyártást leállította, mert a szerzőnek nem volt tartaléka. */
test("spec 2026-09-29: author — GPT-6 Luna elsődleges; érvénytelen JSON után a GPT-5.6 Terra tartalék írja meg", async () => {
  assert.equal(resolveStudioModel("author", {}), "gpt-6-luna");
  assert.equal(FALLBACK_MODELS.author, "gpt-5.6-terra");
  const base = makeDeps(CANNED_AUTHOR);
  const calls: string[] = [];
  const providerFactory = (model: string): IAIProvider => ({
    name: "stub",
    model,
    chat: async () => {
      calls.push(model);
      const content = model === "gpt-6-luna" ? '{"title": "Oszthatóság", "sections": [' : CANNED_AUTHOR;
      return { content, finishReason: "stop", usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    isAvailable: async () => true,
  } as unknown as IAIProvider);
  base.store.seed({ id: "author-fallback", mapId: "m1", step: "author", status: "running", output: { approvedOutline: GOOD_OUTLINE } });

  const outcome = await runPipelineStep("author-fallback", { ...base, providerFactory });

  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  assert.deepEqual(calls, ["gpt-6-luna", "gpt-5.6-terra"], "előbb GPT-6 Luna, érvénytelen JSON után a tartalék");
  const job = await base.store.loadJob("author-fallback");
  assert.equal((job as { model?: string | null })?.model, "gpt-5.6-terra", "a job a ténylegesen használt modellt rögzíti");
});

/* Spec 2026-09-29 (docs/specs/2026-09-29-tanari-temafokusz.md): a fókuszált job a kéréshez nem tartozó
 * fogalmak lefedését nem követeli; fókusz nélkül ugyanaz a vázlat elutasítva. */
test("spec 2026-09-29: témafókusz — a fókuszon kívüli fogalom hiánya nem buktatja a vázlatot", async () => {
  // PR #132 review (Copilot): a fixture az élesben is előállítható fókusz (van benne core): c1 kötelező,
  // az s1 a fókuszon kívül esik, így a jobban extra — a vázlat nélküle is elfogadható.
  const onlyCore = {
    sections: [{ heading: "A kért téma", conceptIds: ["c1"], plannedBlocks: ["explain", "check", "recap"], animationSuggestions: [] }],
    misconceptions: [],
  };
  const focused = makeDeps(CANNED_AUTHOR);
  focused.store.seed({ id: "focus-1", mapId: "m1", step: "author", status: "ok", output: { outline: GOOD_OUTLINE, topicFocus: { localIds: ["c1"], demoted: 1 } } });
  const ok = await approveOutline("focus-1", onlyCore, focused);
  assert.equal(ok.ok, true, JSON.stringify(ok));

  const plain = makeDeps(CANNED_AUTHOR);
  plain.store.seed({ id: "focus-2", mapId: "m1", step: "author", status: "ok", output: { outline: GOOD_OUTLINE } });
  const rejected = await approveOutline("focus-2", onlyCore, plain);
  assert.equal(rejected.ok, false, "fókusz nélkül a kihagyott supporting fogalom a 90%-os küszöb alá viszi a vázlatot");
});


/* Spec 2026-09-29-limit-banktetel-kivetel: a körlimiten maradt banktétel-hiba a tételt veszi ki, nem a leckét. */
async function limitSetup(id: string, lektorNotes: unknown[], spare = 0, mutate?: (lesson: Lesson) => void) {
  const setup = await bankVerifierSetup(id, { bankOnlyRepairRounds: MAX_BANK_ONLY_ROUNDS }, []);
  mutate?.(setup.lesson);
  const e = setup.lesson.experience!;
  for (let i = 0; i < spare; i++) {
    e.quiz.push({ ...e.quiz[10 + i], id: `spare-q${i}`, question: `${e.quiz[10 + i].question} (tartalék ${i + 1})` });
    e.tasks.push({ ...e.tasks[10 + i], id: `spare-t${i}`, q: `${e.tasks[10 + i].q} (tartalék ${i + 1})` });
  }
  const inner = setup.deps.providerFactory;
  const providerFactory = (model: string): IAIProvider => {
    const provider = inner(model);
    return { ...provider, chat: async (...args: Parameters<IAIProvider["chat"]>) => {
      if ((args[0][0]?.content ?? "").includes("TÁMOGATÓ SKILL: bank-verifier")) return provider.chat(...args);
      return { content: JSON.stringify({ notes: lektorNotes }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    } } as IAIProvider;
  };
  const job = setup.store.jobs.get(id)!;
  job.round = MAX_AUTHOR_ROUNDS; job.lessonId = `lesson-${id}`;
  setup.store.lessons.set(job.lessonId, { id: job.lessonId, mapId: "m1", json: setup.lesson });
  return { ...setup, deps: { ...setup.deps, providerFactory }, job };
}
const LIMIT_NOTES = [
  { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz.4", message: "Mi hamis: a 418-at jelöli 4-gyel oszthatónak." },
  { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.tasks.2", message: "Mi hamis: a required a hibás 52-t is elfogadja." },
];

test("spec limit-banktetel (E2): körlimiten csak banktétel-blokkoló (pontozott útvonal, tasks is) → kapu-jelzés, nem hiba", async () => {
  const { deps, job } = await limitSetup("lim-e2", LIMIT_NOTES);
  const reviewed = await runPipelineStep("lim-e2", deps);
  assert.deepEqual(reviewed.ok && reviewed.next, { step: "gate", round: MAX_AUTHOR_ROUNDS }, JSON.stringify(reviewed));
  assert.notEqual(job.status, "error");
  assert.deepEqual((job.output?.choiceFlags as Array<{ path: string }>).map((f) => f.path).sort(), ["experience.quiz[4]", "experience.tasks[2]"]);
});

test("spec limit-banktetel (E3): a kapu a kvíz- ÉS a feladattételt is kiveszi, a 7.4 bizonyítékot elfogadja, és publikál", async () => {
  const { deps, store, job, lesson } = await limitSetup("lim-e3", LIMIT_NOTES, 3);
  const flaggedQuiz = lesson.experience!.quiz[4].question;
  const flaggedTask = lesson.experience!.tasks[2].q;
  const before = { quiz: lesson.experience!.quiz.length, tasks: lesson.experience!.tasks.length };
  assert.ok((await runPipelineStep("lim-e3", deps)).ok);
  job.step = "gate"; job.status = "running";
  const log = published(store);
  const gated = await runPipelineStep("lim-e3", deps);
  assert.ok(gated.ok, JSON.stringify(gated));
  assert.equal(log.length, 1);
  const saved = store.lessons.get(job.lessonId!)!.json as Lesson;
  assert.equal(saved.experience!.quiz.length, before.quiz - 1);
  assert.equal(saved.experience!.tasks.length, before.tasks - 1);
  assert.equal(saved.experience!.quiz.some((q) => q.question === flaggedQuiz), false, "a hibás kvíztétel nem jut a gyerekhez");
  assert.equal(saved.experience!.tasks.some((t) => t.q === flaggedTask), false, "a hibás feladat nem jut a gyerekhez");
  assert.deepEqual([...(job.output?.choiceGate as { removed: string[] }).removed].sort(), ["experience.quiz[4]", "experience.tasks[2]"]);
});

test("spec limit-banktetel (E4): tartalék nélkül a kivétel után a bank nem felelne meg → a kapu NEM publikál", async () => {
  const { deps, store, job } = await limitSetup("lim-e4", LIMIT_NOTES, 0);
  assert.ok((await runPipelineStep("lim-e4", deps)).ok);
  job.step = "gate"; job.status = "running";
  const log = published(store);
  const gated = await runPipelineStep("lim-e4", deps);
  assert.equal(gated.ok, false);
  assert.equal(log.length, 0);
  assert.match(job.error ?? "", /Hibás banktétel maradt a limiten.*nem felelne meg/);
});

test("spec limit-banktetel (E4): a banknál hosszabb indexre mutató blokkoló nem kivehető → a lektor a limiten buktat", async () => {
  const { deps, job } = await limitSetup("lim-oob", [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz.9999", message: "Kitalált tétel." }], 3);
  const reviewed = await runPipelineStep("lim-oob", deps);
  assert.equal(reviewed.ok, false);
  assert.match(job.error ?? "", /tartalmi javítást kér/);
});

test("spec limit-banktetel (review): ha a bank-ellenőr ugyanarra a tételre már jelzett, a jelzés limit-eredetű lesz — a kapu a limit-üzenettel bukik", async () => {
  const { deps, store, job } = await limitSetup("lim-dup", [LIMIT_NOTES[0]], 0);
  // A bank-ellenőr ugyanazt a kvíztételt két igaz opcióval ítéli meg.
  const inner = deps.providerFactory;
  const lesson = job.output!.lesson as Lesson;
  const dupDeps = { ...deps, providerFactory: (model: string): IAIProvider => {
    const provider = inner(model);
    return { ...provider, chat: async (...args: Parameters<IAIProvider["chat"]>) => {
      if (!(args[0][0]?.content ?? "").includes("TÁMOGATÓ SKILL: bank-verifier")) return provider.chat(...args);
      return { content: JSON.stringify({ errors: [], choices: keyedChoices(lesson, { "experience.quiz[4]": [true, true, true] }) }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    } } as IAIProvider;
  } };
  assert.ok((await runPipelineStep("lim-dup", dupDeps)).ok);
  const flags = job.output?.choiceFlags as Array<{ path: string; origin?: string }>;
  assert.deepEqual(flags.map((f) => f.path), ["experience.quiz[4]"], "egyszer");
  assert.equal(flags[0].origin, "limit");
  job.step = "gate"; job.status = "running";
  const log = published(store);
  assert.equal((await runPipelineStep("lim-dup", dupDeps)).ok, false);
  assert.equal(log.length, 0);
  assert.match(job.error ?? "", /Hibás banktétel maradt a limiten/);
});


/* Spec 2026-09-29-kapu-proba-keret (élő újramérés, job 697296d4 / e880571c). */
async function gateAtLimitSetup(id: string, mutate: (lesson: Lesson) => void, round = MAX_AUTHOR_ROUNDS) {
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const concepts: MapConcept[] = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];
  lesson.experience = await buildLessonExperience(lesson, concepts, { call: async () => standardFusionFixture().experience! });
  mutate(lesson);
  const deps = makeDeps(JSON.stringify({ notes: [] }));
  deps.store.maps.set("m1", { meta: { id: "m1", title: lesson.title, subject: lesson.subject, classroom: lesson.classroom }, concepts });
  deps.store.seed({ id, mapId: "m1", lessonId: `lesson-${id}`, step: "lektor", round, output: { lesson, methodVersion: lesson.experience.version } });
  deps.store.lessons.set(`lesson-${id}`, { id: `lesson-${id}`, mapId: "m1", json: lesson });
  const reviewed = await runPipelineStep(id, deps);
  assert.ok(reviewed.ok && reviewed.next.step === "gate", JSON.stringify(reviewed));
  await advanceJob(id, reviewed.next, { status: "running" }, deps);
  return { deps, lesson };
}
const oneAreaCheck: Block = { kind: "check", question: "Melyik képlet adja a háromszög területét?", options: ["alap · magasság : 2", "alap + magasság"], correctIndex: 0, feedbackPerOption: ["Igen, a szorzat fele.", "Nem, a területhez szorozni kell."], coversConceptIds: ["area"] };

test("spec kapu-proba (E1): a limiten egyetlen elérhetetlen Próba → a kapu kikapcsolja és publikál, nincs szerzői kör", async () => {
  const { deps } = await gateAtLimitSetup("proba-limit", (l) => {
    l.sections[0].probaEnabled = true;
    l.sections[0].blocks.splice(l.sections[0].blocks.length - 1, 0, oneAreaCheck);
  });
  const log = published(deps.store);
  const gated = await runPipelineStep("proba-limit", deps);
  assert.ok(gated.ok, `publikál, nem szerzői kör: ${JSON.stringify(gated)}`);
  assert.notEqual(gated.ok && gated.next.step, "author");
  assert.equal(log.length, 1);
  const saved = deps.store.lessons.get("lesson-proba-limit")!.json as Lesson;
  assert.equal(saved.sections[0].probaEnabled, false);
  assert.deepEqual(deps.store.jobs.get("proba-limit")!.output?.probaDisabled, [0]);
});

test("spec kapu-proba (E2): elfogyott szerzői keretnél a kapu célzott javítás helyett tiszta hibával áll meg (nincs kivétel)", async () => {
  // A (u) teszt kapu-lelete: egy check blokk idegen fogalom címkéjével (megalapozatlan).
  const { deps } = await gateAtLimitSetup("gate-budget", (l) => {
    l.sections[0].blocks.splice(l.sections[0].blocks.length - 1, 0, { ...oneAreaCheck, question: "Melyik állítás igaz a fenti számolásra?", options: ["Az első", "A második"], feedbackPerOption: ["Igen.", "Nem."], coversConceptIds: ["idegen"] });
  });
  deps.store.maps.get("m1")!.concepts.push({ localId: "idegen", term: "Pitagorasz-tétel", examWeight: "supporting" } as MapConcept);
  // Spec-változás 2026-09-30 (dinamikus keret): előbb a többletkerettel célzott javítás; csak a keret elfogyása után tiszta hiba.
  const granted = await withExhaustedAuthor("gate-budget-a", () => runPipelineStep("gate-budget", deps), { thenAuthor: true });
  assert.deepEqual(granted?.ok && granted.next, { step: "author", round: MAX_AUTHOR_ROUNDS + 1 }, JSON.stringify(granted));
  const job = deps.store.jobs.get("gate-budget")!;
  job.step = "gate"; job.round = MAX_AUTHOR_ROUNDS; job.status = "running";
  job.output = { ...job.output, targetedGateRepairRound: undefined };
  const outcome = await withExhaustedAuthor("gate-budget-b", () => runPipelineStep("gate-budget", deps), { grantsUsed: true });
  assert.equal(outcome?.ok, false, `nincs szerzői kör kerett nélkül: ${JSON.stringify(outcome)}`);
  assert.match(deps.store.jobs.get("gate-budget")!.error ?? "", /tanítása hiányos \(a célzott javításhoz nincs több lépéskeret\)/);
});


test("spec kapu-proba (review P1): az AKTÍV jutalomküszöb dönt — 1-es küszöbnél az egykérdéses Próba elérhető, nem kapcsol ki", async () => {
  const { deps } = await gateAtLimitSetup("proba-policy", (l) => {
    l.sections[0].probaEnabled = true;
    l.sections[0].blocks.splice(l.sections[0].blocks.length - 1, 0, oneAreaCheck);
  });
  const { DEFAULT_REWARD_POLICY } = await import("../shared/reward-policy");
  const policyDeps = { ...deps, rewardPolicy: async () => ({ ...DEFAULT_REWARD_POLICY, minCorrectForCoupon: 1 }) };
  const log = published(deps.store);
  const gated = await runPipelineStep("proba-policy", policyDeps);
  assert.ok(gated.ok, JSON.stringify(gated));
  assert.equal(log.length, 1);
  assert.equal((deps.store.lessons.get("lesson-proba-policy")!.json as Lesson).sections[0].probaEnabled, true, "elérhető Próba marad");
  assert.equal(deps.store.jobs.get("proba-policy")!.output?.probaDisabled, undefined);
});

test("spec kapu-proba (review P2): a kapu nem írja felül a job lektorált leckéjét — újrafuttatva ugyanazt adja", async () => {
  const { deps, lesson } = await gateAtLimitSetup("proba-rerun", (l) => {
    l.sections[0].probaEnabled = true;
    l.sections[0].blocks.splice(l.sections[0].blocks.length - 1, 0, oneAreaCheck);
  });
  const original = structuredClone(lesson);
  const log = published(deps.store);
  assert.ok((await runPipelineStep("proba-rerun", deps)).ok);
  const job = deps.store.jobs.get("proba-rerun")!;
  assert.deepEqual(job.output?.lesson, original, "a job leckéje a lektorált eredeti marad");
  // Megszakadt léptetés után a kapu újrafut: ugyanaz az eredmény, a lektor-bizonyíték érvényes marad.
  job.step = "gate"; job.status = "running";
  const again = await runPipelineStep("proba-rerun", deps);
  assert.ok(again.ok, `újrafuttatható: ${JSON.stringify(again)}`);
  assert.equal(log.length, 2);
  assert.equal((deps.store.lessons.get("lesson-proba-rerun")!.json as Lesson).sections[0].probaEnabled, false);
});


/* Spec 2026-09-29-limit-check-kivetel (3. élő újramérés, Studio-job 06f5e6ae). */
test("spec limit-check (E2): a limiten banktétel + check blokk blokkoló → a kapu mindkettőt kiveszi és publikál", async () => {
  const faulty: Block = { kind: "check", question: "Melyik képlet adja a háromszög területét?", options: ["alap · magasság : 2", "alap + magasság", "alap · magasság"], correctIndex: 0, feedbackPerOption: ["Igen.", "Nem.", "Nem, még felezni kell."], coversConceptIds: ["area"] };
  const notes = [LIMIT_NOTES[0], { kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections.0.blocks.2", message: "Mi hamis: a 2. opció is igaz." }];
  const { deps, store, job, lesson } = await limitSetup("lim-check", notes, 3, (l) => { l.sections[0].blocks.splice(2, 0, faulty); });
  assert.equal(lesson.sections[0].blocks[2].kind, "check");
  const blocksBefore = lesson.sections[0].blocks.length;
  const reviewed = await runPipelineStep("lim-check", deps);
  assert.deepEqual(reviewed.ok && reviewed.next, { step: "gate", round: MAX_AUTHOR_ROUNDS }, JSON.stringify(reviewed));
  assert.deepEqual((job.output?.choiceFlags as Array<{ path: string }>).map((f) => f.path).sort(), ["experience.quiz[4]", "sections[0].blocks[2]"]);
  job.step = "gate"; job.status = "running";
  const log = published(store);
  const gated = await runPipelineStep("lim-check", deps);
  assert.ok(gated.ok, JSON.stringify(gated));
  assert.equal(log.length, 1);
  const saved = store.lessons.get(job.lessonId!)!.json as Lesson;
  assert.equal(saved.sections[0].blocks.length, blocksBefore - 1);
  assert.equal(saved.sections[0].blocks.some((b) => b.kind === "check" && b.question === faulty.question), false, "a hibás ellenőrző kérdés nem jut a gyerekhez");
  assert.deepEqual([...(job.output?.choiceGate as { removed: string[] }).removed].sort(), ["experience.quiz[4]", "sections[0].blocks[2]"]);
});


/* Spec 2026-09-30 (docs/specs/2026-09-30-nem-elakado-kozzetetel.md): nem elakadó közzététel. */
test("nem-elakadó (D2): a limiten ábrára mutató blokkoló → a kapu kiveszi az ábrát, a tanítás marad, publikál", async () => {
  const figure: Block = { kind: "animate", animKind: "process", params: { steps: ["alap és magasság", "szorzat fele"] }, caption: "A háromszög területe lépésenként", coversConceptIds: ["area"] };
  const notes = [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "sections.0.blocks.2", message: "Mi hamis: az ábra rossz sorrendet mutat." }];
  const { deps, store, job, lesson } = await limitSetup("lim-anim", notes, 3, (l) => { l.sections[0].blocks.splice(2, 0, figure); });
  const blocksBefore = lesson.sections[0].blocks.length;
  const reviewed = await runPipelineStep("lim-anim", deps);
  assert.deepEqual(reviewed.ok && reviewed.next, { step: "gate", round: MAX_AUTHOR_ROUNDS }, JSON.stringify(reviewed));
  job.step = "gate"; job.status = "running";
  const log = published(store);
  const gated = await runPipelineStep("lim-anim", deps);
  assert.ok(gated.ok, JSON.stringify(gated));
  assert.equal(log.length, 1);
  const saved = store.lessons.get(job.lessonId!)!.json as Lesson;
  assert.equal(saved.sections[0].blocks.length, blocksBefore - 1);
  assert.equal(saved.sections[0].blocks.some((b) => b.kind === "animate" && b.caption === figure.caption), false, "a hibás ábra nem jut a gyerekhez");
  assert.deepEqual((job.output?.quality as { removed: string[] }).removed, ["sections[0].blocks[2]"]);
});

test("nem-elakadó (D2): a limiten hiány-jellegű tanítási jegyzet (coverage_gap) → figyelmeztetés, a 7.4 kapu publikál", async () => {
  const notes = [{ kind: "coverage_gap", subkind: "core", blockPath: "sections.0.blocks.0", message: "Mi hiányzik: a magasság fogalma." }];
  const { deps, store, job } = await limitSetup("lim-gap", notes, 3);
  // Az előző kör UGYANEZT a fejezetet blokkolta → a konvergencia nem minősíti le; a limit-szabály dönt.
  await store.saveNotes("lim-gap", classifyNotes([{ kind: "coverage_gap", subkind: "core", blockPath: "sections.0.blocks.0", message: "Előző kör: ugyanez a hiány." }]), MAX_AUTHOR_ROUNDS - 1);
  const reviewed = await runPipelineStep("lim-gap", deps);
  assert.deepEqual(reviewed.ok && reviewed.next, { step: "gate", round: MAX_AUTHOR_ROUNDS }, JSON.stringify(reviewed));
  assert.ok(((job.output?.qualityNotes ?? []) as Array<{ reason: string }>).some((n) => n.reason === "lektor_incomplete"), JSON.stringify(job.output?.qualityNotes));
  job.step = "gate"; job.status = "running";
  const log = published(store);
  const gated = await runPipelineStep("lim-gap", deps);
  assert.ok(gated.ok, JSON.stringify(gated));
  assert.equal(log.length, 1);
  assert.ok((job.output?.quality as { warnings: string[] }).warnings.some((w) => /hiány/i.test(w)));
});

test("nem-elakadó (review #151): ha a lektor vak megoldása eltér, a limiten maradt „hiány” jegyzet tényhibaként buktat", async () => {
  const notes = [{ kind: "coverage_gap", subkind: "core", blockPath: "sections.0.blocks.0", message: "Mi hiányzik: a számolás." }];
  const { deps, store, job } = await limitSetup("lim-mismatch", notes, 3);
  job.output = { ...job.output, targetedLektorRepairRound: MAX_AUTHOR_ROUNDS }; // a célzott kör már lefutott
  await store.saveNotes("lim-mismatch", classifyNotes([{ kind: "coverage_gap", subkind: "core", blockPath: "sections.0.blocks.0", message: "Előző kör: ugyanez." }]), MAX_AUTHOR_ROUNDS - 1);
  const inner = deps.providerFactory;
  const mismatchDeps = { ...deps, providerFactory: (model: string): IAIProvider => {
    const provider = inner(model);
    return { ...provider, chat: async (...args: Parameters<IAIProvider["chat"]>) => {
      if ((args[0][0]?.content ?? "").includes("TÁMOGATÓ SKILL: bank-verifier")) return provider.chat(...args);
      return { content: JSON.stringify({ solutions: [{ task: "6 · 4 : 2", own: "12", lesson: "10", match: false }], notes }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    } } as IAIProvider;
  } };
  const reviewed = await runPipelineStep("lim-mismatch", mismatchDeps);
  assert.equal(reviewed.ok, false, JSON.stringify(reviewed));
  assert.match(job.error ?? "", /tényhiba maradt, nem publikálható/);
  assert.equal(job.output?.limitDowngrade, false);
});

test("nem-elakadó (D1): a lektor konvergenciával leminősített jegyzete a 7.4 kapun sem buktat (limit előtt is)", async () => {
  const notes = [{ kind: "coverage_gap", subkind: "core", blockPath: "sections.0.blocks.0", message: "Késői, új fejezeti hiány." }];
  const { deps, store, job } = await limitSetup("lim-conv", notes, 3);
  job.round = 1;
  await store.saveNotes("lim-conv", classifyNotes([{ kind: "coverage_gap", subkind: "core", blockPath: "sections.9.blocks.0", message: "Előző kör, másik fejezet." }]), 0);
  const reviewed = await runPipelineStep("lim-conv", deps);
  assert.deepEqual(reviewed.ok && reviewed.next, { step: "gate", round: 1 }, JSON.stringify(reviewed));
  job.step = "gate"; job.status = "running";
  const log = published(store);
  const gated = await runPipelineStep("lim-conv", deps);
  assert.ok(gated.ok, `a konvergenciával leminősített jegyzet nem buktat: ${JSON.stringify(gated)} ${job.error ?? ""}`);
  assert.equal(log.length, 1);
});

test("nem-elakadó (D3): a kapu a limiten csak nem-ténybeli lelettel (megalapozatlan címke), a célzott javítás után → publikál figyelmeztetéssel", async () => {
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const concepts: MapConcept[] = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept, { localId: "idegen", term: "Pitagorasz-tétel", examWeight: "extra" } as MapConcept];
  lesson.experience = await buildLessonExperience(lesson, [concepts[0]], { call: async () => standardFusionFixture().experience! });
  lesson.sections[0].blocks.splice(lesson.sections[0].blocks.length - 1, 0, { kind: "check", question: "Melyik állítás igaz a fenti számolásra?", options: ["Az első", "A második"], correctIndex: 0, feedbackPerOption: ["Igen.", "Nem."], coversConceptIds: ["idegen"] });
  const deps = makeDeps(JSON.stringify({ notes: [] }));
  deps.store.maps.set("m1", { meta: { id: "m1", title: lesson.title, subject: lesson.subject, classroom: lesson.classroom }, concepts });
  // A célzott kapu-javítás már lefutott (jobonként egyszer) — innen a 95/80-as szabály dönt.
  deps.store.seed({ id: "gate-accept", mapId: "m1", lessonId: "lesson-ga", step: "lektor", round: MAX_AUTHOR_ROUNDS, output: { lesson, methodVersion: lesson.experience.version, targetedGateRepairRound: MAX_AUTHOR_ROUNDS } });
  deps.store.lessons.set("lesson-ga", { id: "lesson-ga", mapId: "m1", json: lesson });
  const reviewed = await runPipelineStep("gate-accept", deps);
  assert.ok(reviewed.ok && reviewed.next.step === "gate", JSON.stringify(reviewed));
  await advanceJob("gate-accept", reviewed.next, { status: "running" }, deps);
  const log = published(deps.store);
  const gated = await runPipelineStep("gate-accept", deps);
  const job = deps.store.jobs.get("gate-accept")!;
  assert.ok(gated.ok, `publikál: ${JSON.stringify(gated)} ${job.error ?? ""}`);
  assert.equal(log.length, 1);
  const notes = job.output?.qualityNotes as Array<{ reason: string; note: string }>;
  assert.ok(notes.some((n) => n.reason === "gate_limit_accepted" && /core 100%/.test(n.note)), JSON.stringify(notes));
});

/* Spec 2026-09-30-tanari-ellenorzolista: a tanári kérés pontjai a kész leckén. */
function withInstructionAnswer(deps: ReturnType<typeof makeDeps>, answer: unknown) {
  const inner = deps.providerFactory;
  let calls = 0;
  const providerFactory = (model: string): IAIProvider => {
    const provider = inner(model);
    return { ...provider, chat: async (...args: Parameters<IAIProvider["chat"]>) => {
      if (!(args[0][0]?.content ?? "").includes("TÁMOGATÓ SKILL: instruction-checker")) return provider.chat(...args);
      calls++;
      if (answer instanceof Error) throw answer;
      return { content: JSON.stringify(answer), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    } } as IAIProvider;
  };
  return { deps: { ...deps, providerFactory }, calls: () => calls };
}
const MISSING_POINT = { points: [{ point: "A háromszög magassága merőleges az alapra", taught: false, evidence: "", section: 0 }] };

test("tanári kérés: limit előtt a hiányzó pont EGY célzott szerzői kört kap, a pont a kapu okai között", async () => {
  const { deps } = await gateAtLimitSetup("instr-repair", () => undefined, 0);
  deps.store.jobs.get("instr-repair")!.output!.ownerInstruction = "Tanítsd a magasság fogalmát is.";
  const wrapped = withInstructionAnswer(deps, MISSING_POINT);
  const log = published(deps.store);
  const gated = await runPipelineStep("instr-repair", wrapped.deps);
  assert.deepEqual(gated.ok && gated.next, { step: "author", round: 1 }, JSON.stringify(gated));
  assert.equal(log.length, 0);
  const job = deps.store.jobs.get("instr-repair")!;
  assert.equal(job.output?.instructionRepairRound, 1);
  const gate = job.output?.gate as { ok: boolean; reasons: string[]; instruction: Array<{ sectionIdx: number }> };
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.some((r) => /Tanári kérés hiányzó pontja \(1\. fejezet\): A háromszög magassága/.test(r)), JSON.stringify(gate.reasons));
  assert.deepEqual(gate.instruction.map((f) => f.sectionIdx), [0]);
  assert.equal(wrapped.calls(), 1);
});

test("tanári kérés: a forrásból igazolt hiányzó pont kiegészítő fogalom lesz, és a javító szerző tudástárában megjelenik", async () => {
  const { deps } = await gateAtLimitSetup("instr-source", () => undefined, 0);
  const map = deps.store.maps.get("m1")!;
  map.meta = { ...map.meta, sourceText: "A háromszög magassága az alapra merőleges szakasz, amely a szemközti csúcsból indul." };
  deps.store.jobs.get("instr-source")!.output!.ownerInstruction = "Tanítsd a magasság fogalmát is.";
  deps.store.jobs.get("instr-source")!.output!.approvedOutline = GOOD_OUTLINE;
  const answer = { points: [{ point: "A háromszög magassága", taught: false, evidence: "", section: 0, sourceQuote: "A háromszög magassága az alapra merőleges szakasz" }] };
  const gated = await runPipelineStep("instr-source", withInstructionAnswer(deps, answer).deps);
  assert.deepEqual(gated.ok && gated.next, { step: "author", round: 1 }, JSON.stringify(gated));
  const job = deps.store.jobs.get("instr-source")!;
  const extra = job.output?.instructionConcepts as Array<{ localId: string; term: string; quote: string }>;
  assert.equal(extra.length, 1);
  assert.equal(extra[0].term, "A háromszög magassága");
  // A következő (szerzői) lépés a fókuszált tudástárat kapja: benne a kiegészítő fogalom az idézettel.
  job.step = "author"; job.round = 1; job.status = "running";
  const authorDeps = makeDeps(CANNED_AUTHOR);
  authorDeps.store = deps.store;
  await runPipelineStep("instr-source", authorDeps);
  assert.ok(authorDeps.calls.some((c) => c.system.includes(extra[0].localId) && c.system.includes("az alapra merőleges szakasz")), "a szerző látja a forrásból igazolt kiegészítő fogalmat");
  // Review #155 (P1): az azonosító a célfejezet vázlatában — így a szerző ENGEDÉLYEZETT címkéi között is.
  const outline = job.output?.approvedOutline as { sections: Array<{ conceptIds: string[] }> };
  assert.ok(outline.sections[0].conceptIds.includes(extra[0].localId));
  // Spec 2026-09-30 (U4, H13): a szerzői prompt magyar — az engedélyezett azonosítók sora: „A használható fogalom-azonosítók (coversConceptIds) KIZÁRÓLAG: …”.
  const allowedLine = (authorDeps.calls[0]?.system ?? "").split("KIZÁRÓLAG: ")[1]?.split("\n")[0] ?? "";
  assert.ok(allowedLine.includes(extra[0].localId), `engedélyezett azonosítók: ${allowedLine.slice(0, 200)}`);
});

// Spec-változás 2026-09-30 (dinamikus keret): a limiten is jár EGY célzott kör; ha már volt, figyelmeztetés + publikálás.
test("tanári kérés: a limiten a hiányzó pont figyelmeztetés, a lecke publikál; a mérés hibája nem állít meg", async () => {
  const { deps: first } = await gateAtLimitSetup("instr-limit-first", () => undefined);
  first.store.jobs.get("instr-limit-first")!.output!.ownerInstruction = "Tanítsd a magasság fogalmát is.";
  const once = await runPipelineStep("instr-limit-first", withInstructionAnswer(first, MISSING_POINT).deps);
  assert.deepEqual(once.ok && once.next, { step: "author", round: MAX_AUTHOR_ROUNDS + 1 }, "a limiten is egy célzott kör");

  const { deps } = await gateAtLimitSetup("instr-limit", () => undefined);
  deps.store.jobs.get("instr-limit")!.output!.ownerInstruction = "Tanítsd a magasság fogalmát is.";
  deps.store.jobs.get("instr-limit")!.output!.instructionRepairRound = MAX_AUTHOR_ROUNDS;
  const wrapped = withInstructionAnswer(deps, MISSING_POINT);
  const log = published(deps.store);
  const gated = await runPipelineStep("instr-limit", wrapped.deps);
  assert.ok(gated.ok, JSON.stringify(gated));
  assert.equal(log.length, 1);
  const job = deps.store.jobs.get("instr-limit")!;
  assert.ok((job.output?.qualityNotes as Array<{ reason: string }>).some((n) => n.reason === "instruction_missing"));
  assert.equal((job.output?.instructionCheck as { points: unknown[] }).points.length, 1);

  const { deps: failing } = await gateAtLimitSetup("instr-error", () => undefined);
  failing.store.jobs.get("instr-error")!.output!.ownerInstruction = "Tanítsd a magasság fogalmát is.";
  failing.store.jobs.get("instr-error")!.output!.instructionRepairRound = MAX_AUTHOR_ROUNDS;
  const broken = withInstructionAnswer(failing, new Error("szolgáltatói hiba"));
  const failLog = published(failing.store);
  const ok = await runPipelineStep("instr-error", broken.deps);
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(failLog.length, 1, "a mérés hibája mellett is publikál");
});

test("spec kapu-proba (utómérés, élő job 9ef52e4f): a limit ELŐTT az elérhetetlen Próba nem kapcsol ki — a szerző pótolja a kérdéseket", async () => {
  const { deps } = await gateAtLimitSetup("proba-early", (l) => {
    l.sections[0].probaEnabled = true;
    l.sections[0].blocks.splice(l.sections[0].blocks.length - 1, 0, oneAreaCheck);
  }, 0);
  const log = published(deps.store);
  const gated = await runPipelineStep("proba-early", deps);
  assert.ok(gated.ok, JSON.stringify(gated));
  assert.deepEqual(gated.ok && gated.next, { step: "author", round: 1 }, "a meglévő kapu→szerző javítókör");
  assert.equal(log.length, 0, "nem publikál a javítás előtt");
  assert.equal(deps.store.jobs.get("proba-early")!.output?.probaDisabled, undefined);
  assert.equal((deps.store.lessons.get("lesson-proba-early")!.json as Lesson).sections[0].probaEnabled, true);
});


/* Review PR #143 (P2): a limit előtt elfogyott szerzői keret is limitnek számít — nincs „Váratlan hiba”. */
async function withExhaustedAuthor<T>(id: string, work: () => Promise<T>, opts: { grantsUsed?: boolean; thenAuthor?: boolean } = {}): Promise<T | undefined> {
  const { store } = memoryWorkflows();
  let out: T | undefined;
  await assert.rejects(executeWorkflow(store, { id: `${id}-run`, owner: "test", mode: "studio" }, async () => {
    await workflowPhase("pedagogue");
    for (let guard = 0; workflowStepVisitsLeft("author") > 0 && guard < 20; guard++) {
      for (const step of ["author", "animator", "lektor"]) await workflowPhase(step);
    }
    if (opts.grantsUsed) await exhaustRepairGrants();
    out = await work();
    // Spec 2026-09-30-dinamikus-keret: a kapott többletkeret VALÓDI — a motor engedi a szerző lépést (nincs „Váratlan hiba”).
    if (opts.thenAuthor) await workflowPhase("author");
    throw new Error("teszt-vég");
  }), /teszt-vég/);
  return out;
}
/** A futás mindkét dinamikus többletkeretét elhasználja (kérés + a javítóút végigjárása), utána nincs több. */
async function exhaustRepairGrants() {
  for (let grant = 0; grant < REPAIR_BUDGET_GRANTS; grant++) {
    assert.equal(await workflowEnsureRepairBudget("teszt"), true);
    for (let guard = 0; ["author", "animator", "lektor"].some((s) => workflowStepVisitsLeft(s) > 0) && guard < 10; guard++) {
      for (const step of ["author", "animator", "lektor"]) if (workflowStepVisitsLeft(step) > 0) await workflowPhase(step);
    }
  }
  assert.equal(await workflowEnsureRepairBudget("teszt"), false, "a többletkeret futásonként korlátos");
}

test("review #143 (P2): a limit ELŐTT, elfogyott szerzői kerettel az elérhetetlen Próba kikapcsol és a lecke publikál", async () => {
  const { deps } = await gateAtLimitSetup("proba-budget", (l) => {
    l.sections[0].probaEnabled = true;
    l.sections[0].blocks.splice(l.sections[0].blocks.length - 1, 0, oneAreaCheck);
  }, 0);
  const log = published(deps.store);
  // Spec-változás 2026-09-30 (dinamikus keret, review #154): amíg többletkeret igényelhető, a szerző pótolja a kérdéseket
  // (a Próba nem kapcsol ki); csak a futásonkénti többletkeret elfogyása után kapcsol ki, és a lecke publikál.
  const granted = await withExhaustedAuthor("proba-budget-a", () => runPipelineStep("proba-budget", deps), { thenAuthor: true });
  assert.deepEqual(granted?.ok && granted.next, { step: "author", round: 1 }, JSON.stringify(granted));
  assert.equal(log.length, 0);
  const job = deps.store.jobs.get("proba-budget")!;
  job.step = "gate"; job.round = 0; job.status = "running";
  const gated = await withExhaustedAuthor("proba-budget-b", () => runPipelineStep("proba-budget", deps), { grantsUsed: true });
  assert.ok(gated?.ok, JSON.stringify(gated));
  assert.equal(log.length, 1);
  assert.deepEqual(deps.store.jobs.get("proba-budget")!.output?.probaDisabled, [0]);
});

test("review #143 (P2): a limit ELŐTT, elfogyott szerzői kerettel más kapu-lelet → tiszta hiba, nem szerzői kör", async () => {
  const { deps } = await gateAtLimitSetup("gate-early-budget", (l) => {
    l.sections[0].blocks.splice(l.sections[0].blocks.length - 1, 0, { ...oneAreaCheck, question: "Melyik állítás igaz a fenti számolásra?", options: ["Az első", "A második"], feedbackPerOption: ["Igen.", "Nem."], coversConceptIds: ["idegen"] });
  }, 0);
  deps.store.maps.get("m1")!.concepts.push({ localId: "idegen", term: "Pitagorasz-tétel", examWeight: "supporting" } as MapConcept);
  // Spec-változás 2026-09-30 (dinamikus keret, tulajdonosi utasítás): elfogyott keretnél előbb többletkeret jár — a szerzői
  // kör elindul, és a motor valóban engedi; csak a futásonkénti többletkeret elfogyása után tiszta hiba (nincs kivétel).
  const granted = await withExhaustedAuthor("gate-early-budget", () => runPipelineStep("gate-early-budget", deps), { thenAuthor: true });
  assert.deepEqual(granted?.ok && granted.next, { step: "author", round: 1 }, JSON.stringify(granted));
  const job = deps.store.jobs.get("gate-early-budget")!;
  job.step = "gate"; job.round = 0; job.status = "running";
  const gated = await withExhaustedAuthor("gate-early-budget-2", () => runPipelineStep("gate-early-budget", deps), { grantsUsed: true });
  assert.equal(gated?.ok, false, `nincs szerzői kör keret nélkül: ${JSON.stringify(gated)}`);
  assert.match(deps.store.jobs.get("gate-early-budget")!.error ?? "", /nincs több lépéskeret/);
});

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U4): C4/H5 folt-alakú újrakérés; C3/H20 forrás-hivatkozás a szerzői lépés végén. */

function scriptedProvider(deps: ReturnType<typeof makeDeps>, answers: string[]) {
  let n = 0;
  deps.providerFactory = (model: string) => ({
    name: "stub", model, isAvailable: async () => true,
    chat: async (messages: AIMessage[]) => {
      deps.calls.push({ model, system: messages[0]?.content ?? "", user: messages[1]?.content ?? "" });
      const content = answers[Math.min(n++, answers.length - 1)];
      return { content, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
  } as unknown as IAIProvider);
}

test("U4 (C4/H5): célzott javításban a teljes lecke módhiba → folt-alakú újrakérés, a folt egyesül; másodszor is teljes lecke → valódi hiba", async () => {
  const gate = { ok: false, reasons: ["A fogalom magyarázata hiányzik"], ungrounded: [{ blockIndex: 0, sectionIdx: 0, conceptId: "c1" }] };
  const patch = JSON.stringify({ sections: { "0": GOOD_LESSON.sections[0] } });
  const ok = makeDeps("");
  scriptedProvider(ok, [CANNED_AUTHOR, patch]);
  ok.store.seed({ id: "targeted-ok", mapId: "m1", step: "author", round: 1, output: { approvedOutline: GOOD_OUTLINE, lesson: GOOD_LESSON, gate } });
  const result = await runPipelineStep("targeted-ok", ok);
  assert.equal(result.ok, true, JSON.stringify(ok.store.jobs.get("targeted-ok")!.error));
  assert.equal(ok.calls.length, 2, "egy módhelyes újrakérés");
  assert.match(ok.calls[1].user, /CÉLZOTT JAVÍTÁS szerződésének/);
  assert.match(ok.calls[1].user, /FOLT-ALAKBAN/); assert.match(ok.calls[1].user, /teljes lecke itt hiba/);
  assert.match(ok.calls[1].user, /"previousAnswer"/, "az első (teljes) válasz adatként megy vissza");
  assert.equal((ok.store.jobs.get("targeted-ok")!.output!.lesson as Lesson).sections.length, GOOD_LESSON.sections.length);

  const bad = makeDeps("");
  scriptedProvider(bad, [CANNED_AUTHOR, CANNED_AUTHOR]);
  bad.store.seed({ id: "targeted-bad", mapId: "m1", step: "author", round: 1, output: { approvedOutline: GOOD_OUTLINE, lesson: GOOD_LESSON, gate } });
  const failed = await runPipelineStep("targeted-bad", bad);
  assert.equal(failed.ok, false);
  assert.equal(bad.calls.length, 2, "az újrakérés után nincs harmadik kör");
  assert.match(String(bad.store.jobs.get("targeted-bad")!.error), /az újrakérés után sem folt-alakot adott/);
});

test("U4 (C3/H20): a forrás-hivatkozás a SZERZŐI lépés végén kerül ki — a mentett tanítás már tiszta, a bank erre épül; az ábra-lépés nem ír át", async () => {
  const referencing = structuredClone(GOOD_LESSON);
  (referencing.sections[0].blocks[0] as { text: string }).text = "A forrás szerint a sejt az élőlények alapegysége.";
  const deps = makeDeps(JSON.stringify(referencing));
  deps.store.seed({ id: "strip-author", mapId: "m1", step: "author", round: 0, output: { approvedOutline: GOOD_OUTLINE } });
  assert.equal((await runPipelineStep("strip-author", deps)).ok, true, JSON.stringify(deps.store.jobs.get("strip-author")!.error));
  const saved = deps.store.jobs.get("strip-author")!.output!.lesson as Lesson;
  assert.equal((saved.sections[0].blocks[0] as { text: string }).text, "A sejt az élőlények alapegysége.", "a bevezető fordulat kódból törölve, a bank előtt");
  assert.equal(deps.calls.length, 1, "biztonságos törléshez nem kell átíró modell");
});
