import { teachingHtml } from "./helpers/teaching-html";
import { syntheticTeachingReviewEvidence } from "./helpers/teaching-review";
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { verifyLessonMethodHtml } from "../server/improve/verify-lesson-method";
import { createResearchJobs, checkedResearchArtifact, completeWebStudioJob, publicResearchJob, webLessonTitleFromHtml, type ResearchJobStore, type StoredResearchJob } from "../server/studio/web-research-jobs";
import { WebResearchFailure, webResearchTurnKey } from "../server/studio/web-research-runner";
import { workflowCheckpoint, workflowMode, workflowPhase } from "../server/workflows/engine";
import { generateWebStudioLesson } from "../server/studio/web-studio-handoff";
import { memoryWorkflows } from "./helpers/workflow-store";

const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "Matematika", experience: standardFusionFixture().experience };
const htmlFor = (value: unknown) => `<!DOCTYPE html><html><body><a href="https://www.oktatas.hu">Forrás</a>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id="websuli-lesson-data">${JSON.stringify(value)}</script><script>const data = JSON.parse(document.getElementById('websuli-lesson-data').textContent);</script></body></html>`;
const baseArtifact = { html: htmlFor(data), sources: [{ url: "https://www.oktatas.hu", title: "Tanterv" }] };
const artifact = { ...baseArtifact, reviewEvidence: syntheticTeachingReviewEvidence(baseArtifact.html, baseArtifact.sources) };
const input = { message: "Készíts tananyagot", classroom: 4 };

test("publication requires passing review evidence bound to the exact HTML and source list", () => {
  assert.doesNotThrow(() => checkedResearchArtifact(artifact));
  const failedReview = structuredClone(artifact.reviewEvidence); failedReview.review.checks[0].passed = false;
  for (const invalid of [
    { ...artifact, reviewEvidence: undefined },
    { ...artifact, html: artifact.html.replace("</body>", "<p>Megváltoztatott tanítás</p></body>") },
    { ...artifact, sources: [...artifact.sources, { url: "https://example.org", title: "Nem ellenőrzött" }] },
    { ...artifact, reviewEvidence: failedReview },
  ]) assert.throws(() => checkedResearchArtifact(invalid), /lektorálás/);
});
function memoryStore() {
  const rows = new Map<string, StoredResearchJob>();
  const materials = new Map<string, string>();
  let publicationUnavailable = false;
  const store: ResearchJobStore = {
    async create(job) { if (rows.has(job.id)) return false; rows.set(job.id, structuredClone(job)); return true; },
    async read(id, user) { const job = rows.get(id); return job?.userId === user ? structuredClone(job) : null; },
    async update(job, expected) { if (rows.get(job.id)?.state === expected) rows.set(job.id, structuredClone(job)); },
    async publish(id, user) {
      if (publicationUnavailable) throw new WebResearchFailure("Mentés átmenetileg nem elérhető");
      const job = rows.get(id)!;
      assert.equal(job.userId, user);
      if (job.state === "done") return structuredClone(job);
      assert.equal(job.state, "ready");
      checkedResearchArtifact({ html: job.html!, sources: job.sources, reviewEvidence: job.reviewEvidence });
      materials.set(id, job.html!);
      job.state = "done"; job.materialId = id; job.error = undefined;
      return structuredClone(job);
    },
  };
  return { store, rows, materials, setPublicationUnavailable(value: boolean) { publicationUnavailable = value; } };
}
async function until(check: () => boolean) { for (let i = 0; i < 100 && !check(); i++) await delay(5); assert.ok(check()); }

test("valódi webes vezérlő és workflow együtt: hiba, visszatöltés, mentés és kész eredmény", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows(); let calls = 0;
  m.setPublicationUnavailable(true);
  const generate = async () => { calls++; return artifact; };
  const jobs = createResearchJobs(m.store, generate, workflows.store);
  await jobs.start("tracked", "owner", input);
  await until(() => workflows.records.get("tracked")?.view.state === "error");
  assert.equal(workflows.records.get("tracked")!.view.visits.at(-1)!.step, "publish");
  assert.equal(m.materials.size, 0);
  m.setPublicationUnavailable(false);
  const restarted = createResearchJobs(m.store, generate, workflows.store);
  await restarted.publish("tracked", "owner");
  assert.equal(calls, 1); assert.equal(m.materials.size, 1);
  const view = workflows.records.get("tracked")!.view;
  assert.equal(view.state, "done"); assert.deepEqual(view.visits.map(v => v.step), ["generate", "knowledge", "author", "gate", "publish", "readback"]);
  assert.deepEqual(view.result, { kind: "material", id: "tracked" });
});

test("háttérmunka: az indítás azonnali, kliens nélkül elment, ugyanaz az ID csak egyszer generál", async () => {
  const m = memoryStore(); let calls = 0; let finish!: () => void;
  const paused = new Promise<void>(resolve => { finish = resolve; });
  const jobs = createResearchJobs(m.store, async (_input, observer) => {
    calls++; assert.equal(observer.signal, undefined);
    observer.onEvent({ type: "sources", sources: artifact.sources });
    await paused; await observer.onCandidate?.(artifact.html, { outputTokens: 1200 }); return artifact;
  });
  const [a, b] = await Promise.all([jobs.start("id", "owner", input), jobs.start("id", "owner", input)]);
  assert.equal(a.state, "running"); assert.equal(b.state, "running"); assert.equal(calls, 1);
  finish(); await until(() => m.rows.get("id")?.state === "done");
  const saved = await jobs.read("id", "owner");
  assert.equal(saved?.classroom, 7); assert.equal(saved?.materialId, "id");
  assert.equal(m.materials.get("id"), artifact.html);
  assert.equal((await jobs.start("id", "owner", input)).state, "done");
  await jobs.publish("id", "owner"); assert.equal(m.materials.size, 1); assert.equal(calls, 1);
  assert.equal("candidate" in publicResearchJob(saved!), false);
});

test("checkpoint után, ready előtt megszakadt webes munka új AI nélkül folytatható", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows(); let calls = 0;
  const update = m.store.update; let failReady = true;
  m.store.update = async (job, expected) => {
    if (job.state === "ready" && failReady) { failReady = false; throw new Error("Synthetic crash before ready persisted"); }
    return update(job, expected);
  };
  const generate = async () => { calls++; return artifact; };
  const jobs = createResearchJobs(m.store, generate, workflows.store);
  await jobs.start("checkpoint-gap", "owner", input);
  await until(() => workflows.records.get("checkpoint-gap")?.view.state === "error");
  assert.equal(m.rows.get("checkpoint-gap")!.state, "running");
  m.rows.get("checkpoint-gap")!.createdAt = Date.now() - 26 * 60_000;
  m.rows.get("checkpoint-gap")!.updatedAt = Date.now() - 26 * 60_000;
  const restarted = createResearchJobs(m.store, generate, workflows.store);
  const recovered = await restarted.read("checkpoint-gap", "owner");
  assert.equal(recovered!.state, "error"); assert.equal(publicResearchJob(recovered!).canResume, true);
  await assert.rejects(restarted.publish("checkpoint-gap", "other"));
  await restarted.publish("checkpoint-gap", "owner");
  assert.equal(calls, 1); assert.equal(m.materials.size, 1);
  assert.equal(workflows.records.get("checkpoint-gap")!.view.state, "done");
  assert.equal(workflows.records.get("checkpoint-gap")!.view.visits[0].cacheHits, 1);
  await restarted.publish("checkpoint-gap", "owner"); assert.equal(m.materials.size, 1);
});

test("completed author turn and fetched text survive reviewer failure without a second author call", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows(); let authorCalls = 0; let reviewBroken = true;
  const sourceText = "Tényleges tesztforrás teljes szövege, az ellenőrzésig változatlanul őrzendő.";
  const generate = async () => {
    const turn = await workflowCheckpoint("web-provider-turn", webResearchTurnKey(input), async () => {
      authorCalls++; return { content: artifact.html, sources: artifact.sources,
        final: { stop_reason: "end_turn", content: [{ type: "web_fetch_tool_result", text: sourceText }] } };
    });
    assert.equal(turn.final.content[0].text, sourceText);
    if (reviewBroken) throw new Error("Synthetic reviewer outage");
    return { html: turn.content, sources: turn.sources, reviewEvidence: artifact.reviewEvidence };
  };
  const jobs = createResearchJobs(m.store, generate, workflows.store);
  await jobs.start("author-checkpoint", "owner", input);
  await until(() => workflows.records.get("author-checkpoint")?.view.state === "error");
  const saved = await jobs.read("author-checkpoint", "owner");
  assert.equal(saved?.canResume, true); assert.equal(m.materials.size, 0);
  assert.equal(JSON.stringify(publicResearchJob(saved!)).includes(sourceText), false);
  reviewBroken = false;
  await createResearchJobs(m.store, generate, workflows.store).publish("author-checkpoint", "owner");
  assert.equal(authorCalls, 1); assert.equal(m.materials.size, 1);
  assert.equal(workflows.records.get("author-checkpoint")!.view.state, "done");
});

test("commit utáni visszaolvasási hiba nem állítja vissza a done jobot és nem publikál kétszer", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows(); let calls = 0; let broken = true;
  m.store.verifyMaterial = async () => { if (broken) throw new Error("Synthetic readback outage"); return true; };
  const jobs = createResearchJobs(m.store, async () => { calls++; return artifact; }, workflows.store);
  await jobs.start("post-commit", "owner", input);
  await until(() => workflows.records.get("post-commit")?.view.state === "error");
  assert.equal(m.rows.get("post-commit")!.state, "done"); assert.equal(m.materials.size, 1);
  broken = false;
  await createResearchJobs(m.store, async () => { throw new Error("Must reuse completed response"); }, workflows.store).publish("post-commit", "owner");
  assert.equal(workflows.records.get("post-commit")!.view.state, "done");
  assert.equal(calls, 1); assert.equal(m.materials.size, 1);
});

test("hibás vagy hiányzó checkpoint nem kínál folytatást és nem indít új AI-hívást", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows(); let calls = 0;
  const jobs = createResearchJobs(m.store, async () => { calls++; return { ...artifact, html: "Hiányos válasz" }; }, workflows.store);
  await jobs.start("invalid-checkpoint", "owner", input);
  await until(() => workflows.records.get("invalid-checkpoint")?.view.state === "error");
  assert.equal((await jobs.read("invalid-checkpoint", "owner"))!.canResume, false);
  await assert.rejects(jobs.publish("invalid-checkpoint", "owner"), /Még nincs/);
  workflows.records.get("invalid-checkpoint")!.checkpoints = {};
  assert.equal((await jobs.read("invalid-checkpoint", "owner"))!.canResume, false);
  assert.equal(calls, 1); assert.equal(m.materials.size, 0);
});
test("más tulajdonos és eltérő kérés nem vehet át futást", async () => {
  const m = memoryStore(); const jobs = createResearchJobs(m.store, async () => artifact);
  await jobs.start("id", "owner", input);
  assert.equal(await jobs.read("id", "other"), null);
  await assert.rejects(jobs.start("id", "other", input), /másik kéréshez/);
  await assert.rejects(jobs.start("id", "owner", { ...input, classroom: 5 }), /másik kéréshez/);
  await until(() => m.rows.get("id")?.state === "done");
});
test("mentési hiba után a szerveren megmaradt jelölt publikálható új AI nélkül", async () => {
  const m = memoryStore(); m.setPublicationUnavailable(true); let calls = 0;
  const jobs = createResearchJobs(m.store, async () => { calls++; return artifact; });
  await jobs.start("id", "owner", input);
  await until(() => Boolean(m.rows.get("id")?.error));
  assert.equal(m.rows.get("id")?.state, "ready"); assert.equal(m.materials.size, 0);
  m.setPublicationUnavailable(false); await jobs.publish("id", "owner");
  assert.equal(m.materials.size, 1); assert.equal(calls, 1);
});
test("hibás bank nem mentődik, a pontos diagnózis és jelölt megmarad", async () => {
  const m = memoryStore(); const bad = { ...data, experience: { ...data.experience, tasks: [] } };
  const badHtml = htmlFor(bad);
  const jobs = createResearchJobs(m.store, async (_, observer) => { await observer.onCandidate?.(badHtml, { problems: "experience.tasks" }); return { ...artifact, html: badHtml }; });
  await jobs.start("id", "owner", input); await until(() => m.rows.get("id")?.state === "error");
  const failed = m.rows.get("id")!;
  assert.match(failed.error!, /experience.tasks/); assert.equal(failed.candidate, badHtml); assert.equal(m.materials.size, 0);
});
test("a bank ellenőrzése mezőszintű hibát ad az általános hibaszöveg helyett", () => {
  assert.equal(verifyLessonMethodHtml(artifact.html).ok, true);
  const bad = structuredClone(data); bad.experience!.tasks[0].required = [];
  assert.match(verifyLessonMethodHtml(htmlFor(bad)).problems.join(";"), /experience.tasks.0.required/);
});
test("árva szerverfutás explicit hibává válik; kész eredményt az időkorlát nem bánt", async () => {
  const m = memoryStore(); const jobs = createResearchJobs(m.store, async () => artifact);
  const old: StoredResearchJob = { id: "old", userId: "owner", input, state: "running", stage: "Fut…", createdAt: Date.now() - 26 * 60_000, title: "", message: input.message, content: "", sources: [], diagnostics: [] };
  m.rows.set(old.id, old);
  assert.equal((await jobs.read("old", "owner"))?.state, "error");
  m.rows.set("done", { ...old, id: "done", state: "done", materialId: "done" });
  assert.equal((await jobs.read("done", "owner"))?.state, "done");
});

/* Spec 2026-09-19 — the reviewer's open pedagogical notes reach the Studio panel as warnings. */
test("publicResearchJob továbbadja a lektori figyelmeztetéseket, hiányukban nincs warnings mező", () => {
  const base = { id: "w1", userId: "u", input: { message: "talaj", classroom: 5, conversationHistory: [] }, state: "done", stage: "kész", title: "T", message: "talaj", content: "", sources: [], diagnostics: [], createdAt: 1, html: "<html></html>", materialId: "m1" } as unknown as StoredResearchJob;
  assert.equal("warnings" in publicResearchJob(base), false);
  const warned = { ...base, reviewEvidence: { version: "web-teaching-review-1", htmlHash: "a", sourceListHash: "b", fetchedSourcesHash: "c", review: { checks: [], issues: [] }, warnings: ["explanation_depth", "age_and_added_value"] } } as unknown as StoredResearchJob;
  assert.deepEqual(publicResearchJob(warned).warnings, ["explanation_depth", "age_and_added_value"]);
  assert.equal("candidate" in publicResearchJob(warned), false);
});

test("spec 2026-09-19: cím nélküli kérésnél a webes lecke címe a HTML <title>/<h1> szövege, különben a generikus", () => {
  assert.equal(webLessonTitleFromHtml("<html><head><title> A talaj &nbsp; kialakulása </title></head><body><h1>Más</h1></body></html>"), "A talaj kialakulása");
  assert.equal(webLessonTitleFromHtml("<html><body><h1>A <b>talaj</b> védelme</h1></body></html>"), "A talaj védelme");
  assert.equal(webLessonTitleFromHtml("<html><body><title>ab</title><p>nincs cím</p></body></html>"), null);
});

/* Spec 2026-09-25 — webes gyártás elakadása: élő munkás, halott munkás, mérgezett mentési lánc, háttér-folytatás, mentett bankcsomagok. */
test("spec 2026-09-25: élő workflow mellett a régi állapotírás nem nyilvánítja halottnak a futást", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows(); let finish!: () => void;
  const paused = new Promise<void>(resolve => { finish = resolve; });
  const jobs = createResearchJobs(m.store, async () => { await paused; return artifact; }, workflows.store);
  await jobs.start("alive", "owner", input);
  await until(() => workflows.records.get("alive")?.view.state === "running");
  m.rows.get("alive")!.updatedAt = Date.now() - 40 * 60_000;
  assert.equal((await jobs.read("alive", "owner"))!.state, "running");
  finish(); await until(() => m.rows.get("alive")?.state === "done");
  assert.equal(m.materials.size, 1);
});
test("spec 2026-09-25: megszakadt workflow (újraindulás) azonnal hibát és folytatást mutat, nem 25 perc múlva", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows();
  const jobs = createResearchJobs(m.store, async () => { throw new Error("Synthetic crash"); }, workflows.store);
  await jobs.start("gone", "owner", input);
  await until(() => workflows.records.get("gone")?.view.state === "error");
  // The worker died before it could record the error on the job row (process restart).
  const row = m.rows.get("gone")!; row.state = "running"; row.error = undefined; row.updatedAt = Date.now();
  workflows.records.get("gone")!.view.state = "interrupted";
  const seen = await jobs.read("gone", "owner");
  assert.equal(seen!.state, "error"); assert.match(seen!.error!, /folytatható/);
});
test("spec 2026-09-25: egy sikertelen állapotírás nem mérgezi meg a mentési láncot", async () => {
  const m = memoryStore(); const update = m.store.update; let failOnce = true;
  m.store.update = async (job, expected) => {
    if (failOnce && job.stage === "Első státusz") { failOnce = false; throw new Error("Synthetic transient DB error"); }
    return update(job, expected);
  };
  const jobs = createResearchJobs(m.store, async (_input, observer) => {
    observer.onEvent({ type: "status", message: "Első státusz" });
    observer.onEvent({ type: "status", message: "Második státusz" });
    await observer.onCandidate?.(artifact.html, {});
    return artifact;
  });
  await jobs.start("poison", "owner", input);
  await until(() => ["done", "error"].includes(m.rows.get("poison")?.state ?? ""));
  assert.equal(m.rows.get("poison")!.state, "done"); assert.equal(m.materials.size, 1);
});
test("spec 2026-09-25: a háttér-folytatás a bérlet után azonnal visszatér, a kész bankcsomagokat modellhívás nélkül kapja", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows(); let calls = 0; let broken = true;
  const saved = { hash: "fusion-test", parts: { packet: { methods: [], tasks: [], quiz: [], glossary: [] } } };
  let resumedWith: unknown; let finish!: () => void;
  const paused = new Promise<void>(resolve => { finish = resolve; });
  const generate = async (_input: typeof input, observer: Parameters<Parameters<typeof createResearchJobs>[1]>[1]) => {
    calls++;
    await workflowCheckpoint("web-provider-turn", webResearchTurnKey(input), async () => ({ content: "", sources: artifact.sources, final: { stop_reason: "end_turn", content: [] } }));
    if (broken) { await observer.onBankCheckpoint?.(saved); throw new Error("Synthetic bank provider outage"); }
    resumedWith = observer.bankCheckpoint;
    await paused;
    return artifact;
  };
  const jobs = createResearchJobs(m.store, generate, workflows.store);
  await jobs.start("resume-bg", "owner", input);
  await until(() => workflows.records.get("resume-bg")?.view.state === "error");
  const failed = await jobs.read("resume-bg", "owner");
  assert.equal(failed!.canResume, true); assert.deepEqual(failed!.bankCheckpoint, saved);
  assert.equal("bankCheckpoint" in publicResearchJob(failed!), false);
  broken = false;
  const resumed = await jobs.publish("resume-bg", "owner", { background: true });
  assert.equal(resumed.state, "running"); assert.equal(m.materials.size, 0);
  finish(); await until(() => m.rows.get("resume-bg")?.state === "done");
  assert.deepEqual(resumedWith, saved); assert.equal(calls, 2); assert.equal(m.materials.size, 1);
});

/* Spec 2026-09-25 (docs/specs/2026-09-25-webes-studio-atadas.md) — a webes út a letöltött forrásokat a Studio-gyártásnak adja át.
 * Spec-változás 2026-10-06-s7 (docs/specs/2026-10-06-s7-workflow-rendbetetel.md §4/7): a gyártás a webes job SAJÁT `webStudio`
 * futásában megy, valódi lépésekkel — nincs külön upload-futás és nincs utólag kitöltött lépés. A korábbi elvárás („a futás a
 * webes workflow-n kívül indul”, lépéssor generate→knowledge→author→gate→publish→readback) ezért szigorúbbra cserélődött. */
const STUDIO_STEPS = ["source", "scope", "knowledge", "sourceCheck", "pedagogue", "author", "animator", "lektor", "gate"];
const eger = [{ url: "https://pelda.hu/eger", title: "Eger", text: "Dobó István 1552-ben megvédte Egert." }];
/** A fake one-step manufacture: visits the real chain in the caller's workflow and publishes into the progress view. */
function fakeStudio(lesson: { lessonId: string; htmlFileId: string }, opts: { failFirst?: boolean } = {}) {
  const views = new Map<string, { phase: string; detail: string | null; error: string | null; lessonId: string | null; htmlFileId: string | null }>();
  const calls = { gather: 0, manufacture: 0, modes: [] as Array<string | undefined> };
  const deps = {
    gather: async () => { calls.gather++; return { downloaded: eger }; },
    manufacture: async (runId: string) => {
      calls.manufacture++;
      calls.modes.push(workflowMode());
      views.set(runId, { phase: "pedagogue", detail: null, error: null, lessonId: null, htmlFileId: null });
      for (const step of STUDIO_STEPS) {
        await workflowPhase(step);
        if (opts.failFirst && calls.manufacture === 1 && step === "lektor") throw new Error("Synthetic lektor outage");
      }
      views.set(runId, { phase: "done", detail: null, error: null, ...lesson });
    },
    read: async (runId: string) => views.get(runId) ?? null,
    sleep: async () => undefined,
  };
  return { deps, calls, views };
}
const studioJobs = (m: ReturnType<typeof memoryStore>, workflows: ReturnType<typeof memoryWorkflows>, deps: ReturnType<typeof fakeStudio>["deps"]) =>
  createResearchJobs(m.store, (i, o) => generateWebStudioLesson(i, o, deps), workflows.store, { mode: "webStudio" });

test("spec s7: Studio-átadás — egy webStudio futás valódi lépésekkel, a gyártás a webes workflow-ban, html_files-írás nélkül", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows();
  const lessonsRead: string[] = [];
  m.store.readStudioLesson = async (htmlFileId, lessonId) => { lessonsRead.push(`${htmlFileId}/${lessonId}`); return { title: "Eger ostroma 1552", classroom: 5 }; };
  const studio = fakeStudio({ lessonId: "lesson-9", htmlFileId: "html-9" });
  await studioJobs(m, workflows, studio.deps).start("studio-web", "owner", input);
  await until(() => ["done", "error"].includes(m.rows.get("studio-web")?.state ?? ""));
  const job = m.rows.get("studio-web")!;
  assert.equal(job.state, "done", job.error);
  assert.equal(job.materialId, "html-9"); assert.equal(job.lessonId, "lesson-9");
  assert.equal(job.studioRunId, "studio-web", "a haladásjelző a webes job azonosítóját használja");
  assert.equal(job.title, "Eger ostroma 1552"); assert.equal(job.classroom, 5);
  assert.equal(m.materials.size, 0, "a Studio már közzétette — nincs html_files-írás");
  assert.deepEqual(lessonsRead, ["html-9/lesson-9"]);
  assert.deepEqual(studio.calls.modes, ["webStudio"], "a gyártás a webes futás workflow-jában fut");
  assert.equal(workflows.records.size, 1, "egyetlen futás, nincs külön upload-futás");
  assert.equal(publicResearchJob(job).output, "studio");
  const view = workflows.records.get("studio-web")!.view;
  assert.equal(view.definition.mode, "webStudio");
  assert.equal(view.state, "done"); assert.deepEqual(view.result, { kind: "material", id: "html-9" });
  assert.deepEqual(view.visits.map(v => v.step), ["generate", ...STUDIO_STEPS, "readback"]);
  assert.equal(view.skillAudit?.outcome, "passed");
});
test("spec s7: Studio-átadás — megszakadt gyártás folytatható; a letöltés a futás checkpointjából jön, új keresés nélkül", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows();
  m.store.readStudioLesson = async () => ({ title: "Eger", classroom: 5 });
  const studio = fakeStudio({ lessonId: "lesson-7", htmlFileId: "html-7" }, { failFirst: true });
  const jobs = studioJobs(m, workflows, studio.deps);
  await jobs.start("studio-resume", "owner", input);
  await until(() => workflows.records.get("studio-resume")?.view.state === "error");
  assert.equal(workflows.records.get("studio-resume")!.view.visits.at(-1)!.step, "lektor", "a megállás a valódi lépésnél látszik");
  const failed = await jobs.read("studio-resume", "owner");
  assert.equal(failed!.studioRunId, "studio-resume"); assert.equal(failed!.canResume, true);
  await jobs.publish("studio-resume", "owner");
  assert.equal(m.rows.get("studio-resume")!.state, "done"); assert.equal(m.rows.get("studio-resume")!.materialId, "html-7");
  assert.equal(studio.calls.gather, 1, "a folytatás nem keresett újra");
  assert.equal(studio.calls.manufacture, 2);
  assert.equal(workflows.records.size, 1);
});
test("spec s7: Studio-átadás — a közzététel visszaolvasásának hibája nem ad kész jelzést", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows();
  m.store.readStudioLesson = async () => null;
  await studioJobs(m, workflows, fakeStudio({ lessonId: "lesson-5", htmlFileId: "html-5" }).deps).start("studio-unverified", "owner", input);
  await until(() => workflows.records.get("studio-unverified")?.view.state === "error");
  assert.equal(m.rows.get("studio-unverified")!.state, "error");
  assert.match(m.rows.get("studio-unverified")!.error!, /nem igazolható vissza/);
});
test("Codex (PR #128): a Studio-átadás kész jelzését bérletkapus írás menti; elvesztett bérletnél nincs kész jelzés", async () => {
  const fenced = memoryStore(); const workflows = memoryWorkflows(); const writes: string[] = [];
  fenced.store.readStudioLesson = async () => ({ title: "Eger", classroom: 5 });
  fenced.store.completeStudioLesson = async job => { writes.push(job.state); fenced.rows.set(job.id, structuredClone(job)); };
  await studioJobs(fenced, workflows, fakeStudio({ lessonId: "lesson-3", htmlFileId: "html-3" }).deps).start("studio-fenced", "owner", input);
  await until(() => ["done", "error"].includes(workflows.records.get("studio-fenced")?.view.state ?? ""));
  assert.deepEqual(writes, ["done"]); assert.equal(fenced.rows.get("studio-fenced")!.state, "done");
  assert.equal(workflows.records.get("studio-fenced")!.view.state, "done");

  const lost = memoryStore(); const lostWorkflows = memoryWorkflows();
  lost.store.readStudioLesson = async () => ({ title: "Eger", classroom: 5 });
  lost.store.completeStudioLesson = async () => { throw new Error("Elavult vagy lejárt végrehajtó nem menthet tananyagot."); };
  await studioJobs(lost, lostWorkflows, fakeStudio({ lessonId: "lesson-3", htmlFileId: "html-3" }).deps).start("studio-lost", "owner", input);
  await until(() => lostWorkflows.records.get("studio-lost")?.view.state === "error");
  assert.notEqual(lost.rows.get("studio-lost")!.state, "done");
});
test("spec s7: a régi, kettévágott (web módú) Studio-futás nem kínál folytatást; napló nélküli job nem publikálható workflow-tárolóval", async () => {
  const m = memoryStore(); const workflows = memoryWorkflows();
  m.store.readStudioLesson = async () => ({ title: "Eger", classroom: 5 });
  // An old split hand-off: a `web` run that ended in error with a saved studio run id.
  const legacy = createResearchJobs(m.store, async () => { throw new WebResearchFailure("Régi hiba"); }, workflows.store);
  await legacy.start("legacy-split", "owner", input);
  await until(() => workflows.records.get("legacy-split")?.view.state === "error");
  const row = m.rows.get("legacy-split")!; row.studioRunId = "run-old"; m.rows.set("legacy-split", row);
  const jobs = studioJobs(m, workflows, fakeStudio({ lessonId: "l", htmlFileId: "h" }).deps);
  assert.equal((await jobs.read("legacy-split", "owner"))!.canResume, false);
  await m.store.create({ id: "untracked", userId: "owner", input, state: "ready", stage: "", title: "", message: input.message, content: "", sources: [], diagnostics: [], createdAt: Date.now(), html: "<html></html>" });
  await assert.rejects(jobs.publish("untracked", "owner"), /nincs workflow-napló/);
  assert.equal(m.materials.size, 0);
});
test("spec s7: completeWebStudioJob — a hibán álló jobot újranyitja, kész jelzés után visszaolvas (Studio-panel/söprő folytatása)", async () => {
  const m = memoryStore();
  m.store.readStudioLesson = async () => ({ title: "Eger", classroom: 5 });
  await m.store.create({ id: "reopen", userId: "owner", input, state: "error", stage: "", title: "", message: input.message, content: "", sources: [], diagnostics: [], createdAt: Date.now(), error: "régi" });
  const job = (await m.store.read("reopen", "owner"))!;
  const result = await completeWebStudioJob(m.store, job, { kind: "studio", runId: "reopen", lessonId: "lesson-1", htmlFileId: "html-1", sources: [] });
  assert.deepEqual(result, { kind: "material", id: "html-1" });
  assert.equal(m.rows.get("reopen")!.state, "done"); assert.equal(m.rows.get("reopen")!.materialId, "html-1");
});
