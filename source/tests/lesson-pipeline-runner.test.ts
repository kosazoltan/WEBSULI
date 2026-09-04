import assert from "node:assert/strict";
import test from "node:test";

import {
  PIPELINE_PROMPT_VERSION,
  approveOutline,
  runPipelineStep,
  type JobPatch,
  type JobView,
  type MapMeta,
  type PipelineStore,
} from "../server/studio/step-runner";
import { computeStepHash } from "../server/studio/pipeline";
import type { AIMessage, IAIProvider } from "../server/ai/AIProvider";
import type { MapConcept } from "../server/studio/coverage";
import type { LektorNote } from "../server/studio/lektor";

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
  notes = new Map<string, LektorNote[]>();
  lessons = new Map<string, { id: string; mapId: string; json: unknown }>();

  async loadJob(id: string): Promise<JobView | null> {
    return this.jobs.get(id) ?? null;
  }

  async loadMap(id: string) {
    return this.maps.get(id) ?? null;
  }

  async loadBlockerNotes(jobId: string) {
    return (this.notes.get(jobId) ?? [])
      .filter((n) => n.severity === "blocker")
      .map((n) => ({ kind: n.kind, subkind: n.subkind, message: n.message, blockPath: n.blockPath }));
  }

  async saveStep(id: string, patch: JobPatch): Promise<void> {
    const job = this.jobs.get(id);
    assert.ok(job, `saveStep: nincs ilyen job: ${id}`);
    Object.assign(job, patch);
  }

  async saveNotes(jobId: string, notes: LektorNote[]): Promise<void> {
    this.notes.set(jobId, notes);
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

  const calls: Array<{ model: string; system: string; user: string }> = [];
  const providerFactory = (model: string): IAIProvider => ({
    name: "stub",
    model,
    chat: async (messages: AIMessage[]) => {
      calls.push({ model, system: messages[0]?.content ?? "", user: messages[1]?.content ?? "" });
      return { content: cannedResponse, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    isAvailable: async () => true,
  } as unknown as IAIProvider);

  return { store, calls, providerFactory, keyConfigured: () => true };
}

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
const CANNED_LEKTOR_BENIGN = JSON.stringify({
  notes: [{ kind: "source_conflict", subkind: "book_probably_wrong", message: "A könyv téved." }],
});
const CANNED_LEKTOR_BLOCKER = JSON.stringify({
  notes: [{ kind: "source_conflict", subkind: "not_in_map", message: "A c1 állítás nincs a térképen." }],
});

test("(a) pedagogue: a vázlat elmentődik, a következő lépés author", async () => {
  const { store, calls, providerFactory, keyConfigured } = makeDeps(CANNED_PEDAGOGUE);
  const jobId = await store.createJob({
    mapId: "m1",
    step: "pedagogue",
    status: "pending",
    model: "x-ai/grok-4.6",
    promptVersion: PIPELINE_PROMPT_VERSION,
    inputHash: pedagogueHash(),
  });

  const outcome = await runPipelineStep(jobId, { store, providerFactory, keyConfigured });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "author");
  assert.equal(calls.length, 1, "pontosan egy modellhívás");
  assert.ok(calls[0].system.includes("Sejtbiológia"), "a térkép címe a promptban");

  const job = await store.loadJob(jobId);
  assert.equal(job?.status, "ok");
  assert.equal(job?.inputHash, pedagogueHash(), "a vázlat input-hash-e a lépés bemenetét rögzíti");
  assert.deepEqual(job?.output?.outline, GOOD_OUTLINE);

  const stored = store.jobs.get(jobId);
  assert.equal(stored?.tokensIn, 10);
  assert.equal(stored?.tokensOut, 5);
});

test("(b) pedagogue: a térképet nem fedő vázlat hibára fut, megnevezve a hiányzót", async () => {
  const badOutline = JSON.stringify({
    sections: [{ heading: "Fél", conceptIds: ["s1"], plannedBlocks: ["explain"] }],
    misconceptions: [],
  });
  const { store, providerFactory, keyConfigured } = makeDeps(badOutline);
  const jobId = await store.createJob({
    mapId: "m1",
    step: "pedagogue",
    status: "pending",
    model: "x-ai/grok-4.6",
    promptVersion: PIPELINE_PROMPT_VERSION,
    inputHash: pedagogueHash(),
  });

  const outcome = await runPipelineStep(jobId, { store, providerFactory, keyConfigured });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.next.step, "error");
  assert.match(outcome.reason, /c1/, "a hiányzó kulcsfogalom megnevezve");

  const job = await store.loadJob(jobId);
  assert.equal(job?.status, "error");
  assert.equal(job?.step, "error");
  assert.match(job?.error ?? "", /c1/);
  assert.equal(job?.output, null, "félkész vázlat soha nem kerül a jobra");
});

test("(c) author: a lecke elmentődik, a következő lépés lektor", async () => {
  const { store, calls, providerFactory, keyConfigured } = makeDeps(CANNED_AUTHOR);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "author",
    status: "running",
    output: { approvedOutline: GOOD_OUTLINE },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "lektor");
  assert.equal(calls.length, 1);

  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok");
  assert.deepEqual(job?.output?.lesson, GOOD_LESSON);
  assert.ok(job?.lessonId, "a lecke-sor létrejött és a job hivatkozza");
  assert.deepEqual(store.lessons.get(job?.lessonId ?? "")?.json, GOOD_LESSON);
});

test("(d) author: kitalált fogalom-azonosítóval a lecke hibára fut, megnevezve", async () => {
  const { store, providerFactory, keyConfigured } = makeDeps(INVENTED_LESSON);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "author",
    status: "running",
    output: { approvedOutline: GOOD_OUTLINE },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.next.step, "error");
  assert.match(outcome.reason, /kitalalt-id/);

  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "error");
  assert.equal(store.lessons.size, 0, "nem jött létre lecke-sor");
});

test("(e) lektor: csak book_probably_wrong jegyzet → gate, 0 blokkoló", async () => {
  const { store, providerFactory, keyConfigured } = makeDeps(CANNED_LEKTOR_BENIGN);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "lektor",
    status: "running",
    output: { lesson: GOOD_LESSON },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "gate");

  const job = await store.loadJob("job-1");
  assert.deepEqual(job?.output?.blockers, 0);
  const notes = store.notes.get("job-1") ?? [];
  assert.equal(notes.length, 1);
  assert.equal(notes[0].severity, "info", "a book_probably_wrong az adminé, nem blokkol (D1)");
});

test("(f) lektor: not_in_map blokkoló → author, round+1", async () => {
  const { store, providerFactory, keyConfigured } = makeDeps(CANNED_LEKTOR_BLOCKER);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "lektor",
    status: "running",
    round: 0,
    output: { lesson: GOOD_LESSON },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "author");
  assert.equal(outcome.ok && outcome.next.round, 1);

  const job = await store.loadJob("job-1");
  assert.deepEqual(job?.output?.blockers, 1);
  const notes = store.notes.get("job-1") ?? [];
  assert.equal(notes.length, 1);
  assert.equal(notes[0].severity, "blocker");
});

test("(g) lektor: round>=2 blokkolókkal → error, emberi döntés szükséges", async () => {
  const { store, providerFactory, keyConfigured } = makeDeps(CANNED_LEKTOR_BLOCKER);
  store.seed({
    id: "job-1",
    mapId: "m1",
    step: "lektor",
    status: "running",
    round: 2,
    output: { lesson: GOOD_LESSON },
  });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.next.step, "error");
  assert.match(outcome.reason, /emberi döntés/);

  const job = await store.loadJob("job-1");
  assert.equal(job?.step, "error");
  assert.equal(job?.status, "error");
});

test("(h) approve-outline: ismeretlen azonosítójú vázlat elutasítva, hívás nélkül", async () => {
  const { store, calls, providerFactory, keyConfigured } = makeDeps(CANNED_AUTHOR);
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
  const result = await approveOutline("job-1", bad, { store, providerFactory, keyConfigured });

  assert.equal(result.ok, false);
  assert.match(result.reason, /kitalalt-id/);
  assert.equal(calls.length, 0, "elutasított vázlatért nem fizetünk");

  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok", "a job várakozik, nem futott el");
  assert.equal(job?.output?.approvedOutline, undefined);
});

test("(i) resume: azonos input-hash → gyorsítótár, nincs második hívás", async () => {
  const { store, calls, providerFactory, keyConfigured } = makeDeps(CANNED_PEDAGOGUE);
  const jobId = await store.createJob({
    mapId: "m1",
    step: "pedagogue",
    status: "pending",
    model: "x-ai/grok-4.6",
    promptVersion: PIPELINE_PROMPT_VERSION,
    inputHash: pedagogueHash(),
  });

  const first = await runPipelineStep(jobId, { store, providerFactory, keyConfigured });
  assert.equal(first.ok, true);
  assert.equal(calls.length, 1);

  // Resume before the caller applied the transition: the current step's input is
  // still identical, so the stored output must be reused — never a second payment.
  const second = await runPipelineStep(jobId, { store, providerFactory, keyConfigured });
  assert.equal(second.ok, true);
  assert.equal(second.cached, true);
  assert.equal(calls.length, 1, "a gyorsítótár-találat nem hívja újra a modellt");
  assert.equal(second.ok && second.next.step, "author");
});

test("OPENROUTER_API_KEY hiányában a job hibára fut, tiszta magyar üzenettel", async () => {
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
  assert.match(outcome.reason, /OPENROUTER_API_KEY/);

  const job = await store.loadJob(jobId);
  assert.equal(job?.status, "error");
  assert.match(job?.error ?? "", /OPENROUTER_API_KEY/);
});
