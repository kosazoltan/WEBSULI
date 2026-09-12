import { teachingHtml } from "./helpers/teaching-html";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionFixture, compactFusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { lessonRepairSchema, parseLessonRepair } from "../shared/lesson-repair";
import { assertRepairCandidate, assertRepairFresh, repairHash, buildStructuredImprovement } from "../server/studio/structured-improvement";
import { hasHtmlLessonData, readHtmlLessonData } from "../shared/lesson-html-data";
import { verifyLessonMethodHtml } from "../server/improve/verify-lesson-method";
import { executeWorkflow, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";

const source = { subject: "matematika", classroom: 7, concepts: [{ localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] };
test("a tényleges fúziós javító a workflow lépéseit használja és jelöltet ad vissza", async () => {
  const { store } = memoryWorkflows(); const original = fusionFixture(); const e = standardFusionFixture().experience!;
  const view = await executeWorkflow(store, { id: "repair-flow", owner: "owner", mode: "repair" }, async () => {
    await workflowPhase("source"); let calls = 0;
    const result = await buildStructuredImprovement(original, source, async step => {
      if (step === "lektor") return { notes: [] };
      return calls++ === 0 ? original : { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
    });
    assert.ok(result.candidate.experience!.tasks.length);
    await workflowPhase("save"); await workflowPhase("readback");
    return { kind: "candidate", id: "verified-candidate" };
  });
  assert.equal(view.state, "ready");
  assert.deepEqual(view.visits.map(v => v.step), ["source", "author", "banks", "lektor", "gate", "save", "readback"]);
});
test("repair checks teaching before spending on banks, retries concrete errors, and rejects lektor blockers", async () => {
  const original = fusionFixture(); const e = standardFusionFixture().experience!;
  const badTeaching = structuredClone(original); badTeaching.sections[0].blocks.shift();
  let stoppedCalls = 0;
  await assert.rejects(buildStructuredImprovement(original, source, async () => { stoppedCalls++; return badTeaching; }), /bankgyártás nem indult/);
  assert.equal(stoppedCalls, 2);
  const parts = [{ methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] }];
  let calls = 0;
  await assert.rejects(buildStructuredImprovement(original, source, async (step, _system, user) => {
    const index = calls++;
    if (index === 0) return badTeaching;
    if (index === 1) { assert.match(user, /Ellenőrzési hibák/); return original; }
    if (step === "lektor") return { notes: [{ kind: "source_conflict", subkind: "contradicts_source", message: "A minta hibás." }] };
    return parts[index - 2];
  }), /lektor javítást kér/);
  assert.equal(calls, 4); // Two teaching calls, one current-version packet, one lektor.
  assert.equal(original.experience!.tasks.length, 45);
});
function htmlDocument() {
  const data = { classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "matematika", experience: fusionFixture().experience };
  return `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id = "websuli-lesson-data">${JSON.stringify(data)}</script><script>(function(){const data=JSON.parse(document.getElementById('websuli-lesson-data').textContent);window.bankCount=data.experience.quiz.length;})();</script></body></html>`;
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
  // The common module owns reading/rendering; author-written executable JavaScript is optional.
  assert.equal(verifyLessonMethodHtml(html.replace(/<script>[^]*?<\/script>/, '')).ok, true);
  const bank = readHtmlLessonData(html); bank.experience.tasks[0].sample = "hibás válasz";
  const broken = html.replace(/(<script type="application\/json"[^>]*>)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(bank)}$2`);
  assert.match(verifyLessonMethodHtml(broken).problems.join(" "), /mintaválasz/);
  bank.experience.quiz.pop();
  assert.equal(verifyLessonMethodHtml(html.replace(/(<script type="application\/json"[^>]*>)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(bank)}$2`)).ok, false);
});

test("HTML publication cannot bypass the 45/75 minimum with the old version", () => {
  const e = compactFusionFixture().experience!;
  const previous = { ...e, version: "fusion-7.4-2", tasks: e.tasks.slice(0, 2), quiz: e.quiz.slice(0, 2), bankPlan: { ...e.bankPlan!, taskRound: 2, quizRound: 2 } };
  const html = htmlDocument().replace(/(<script type="application\/json"[^>]*>)[\s\S]*?(<\/script>)/, `$1${JSON.stringify({ classroom: 7, classroomEvidence: "A háromszög alapból és magasságból számolt területe.", subject: "matematika", experience: previous })}$2`);
  assert.doesNotThrow(() => readHtmlLessonData(html));
  assert.match(verifyLessonMethodHtml(html).problems.join(" "), /Legalább 45 szöveges feladat és 75 kvízkérdés/);
});
