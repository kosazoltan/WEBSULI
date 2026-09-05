import assert from "node:assert/strict";
import test from "node:test";

import {
  runPipelineStep,
  type JobPatch,
  type JobView,
  type MapMeta,
  type PipelineStore,
  type PublishInput,
} from "../server/studio/step-runner";
import type { MapConcept } from "../server/studio/coverage";
import type { LektorNote } from "../server/studio/lektor";

/**
 * Audit 2026-09-05 (spec: docs/specs/audit-4day-fixes-2026-09-05.md, szelet A).
 *
 * Measured on prod: every lesson row had published_at = NULL and the last successful
 * studio_jobs row sat at step='gate' forever — the deterministic gate and the publish
 * step were never implemented, so no lesson ever reached a child. These tests pin the
 * gate: schema + coverage check on the stored lesson, publish on pass (html_files row,
 * publishedAt, coverage snapshot, quiz export), author round on failure, never publish
 * a failing lesson.
 */

const MAP_META: MapMeta = { id: "m1", title: "A sejt", subject: "biológia", classroom: 7 };
const MAP_CONCEPTS: MapConcept[] = [
  { id: "uuid-c1", localId: "c1", examWeight: "core" },
  { id: "uuid-c2", localId: "c2", examWeight: "core" },
  { id: "uuid-s1", localId: "s1", examWeight: "supporting" },
];

function lessonCovering(ids: string[], withCheck = true) {
  const blocks: unknown[] = ids.map((id) => ({
    kind: "explain",
    text: `Magyarázat: ${id}.`,
    depth: "core",
    readAloud: true,
    coversConceptIds: [id],
  }));
  if (withCheck) {
    blocks.push({
      kind: "check",
      question: "Mi a sejt?",
      options: ["Alapegység", "Szerv", "Szövet", "Rendszer"],
      correctIndex: 0,
      explanation: "A sejt az élőlények alapegysége.",
      feedbackPerOption: ["Igen!", "Nem, az nagyobb.", "Nem, az több sejt.", "Nem, az még nagyobb."],
      coversConceptIds: [ids[0]],
    });
  }
  return {
    title: "A sejt",
    subject: "biológia",
    classroom: 7,
    mapId: "m1",
    sections: [{ heading: "A sejt", probaEnabled: true, blocks }],
    misconceptions: [],
    sourceOnly: true,
  };
}

type StoredJob = JobView & { finishedAt: Date | null };

class MemoryStore implements PipelineStore {
  jobs = new Map<string, StoredJob>();
  maps = new Map<string, { meta: MapMeta; concepts: MapConcept[] }>();
  lessons = new Map<string, { id: string; mapId: string; json: unknown }>();
  published: PublishInput[] = [];

  async loadJob(id: string) {
    return this.jobs.get(id) ?? null;
  }
  async loadMap(id: string) {
    return this.maps.get(id) ?? null;
  }
  async loadBlockerNotes(): Promise<never[]> {
    return [];
  }
  async saveStep(id: string, patch: JobPatch) {
    const job = this.jobs.get(id);
    assert.ok(job);
    Object.assign(job, patch);
  }
  async saveNotes(_jobId: string, _notes: LektorNote[]) {}
  async upsertLesson(lessonId: string | null, mapId: string, json: unknown) {
    const id = lessonId ?? `lesson-${this.lessons.size + 1}`;
    this.lessons.set(id, { id, mapId, json });
    return id;
  }
  async createJob(): Promise<string> {
    throw new Error("not used");
  }
  async publishLesson(input: PublishInput) {
    this.published.push(input);
    return { htmlFileId: `file-${this.published.length}`, exportedQuizItems: input.quizItems.length };
  }

  seed(job: Partial<StoredJob> & { id: string; mapId: string; step: StoredJob["step"] }) {
    this.jobs.set(job.id, {
      lessonId: null,
      status: "running",
      round: 0,
      inputHash: "",
      output: null,
      error: null,
      finishedAt: null,
      ...job,
    });
  }
}

function deps(store: MemoryStore) {
  return {
    store,
    providerFactory: () => {
      throw new Error("a kapu determinisztikus — nem hívhat modellt");
    },
    keyConfigured: () => true,
    promptLookup: async (_n: string, f: string) => f,
  };
}

test("gate pass: a lecke publikálódik (html_files, publishedAt, coverage, kvíz-export) és a job done", async () => {
  const store = new MemoryStore();
  store.maps.set("m1", { meta: MAP_META, concepts: MAP_CONCEPTS });
  const lesson = lessonCovering(["c1", "c2", "s1"]);
  store.lessons.set("lesson-1", { id: "lesson-1", mapId: "m1", json: lesson });
  store.seed({ id: "job-1", mapId: "m1", step: "gate", lessonId: "lesson-1", output: { lesson } });

  const outcome = await runPipelineStep("job-1", deps(store));

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "done");
  assert.equal(store.published.length, 1, "pontosan egy publikálás");
  const pub = store.published[0];
  assert.equal(pub.lessonId, "lesson-1");
  assert.equal(pub.title, "A sejt");
  assert.equal(pub.classroom, 7);
  assert.equal(pub.coverage.core.ratio, 1);
  assert.equal(pub.quizItems.length, 4 * 1, "1 fogalom-kötött check × 4 kupon-motoros játék");
  // #178: the FK column gets the km_concepts UUID, never the lesson's local slug.
  assert.ok(pub.quizItems.every((q) => q.conceptId === "uuid-c1"), "conceptId = km_concepts.id (UUID), nem 'c1'");
  const job = await store.loadJob("job-1");
  assert.equal(job?.status, "ok");
  assert.equal((job?.output as { htmlFileId?: string })?.htmlFileId, "file-1");
});

test("gate fail (hiányzó core fogalom): NEM publikál, author round+1, ok megnevezve", async () => {
  const store = new MemoryStore();
  store.maps.set("m1", { meta: MAP_META, concepts: MAP_CONCEPTS });
  const lesson = lessonCovering(["c1", "s1"]); // c2 hiányzik
  store.lessons.set("lesson-1", { id: "lesson-1", mapId: "m1", json: lesson });
  store.seed({ id: "job-1", mapId: "m1", step: "gate", round: 0, lessonId: "lesson-1", output: { lesson } });

  const outcome = await runPipelineStep("job-1", deps(store));

  assert.equal(outcome.ok, true);
  assert.equal(outcome.ok && outcome.next.step, "author");
  assert.equal(outcome.ok && outcome.next.round, 1);
  assert.equal(store.published.length, 0, "bukó lecke sosem publikálódik");
  const job = await store.loadJob("job-1");
  const gate = (job?.output as { gate?: { ok: boolean; reasons: string[] } })?.gate;
  assert.equal(gate?.ok, false);
  assert.match(gate?.reasons.join(" ") ?? "", /c2/);
});

test("gate fail a kör-limit után → error (nem végtelen hurok), nincs publikálás", async () => {
  const store = new MemoryStore();
  store.maps.set("m1", { meta: MAP_META, concepts: MAP_CONCEPTS });
  const lesson = lessonCovering(["c1"]);
  store.lessons.set("lesson-1", { id: "lesson-1", mapId: "m1", json: lesson });
  store.seed({ id: "job-1", mapId: "m1", step: "gate", round: 2, lessonId: "lesson-1", output: { lesson } });

  const outcome = await runPipelineStep("job-1", deps(store));

  assert.equal(outcome.ok, false);
  assert.equal(outcome.next.step, "error");
  assert.equal(store.published.length, 0);
});

test("gate: fogalom-kötés nélküli check → publikál, 0 exportált kvíz (nem hiba)", async () => {
  const store = new MemoryStore();
  store.maps.set("m1", { meta: MAP_META, concepts: MAP_CONCEPTS });
  const lesson = lessonCovering(["c1", "c2", "s1"], false);
  store.lessons.set("lesson-1", { id: "lesson-1", mapId: "m1", json: lesson });
  store.seed({ id: "job-1", mapId: "m1", step: "gate", lessonId: "lesson-1", output: { lesson } });

  const outcome = await runPipelineStep("job-1", deps(store));

  assert.equal(outcome.ok && outcome.next.step, "done");
  assert.equal(store.published.length, 1);
  assert.equal(store.published[0].quizItems.length, 0);
});

test("gate: lecke nélküli job → error, publikálás nélkül", async () => {
  const store = new MemoryStore();
  store.maps.set("m1", { meta: MAP_META, concepts: MAP_CONCEPTS });
  store.seed({ id: "job-1", mapId: "m1", step: "gate", output: {} });

  const outcome = await runPipelineStep("job-1", deps(store));

  assert.equal(outcome.ok, false);
  assert.equal(store.published.length, 0);
});
