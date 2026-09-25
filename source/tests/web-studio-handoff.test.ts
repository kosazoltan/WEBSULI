import assert from "node:assert/strict";
import test from "node:test";
import { generateWebStudioLesson, MAX_SOURCE_CHARS, MAX_TOTAL_CHARS, webSourcesToOneStepFiles, type StudioRunView, type WebStudioDeps } from "../server/studio/web-studio-handoff";
import { WebResearchFailure, type ResearchObserver } from "../server/studio/web-research-runner";
import type { OneStepRequest } from "../server/studio/one-step";
import type { WebResearchEvent } from "../server/studio/web-research-agent";

/* Spec 2026-09-25 (docs/specs/2026-09-25-webes-studio-atadas.md): the internet path hands its downloaded pages to the one-step Studio manufacture. */

const page = (n: number, text = `Egervár ostroma ${n}. forrásrész: a vár védői 1552-ben kitartottak.`) =>
  ({ url: `https://pelda.hu/egervar/${n}`, title: `Egervár ${n}`, text });
const input = { message: "Készíts tananyagot Eger 1552-es ostromáról 5. osztályosoknak", classroom: 5, title: "Eger ostroma" };

function harness(views: Array<StudioRunView | null>, over: Partial<WebStudioDeps> = {}) {
  const started: Array<{ data: OneStepRequest; userId: string }> = [];
  const events: WebResearchEvent[] = [];
  const reads: string[] = [];
  const saved: string[] = [];
  const deps: WebStudioDeps = {
    gather: async () => ({ downloaded: [page(1), page(2)] }),
    start: (data, userId) => { started.push({ data, userId }); return "run-1"; },
    read: async (runId) => { reads.push(runId); return views.length > 1 ? views.shift()! : views[0]; },
    sleep: async () => undefined,
    ...over,
  };
  const observer: ResearchObserver = { userId: "teacher", onEvent: e => events.push(e), async onStudioRun(runId) { saved.push(runId); } };
  return { deps, observer, started, events, reads, saved };
}
const running = (phase: string, detail: string | null = null): StudioRunView => ({ phase, detail, error: null, lessonId: null, htmlFileId: null });
const done: StudioRunView = { phase: "done", detail: null, error: null, lessonId: "lesson-1", htmlFileId: "html-1" };

test("a letöltött oldalak URL-fejléccel, mérethatáron belül, szöveges forrásként mennek át; az üres oldal kimarad", () => {
  const files = webSourcesToOneStepFiles([page(1), page(2, "   "), page(3, "x".repeat(MAX_SOURCE_CHARS * 2))]);
  assert.equal(files.length, 2);
  assert.ok(files.every(f => f.kind === "text"));
  assert.match(files[0].content, /^Forrás: https:\/\/pelda\.hu\/egervar\/1\nCím: Egervár 1\n\nEgervár ostroma 1\./);
  assert.equal(files[1].content.length, MAX_SOURCE_CHARS);
  assert.equal(new Set(files.map(f => f.name)).size, files.length);
  const many = webSourcesToOneStepFiles(Array.from({ length: 8 }, (_, i) => page(i, "y".repeat(MAX_SOURCE_CHARS))));
  assert.ok(many.reduce((sum, f) => sum + f.content.length, 0) <= MAX_TOTAL_CHARS);
  assert.ok(many.length < 8, "az összkeret a további oldalakat levágja");
});

test("új futás: a tanár kérése és a források a Studio-gyártáshoz kerülnek; a kész lecke az eredmény", async () => {
  const h = harness([running("ocr", "Tantárgy és osztály felismerése…"), running("lektor"), done]);
  const artifact = await generateWebStudioLesson(input, h.observer, h.deps);
  assert.deepEqual(artifact, { kind: "studio", runId: "run-1", lessonId: "lesson-1", htmlFileId: "html-1", sources: [page(1), page(2)].map(({ url, title }) => ({ url, title })) });
  assert.equal(h.started.length, 1);
  assert.equal(h.started[0].userId, "teacher");
  assert.equal(h.started[0].data.instructions, input.message);
  assert.equal(h.started[0].data.title, "Eger ostroma");
  assert.equal(h.started[0].data.files.length, 2);
  assert.deepEqual(h.saved, ["run-1"]);
  const statuses = h.events.filter(e => e.type === "status").map(e => (e as { message: string }).message);
  assert.ok(statuses.some(s => s.includes("tantárgy és évfolyam felismerése — Tantárgy és osztály felismerése…")));
  assert.ok(statuses.some(s => s.includes("tartalmi lektorálás")));
});

test("a Studio hibája és parkolása a webes futás érthető hibája", async () => {
  const failed = harness([running("author"), { phase: "error", detail: null, error: "A kivonatolás nem sikerült.", lessonId: null, htmlFileId: null }]);
  await assert.rejects(generateWebStudioLesson(input, failed.observer, failed.deps), (e: unknown) => e instanceof WebResearchFailure && /hibával megállt: A kivonatolás nem sikerült/.test(e.message));
  const parked = harness([{ phase: "parked", detail: "Forrásellenőrzés szükséges.", error: null, lessonId: null, htmlFileId: null }]);
  await assert.rejects(generateWebStudioLesson(input, parked.observer, parked.deps), /forrásellenőrzésre vár: Forrásellenőrzés szükséges/);
  const lost = harness([null]);
  await assert.rejects(generateWebStudioLesson(input, lost.observer, lost.deps), /nem olvasható vissza/);
  const slow = harness([running("author")], { maxWaitMs: -1 });
  await assert.rejects(generateWebStudioLesson(input, slow.observer, slow.deps), /120 percen belül/);
});

test("folytatás: élő vagy kész mentett futást követ, újat nem indít; hibás helyett újat indít", async () => {
  const alive = harness([running("animator"), done]);
  alive.observer.studioRunId = "run-0";
  assert.equal((await generateWebStudioLesson(input, alive.observer, alive.deps)).runId, "run-0");
  assert.equal(alive.started.length, 0);
  assert.ok(alive.reads.every(id => id === "run-0"));
  const failedBefore = harness([{ phase: "error", detail: null, error: "régi hiba", lessonId: null, htmlFileId: null }, done]);
  failedBefore.observer.studioRunId = "run-0";
  assert.equal((await generateWebStudioLesson(input, failedBefore.observer, failedBefore.deps)).runId, "run-1");
  assert.equal(failedBefore.started.length, 1);
});

test("üres letöltés vagy hitelesítetlen készítő esetén nem indul Studio-futás", async () => {
  const empty = harness([done], { gather: async () => ({ downloaded: [page(1, " ")] }) });
  await assert.rejects(generateWebStudioLesson(input, empty.observer, empty.deps), /nem maradt feldolgozható szöveg/);
  const anonymous = harness([done]);
  anonymous.observer.userId = undefined;
  await assert.rejects(generateWebStudioLesson(input, anonymous.observer, anonymous.deps), /hitelesített készítő/);
  assert.equal(empty.started.length + anonymous.started.length, 0);
});
