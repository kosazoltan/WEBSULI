import assert from "node:assert/strict";
import test from "node:test";
import { generateWebStudioLesson, MAX_SOURCE_CHARS, MAX_TOTAL_CHARS, webSourcesToOneStepFiles, type StudioRunView, type WebStudioDeps } from "../server/studio/web-studio-handoff";
import { WebResearchFailure, type ResearchObserver } from "../server/studio/web-research-runner";
import type { OneStepRequest } from "../server/studio/one-step";
import type { WebResearchEvent } from "../server/studio/web-research-agent";

/* Spec 2026-09-25 (docs/specs/2026-09-25-webes-studio-atadas.md): the internet path hands its downloaded pages to the one-step Studio manufacture.
 * Spec-változás 2026-10-06-s7 (§4/7): a gyártás a hívó (webes) workflow-jában fut (`manufacture`), a haladásjelző a webes job
 * azonosítóját használja; nincs külön indított futás és nincs 120 perces követési határidő (a gyártás ugyanabban a futásban megy). */

const page = (n: number, text = `Egervár ostroma ${n}. forrásrész: a vár védői 1552-ben kitartottak.`) =>
  ({ url: `https://pelda.hu/egervar/${n}`, title: `Egervár ${n}`, text });
const input = { message: "Készíts tananyagot Eger 1552-es ostromáról 5. osztályosoknak", classroom: 5, title: "Eger ostroma" };

/** `views`: what the progress record shows while manufacturing (polled) and after it (the last element). */
function harness(views: Array<StudioRunView | null>, over: Partial<WebStudioDeps> = {}) {
  const manufactured: Array<{ runId: string; data: OneStepRequest; userId: string }> = [];
  const events: WebResearchEvent[] = [];
  const reads: string[] = [];
  const saved: string[] = [];
  let released = false;
  const deps: WebStudioDeps = {
    gather: async () => ({ downloaded: [page(1), page(2)] }),
    // The manufacture finishes after the progress record has been polled through the running views.
    manufacture: async (runId, data, userId) => { manufactured.push({ runId, data, userId }); while (!released) await new Promise((r) => setTimeout(r, 1)); },
    read: async (runId) => { reads.push(runId); if (views.length <= 1) released = true; return views.length > 1 ? views.shift()! : views[0]; },
    sleep: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    ...over,
  };
  const observer: ResearchObserver = { userId: "teacher", jobId: "job-1", onEvent: e => events.push(e), async onStudioRun(runId) { saved.push(runId); } };
  return { deps, observer, manufactured, events, reads, saved };
}
const running = (phase: string, detail: string | null = null): StudioRunView => ({ phase, detail, error: null, lessonId: null, htmlFileId: null });
const done: StudioRunView = { phase: "done", detail: null, error: null, lessonId: "lesson-1", htmlFileId: "html-1" };

test("a letöltött oldalak URL-fejléccel, mérethatáron belül, szöveges forrásként mennek át; az üres oldal kimarad", () => {
  const { files, sources } = webSourcesToOneStepFiles([page(1), page(2, "   "), page(3, "x".repeat(MAX_SOURCE_CHARS * 2))]);
  assert.equal(files.length, 2);
  // Codex (PR #128): only the pages actually handed over count as used sources.
  assert.deepEqual(sources.map(s => s.url), [page(1).url, page(3).url]);
  assert.ok(files.every(f => f.kind === "text"));
  assert.match(files[0].content, /^Forrás: https:\/\/pelda\.hu\/egervar\/1\nCím: Egervár 1\n\nEgervár ostroma 1\./);
  assert.equal(files[1].content.length, MAX_SOURCE_CHARS);
  assert.equal(new Set(files.map(f => f.name)).size, files.length);
  const many = webSourcesToOneStepFiles(Array.from({ length: 8 }, (_, i) => page(i, "y".repeat(MAX_SOURCE_CHARS))));
  assert.ok(many.files.reduce((sum, f) => sum + f.content.length, 0) <= MAX_TOTAL_CHARS);
  assert.ok(many.files.length < 8, "az összkeret a további oldalakat levágja");
  assert.equal(many.sources.length, many.files.length, "a levágott oldal nem felhasznált forrás");
  // Copilot (PR #128): with a small budget left, a short page that fits whole still goes; a sliver cut does not.
  const header = (n: number) => `Forrás: ${page(n).url}\nCím: ${page(n).title}\n\n`.length;
  const leftover = 1_500; // below the 2000-char minimum for a cut page
  const tight = webSourcesToOneStepFiles([
    ...Array.from({ length: 3 }, (_, i) => page(10 + i, "z".repeat(MAX_SOURCE_CHARS))),
    page(20, "w".repeat(MAX_TOTAL_CHARS - 3 * MAX_SOURCE_CHARS - leftover - header(20))),
    page(21, "v".repeat(MAX_SOURCE_CHARS)),
    page(22, "Rövid, de teljes forrásoldal."),
  ]);
  assert.ok(tight.files.reduce((sum, f) => sum + f.content.length, 0) <= MAX_TOTAL_CHARS);
  assert.ok(!tight.sources.some(s => s.url === page(21).url), "szilánkra vágott oldal kimarad");
  assert.ok(tight.sources.some(s => s.url === page(22).url), "a keretbe teljesen beleférő rövid oldal bekerül");
});

test("új futás: a tanár kérése és a források a hívó futásában futó Studio-gyártáshoz kerülnek; a kész lecke az eredmény", async () => {
  const h = harness([running("ocr", "Tantárgy és osztály felismerése…"), running("lektor"), done]);
  const artifact = await generateWebStudioLesson(input, h.observer, h.deps);
  assert.deepEqual(artifact, { kind: "studio", runId: "job-1", lessonId: "lesson-1", htmlFileId: "html-1", sources: [page(1), page(2)].map(({ url, title }) => ({ url, title })) });
  assert.equal(h.manufactured.length, 1);
  assert.equal(h.manufactured[0].runId, "job-1", "a haladásjelző a webes job azonosítója");
  assert.equal(h.manufactured[0].userId, "teacher");
  assert.equal(h.manufactured[0].data.instructions, input.message);
  assert.equal(h.manufactured[0].data.title, "Eger ostroma");
  assert.equal(h.manufactured[0].data.files.length, 2);
  assert.deepEqual(h.saved, ["job-1"]);
  assert.ok(h.reads.every(id => id === "job-1"));
  const statuses = h.events.filter(e => e.type === "status").map(e => (e as { message: string }).message);
  assert.ok(statuses.some(s => s.includes("tantárgy és évfolyam felismerése — Tantárgy és osztály felismerése…")));
  assert.ok(statuses.some(s => s.includes("tartalmi lektorálás")));
});

test("a Studio hibája, parkolása és a gyártás kivétele a webes futás érthető hibája", async () => {
  const failed = harness([running("author"), { phase: "error", detail: null, error: "A kivonatolás nem sikerült.", lessonId: null, htmlFileId: null }]);
  await assert.rejects(generateWebStudioLesson(input, failed.observer, failed.deps), (e: unknown) => e instanceof WebResearchFailure && /hibával megállt: A kivonatolás nem sikerült/.test(e.message));
  const parked = harness([{ phase: "parked", detail: "Forrásellenőrzés szükséges.", error: null, lessonId: null, htmlFileId: null }]);
  await assert.rejects(generateWebStudioLesson(input, parked.observer, parked.deps), /forrásellenőrzésre vár: Forrásellenőrzés szükséges/);
  const lost = harness([null]);
  await assert.rejects(generateWebStudioLesson(input, lost.observer, lost.deps), /nem olvasható vissza/);
  const thrown = harness([running("author")], { manufacture: async () => { throw new Error("Elavult vagy lejárt végrehajtó nem menthet tananyagot."); } });
  await assert.rejects(generateWebStudioLesson(input, thrown.observer, thrown.deps), /Elavult vagy lejárt végrehajtó/, "a gyártás kivétele (pl. lízingvesztés) változatlanul továbbmegy");
  const unfinished = harness([running("gate")], { manufacture: async () => undefined });
  await assert.rejects(generateWebStudioLesson(input, unfinished.observer, unfinished.deps), /nem adott közzétett leckét/);
});

test("üres letöltés, hitelesítetlen készítő vagy hiányzó futásazonosító esetén nincs gyártás", async () => {
  const empty = harness([done], { gather: async () => ({ downloaded: [page(1, " ")] }) });
  await assert.rejects(generateWebStudioLesson(input, empty.observer, empty.deps), /nem maradt feldolgozható szöveg/);
  let gathered = 0;
  const anonymous = harness([done], { gather: async () => { gathered++; return { downloaded: [page(1)] }; } });
  anonymous.observer.userId = undefined;
  await assert.rejects(generateWebStudioLesson(input, anonymous.observer, anonymous.deps), /hitelesített készítő/);
  assert.equal(gathered, 0, "hitelesítetlen kérésre fizetős keresés sem indul");
  const noJob = harness([done]);
  noJob.observer.jobId = undefined;
  await assert.rejects(generateWebStudioLesson(input, noJob.observer, noJob.deps), /futás azonosítója/);
  assert.equal(empty.manufactured.length + anonymous.manufactured.length + noJob.manufactured.length, 0);
});
