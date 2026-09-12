import assert from "node:assert/strict";
import test from "node:test";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { readHtmlLessonData } from "../shared/lesson-html-data";
import { applyWebBankPatch, repairWebLessonBank } from "../server/studio/web-bank-repair";
import { verifyLessonMethodHtml } from "../server/improve/verify-lesson-method";
import { teachingHtml } from "./helpers/teaching-html";

const data = () => ({ classroom: 7, classroomEvidence: "A háromszög alaphoz tartozó magassága és területképlete.", subject: "Matematika", experience: standardFusionFixture().experience! });
const htmlFor = (value: unknown) => `<!DOCTYPE html><html><body>${["teaching", "methods", "tasks", "quiz"].map(t => `<button data-lesson-tab="${t}">${t}</button><section data-lesson-panel="${t}">${t === "teaching" ? teachingHtml : ""}</section>`).join("")}<script type="application/json" id="websuli-lesson-data">${JSON.stringify(value)}</script><script>const data = JSON.parse(document.getElementById('websuli-lesson-data').textContent);</script></body></html>`;
const outsideBank = (html: string) => html.replace(/(<script type="application\/json" id="websuli-lesson-data">)[\s\S]*?(<\/script>)/, "$1$2");

test("missing cognitive method is added without regenerating teaching or existing questions", async () => {
  const original = data(); const missing = original.experience.methods.find(m => m.kind === "sorting")!;
  original.experience.methods = original.experience.methods.filter(m => m.id !== missing.id);
  const html = htmlFor(original); let calls = 0;
  const result = await repairWebLessonBank(html, { call: async (system, user) => {
    calls++; assert.match(system, /Törlés nincs/); assert.equal(JSON.parse(user).lessonHtml, html);
    assert.match(JSON.parse(user).problems, /sorting/);
    return { methods: [missing] };
  } });
  assert.equal(calls, 1); assert.equal(verifyLessonMethodHtml(result).ok, true);
  assert.equal(outsideBank(result), outsideBank(html));
  const e = readHtmlLessonData(result).experience;
  assert.deepEqual(e.methods.slice(0, -1), original.experience.methods);
  assert.deepEqual(e.tasks, original.experience.tasks); assert.deepEqual(e.quiz, original.experience.quiz);
});

test("patch cannot delete items, rewrite metadata or inject a second executable script", () => {
  const original = data(); const html = htmlFor(original);
  assert.throws(() => applyWebBankPatch(html, { experience: { version: "fusion-7.4-2" } }));
  assert.throws(() => applyWebBankPatch(html, { methods: [], classroom: 1 }));
  assert.throws(() => applyWebBankPatch(html, { methods: [] }), /Üres/);
  const update = { ...original.experience.methods[0], prompt: "</script><script>alert('bad')</script>" };
  const result = applyWebBankPatch(html, { methods: [update] });
  assert.equal(outsideBank(result), outsideBank(html));
  assert.equal(readHtmlLessonData(result).experience.methods[0].prompt, update.prompt);
  assert.equal((result.match(/<script\b/g) ?? []).length, 2);
  assert.throws(() => applyWebBankPatch(html, { methods: [update, update] }), /Ismétlődő/);
});

test("invalid repair stays rejected after two attempts and never changes teaching", async () => {
  const original = data(); original.experience.methods = original.experience.methods.filter(m => m.kind !== "gate");
  const html = htmlFor(original); let calls = 0;
  const result = await repairWebLessonBank(html, { call: async () => { calls++; return { methods: [] }; } });
  assert.equal(calls, 2); assert.equal(result, html); assert.equal(verifyLessonMethodHtml(result).ok, false);
});

test("coverage errors do not conceal sample errors from the same repair round", () => {
  const original = data(); original.experience.methods = original.experience.methods.filter(m => m.kind !== "gate");
  original.experience.tasks[0].sample = "Hibás válasz.";
  const check = verifyLessonMethodHtml(htmlFor(original));
  assert.match(check.problems.join("; "), /kapukérdés/);
  assert.match(check.problems.join("; "), /mintaválasz/);
});

test("no bank repair for valid output, malformed JSON or an HTML-only failure; abort cannot accept a patch", async () => {
  const good = htmlFor(data()); const never = async () => { throw new Error("must not call"); };
  assert.equal(await repairWebLessonBank(good, { call: never }), good);
  const malformed = good.replace('"experience":', '"experience":invalid');
  assert.equal(await repairWebLessonBank(malformed, { call: never }), malformed);
  const noTeaching = good.replace(teachingHtml, "");
  assert.equal(await repairWebLessonBank(noTeaching, { call: never }), noTeaching);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(repairWebLessonBank(good, { call: never, signal: controller.signal }));
});
