import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { lessonRepairSchema, parseLessonRepair } from "../shared/lesson-repair";
import { assertRepairCandidate, assertRepairFresh, repairHash, buildStructuredImprovement } from "../server/studio/structured-improvement";
import { hasHtmlLessonData, readHtmlLessonData } from "../shared/lesson-html-data";
import { verifyLessonMethodHtml } from "../server/improve/verify-lesson-method";

const source = { subject: "matematika", classroom: 7, concepts: [{ localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] };
test("repair checks teaching before spending on banks, retries concrete errors, and rejects lektor blockers", async () => {
  const original = fusionFixture(); const e = original.experience!;
  const badTeaching = structuredClone(original); badTeaching.sections[0].blocks.shift();
  let stoppedCalls = 0;
  await assert.rejects(buildStructuredImprovement(original, source, async () => { stoppedCalls++; return badTeaching; }), /bankgyártás nem indult/);
  assert.equal(stoppedCalls, 2);
  const parts = [{ methods: e.methods, glossary: [] }, ...[0, 15, 30].map(i => ({ tasks: e.tasks.slice(i, i + 15) })), ...[0, 25, 50].map(i => ({ quiz: e.quiz.slice(i, i + 25) }))];
  let calls = 0;
  await assert.rejects(buildStructuredImprovement(original, source, async (step, _system, user) => {
    const index = calls++;
    if (index === 0) return badTeaching;
    if (index === 1) { assert.match(user, /Ellenőrzési hibák/); return original; }
    if (step === "lektor") return { notes: [{ kind: "source_conflict", subkind: "contradicts_source", message: "A minta hibás." }] };
    return parts[index - 2];
  }), /lektor javítást kér/);
  assert.equal(calls, 10);
  assert.equal(original.experience!.tasks.length, 45);
});
function htmlDocument() {
  const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "matematika", experience: fusionFixture().experience };
  return `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}"></section>`).join("")}<script type="application/json" id = "websuli-lesson-data">${JSON.stringify(data)}</script><script>(function(){const data=JSON.parse(document.getElementById('websuli-lesson-data').textContent);window.bankCount=data.experience.quiz.length;})();</script></body></html>`;
}
test("repair preserves source classification and rejects stale lesson/source before writing", () => {
  const lesson = fusionFixture();
  assert.doesNotThrow(() => assertRepairCandidate(lesson, lesson, source));
  for (const field of ["mapId", "subject", "classroom", "sourceOnly"] as const) {
    const candidate = { ...lesson, [field]: field === "classroom" ? 5 : field === "sourceOnly" ? false : "changed" };
    assert.throws(() => assertRepairCandidate(lesson, candidate as typeof lesson, source), /nem változtathatja/);
  }
  assert.throws(() => assertRepairCandidate(lesson, { ...lesson, experience: undefined }, source), /nem teljes/);
  const repair = lessonRepairSchema.parse({ kind: "lesson-repair-fusion-1", lessonId: "local-lesson", baseVersion: 2, baselineHash: repairHash(lesson), baselineMaterialHash: repairHash("metadata"), sourceHash: repairHash(source), previousLesson: lesson, candidate: lesson });
  const current = { id: "local-lesson", version: 2, json: lesson };
  assert.doesNotThrow(() => assertRepairFresh(repair, current, source, repairHash("metadata")));
  assert.throws(() => assertRepairFresh(repair, current, source, repairHash("edited metadata")), /megváltozott/);
  assert.throws(() => assertRepairFresh(repair, { ...current, version: 3 }, source, repairHash("metadata")), /megváltozott/);
  assert.throws(() => assertRepairFresh(repair, { ...current, json: { ...lesson, title: "Új cím" } }, source, repairHash("metadata")), /megváltozott/);
  assert.throws(() => assertRepairFresh(repair, current, { ...source, classroom: 8 }, repairHash("metadata")), /megváltozott/);
  assert.equal(parseLessonRepair("<html>helyőrző</html>"), null);
  assert.equal(parseLessonRepair(JSON.stringify(repair))?.candidate.experience?.quiz.length, 75);
  const reviewNotes = [{ kind: "source_conflict" as const, subkind: "book_probably_wrong", message: "A forrás egyik magassága nagyobb a másik oldalnál.", blockPath: "0.1" }];
  const audited = parseLessonRepair(JSON.stringify({ ...repair, reviewNotes }))!;
  assert.deepEqual(audited.reviewNotes, reviewNotes);
  assert.deepEqual(audited.candidate, lesson); // Audit notes must not rewrite the pupil's source.
});
test("HTML gate parses inert JSON and catches missing banks, invalid samples and disconnected UI", () => {
  const html = htmlDocument();
  assert.equal(hasHtmlLessonData(html), true);
  assert.equal(readHtmlLessonData(html).classroom, 7);
  assert.deepEqual(verifyLessonMethodHtml(html), { ok: true, problems: [] });
  assert.equal(verifyLessonMethodHtml(html.replace('data-lesson-tab="quiz"', 'data-missing="quiz"')).ok, false);
  assert.equal(verifyLessonMethodHtml(html.replace('JSON.parse', 'JSON.stringify')).ok, false);
  const bank = readHtmlLessonData(html); bank.experience.tasks[0].sample = "hibás válasz";
  const broken = html.replace(/(<script type="application\/json"[^>]*>)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(bank)}$2`);
  assert.match(verifyLessonMethodHtml(broken).problems.join(" "), /mintaválasz/);
  bank.experience.quiz.pop();
  assert.equal(verifyLessonMethodHtml(html.replace(/(<script type="application\/json"[^>]*>)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(bank)}$2`)).ok, false);
});
