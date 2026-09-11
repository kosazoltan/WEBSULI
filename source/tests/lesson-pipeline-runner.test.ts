import assert from "node:assert/strict";
import test from "node:test";

import {
  PIPELINE_PROMPT_VERSION,
  advanceJob,
  approveOutline,
  runPipelineStep,
  startJobFromMap,
  type JobPatch,
  type JobView,
  type MapMeta,
  type PipelineStore,
} from "../server/studio/step-runner";
import { computeStepHash } from "../server/studio/pipeline";
import { buildPedagoguePrompt } from "../server/studio/step-io";
import { fromMapBody } from "../server/studio/from-map-body";
import type { AIMessage, IAIProvider } from "../server/ai/AIProvider";
import type { MapConcept } from "../server/studio/coverage";
import type { LektorNote } from "../server/studio/lektor";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";
import { buildLessonExperience, type ExperienceCheckpoint } from "../server/studio/experience-builder";
import { canReuseLessonVisuals } from "../server/studio/visual-reuse";

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
      return { content: cannedResponse, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    },
    isAvailable: async () => true,
  } as unknown as IAIProvider);

  return { store, calls, promptNames, promptLookup, providerFactory, keyConfigured: () => true };
}

test("kész, forrásfogalomhoz kötött ábrák: nulla animátorhívás, utána a lektor ténylegesen fut", async () => {
  const lesson = compactFusionFixture();
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
  const lesson = compactFusionFixture();
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
  const lesson = compactFusionFixture();
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

test("lektori bankhiba a szerzőn át a banképítőhöz jut; az előző lecke és nyelvi javítás sem vész el", async () => {
  const lesson = compactFusionFixture();
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
  const reviewed = await runPipelineStep("review-bank", deps);
  assert.ok(reviewed.ok && reviewed.next.step === "author" && reviewed.next.round === 1);
  const job = deps.store.jobs.get("review-bank")!;
  assert.equal(job.output?.reportRound, 0);
  delete job.output!.reportRound; // Pre-deploy jobs must retain this round's language warning too.
  job.step = "author"; job.round = 1;
  job.output = { ...job.output, approvedOutline: GOOD_OUTLINE };
  const authored = { ...lesson, experience: undefined };
  const authorDeps = makeDeps(JSON.stringify(authored));
  assert.ok((await runPipelineStep(job.id, { ...authorDeps, store: deps.store })).ok);
  assert.match(authorDeps.calls[0].system, /previousLesson/);
  assert.match(authorDeps.calls[0].system, /RUBRIKA-HIBA/);
  assert.match(authorDeps.calls[0].system, /NYELVI-HIBA/);
  assert.doesNotMatch(authorDeps.calls[0].system + authorDeps.calls[0].user, /ADMIN-ONLY-FORRAS/);
  assert.equal((job.output?.lesson as typeof lesson).experience, undefined);
  job.step = "animator";
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
  const deps = makeDeps(CANNED_AUTHOR);
  const gate = {ok:false,reasons:["A fogalom magyarázata hiányzik"],ungrounded:[{blockIndex:0,conceptId:"c1"}]};
  deps.store.seed({id:"retry",mapId:"m1",step:"author",round:1,output:{approvedOutline:GOOD_OUTLINE,lesson:GOOD_LESSON,gate}});
  assert.equal((await runPipelineStep("retry",deps)).ok,true);
  const input=JSON.parse(deps.calls[0].system.split('A kapu javítandó megállapításai és az előző lecke:\n')[1]);
  assert.deepEqual(input.gateFeedback,gate);
  assert.deepEqual(input.previousLesson,GOOD_LESSON);
});
const CANNED_LEKTOR_BENIGN = JSON.stringify({
  notes: [{ kind: "source_conflict", subkind: "book_probably_wrong", message: "A könyv téved." }],
});
const CANNED_LEKTOR_BLOCKER = JSON.stringify({
  notes: [{ kind: "source_conflict", subkind: "not_in_map", message: "A c1 állítás nincs a térképen." }],
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
  assert.equal(job?.inputHash, computeStepHash("pedagogue", PIPELINE_PROMPT_VERSION, {
    input: { map: MAP_META, concepts: MAP_CONCEPTS },
    system: buildPedagoguePrompt({title: MAP_META.title, subject: MAP_META.subject, classroom: MAP_META.classroom, concepts: MAP_CONCEPTS}),
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
            caption: "Számegyenes",
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
import { FALLBACK_MODELS, resolveStudioModel } from "../server/ai/models";

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
  const primary = resolveStudioModel("author");
  const fallback = FALLBACK_MODELS.author!;
  assert.notEqual(primary, fallback);
  const { store, calls, providerFactory, keyConfigured, promptLookup } = makeFailoverDeps({
    failModels: new Set([primary]),
    cannedResponse: CANNED_AUTHOR,
  });
  store.seed({ id: "job-1", mapId: "m1", step: "author", status: "running", output: { approvedOutline: GOOD_OUTLINE } });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, true);
  assert.deepEqual(calls, [primary, fallback], "előbb az elsődleges, majd a fallback modell");
  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok");
  assert.equal((job as { model?: string | null })?.model, fallback, "a job a ténylegesen használt modellt rögzíti");
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

test("(o) author: ha az elsődleges ÉS a fallback modell is hibázik, a hiba mindkét modellt és az okot megnevezi", async () => {
  const primary = resolveStudioModel("author");
  const fallback = FALLBACK_MODELS.author!;
  const { store, providerFactory, keyConfigured, promptLookup } = makeFailoverDeps({
    failModels: new Set([primary, fallback]),
    cannedResponse: CANNED_AUTHOR,
  });
  store.seed({ id: "job-1", mapId: "m1", step: "author", status: "running", output: { approvedOutline: GOOD_OUTLINE } });

  const outcome = await runPipelineStep("job-1", { store, providerFactory, keyConfigured, promptLookup });

  assert.equal(outcome.ok, false);
  assert.ok(outcome.reason.includes(primary), `az elsődleges modell neve szerepel: ${outcome.reason}`);
  assert.ok(outcome.reason.includes(fallback), `a fallback modell neve szerepel: ${outcome.reason}`);
  assert.match(outcome.reason, /Rate limit exceeded/);
});
