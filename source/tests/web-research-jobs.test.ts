import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { compactFusionFixture } from "../shared/fixtures/lesson-fusion";
import { verifyLessonMethodHtml } from "../server/improve/verify-lesson-method";
import { createResearchJobs, checkedResearchArtifact, publicResearchJob, type ResearchJobStore, type StoredResearchJob } from "../server/studio/web-research-jobs";
import { WebResearchFailure } from "../server/studio/web-research-runner";
import { memoryWorkflows } from "./helpers/workflow-store";

const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "Matematika", experience: compactFusionFixture().experience };
const htmlFor = (value: unknown) => `<!DOCTYPE html><html><body><a href="https://www.oktatas.hu">Forrás</a>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}"></section>`).join("")}<script type="application/json" id="websuli-lesson-data">${JSON.stringify(value)}</script><script>const data = JSON.parse(document.getElementById('websuli-lesson-data').textContent);</script></body></html>`;
const artifact = { html: htmlFor(data), sources: [{ url: "https://www.oktatas.hu", title: "Tanterv" }] };
const input = { message: "Készíts tananyagot", classroom: 4 };
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
      checkedResearchArtifact({ html: job.html!, sources: job.sources });
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
  assert.equal(view.state, "done"); assert.deepEqual(view.visits.map(v => v.step), ["generate", "gate", "publish", "readback"]);
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
