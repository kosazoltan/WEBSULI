import assert from "node:assert/strict";
import test from "node:test";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { experienceSchema } from "../shared/lesson-experience";
import { applyBankPacketRepair, buildLessonExperience } from "../server/studio/experience-builder";

test("bank diagnostics identify every invalid item, field, ID and permitted unit", () => {
  const e = standardFusionFixture().experience!;
  e.methods[0].sectionIndex = 7;
  e.tasks[1].coversConceptIds = ["area", "foreign"];
  e.quiz[2].coversConceptIds = ["foreign"];
  const result = experienceSchema.safeParse(e);
  assert.equal(result.success, false);
  if (result.success) return;
  for (const [bank, index, field] of [["methods", 0, "sectionIndex"], ["tasks", 1, "coversConceptIds"], ["quiz", 2, "coversConceptIds"]] as const) {
    const issue = result.error.issues.find(i => i.path.join(".") === `${bank}.${index}.${field}`);
    assert.ok(issue, `${bank}.${index}.${field} diagnostic missing`);
    assert.ok(issue.message.includes(e[bank][index].id));
    assert.match(issue.message, /Bankterven kívüli tétel/);
    assert.match(issue.message, /area/);
  }
});

test("two units in one section remain valid, but a cross-unit item is rejected", () => {
  const e = standardFusionFixture().experience!;
  e.bankPlan!.units.push({ sectionIndex: 0, conceptIds: ["perimeter"] });
  e.methods.push(...e.methods.map(m => ({ ...m, id: `${m.id}-p`, prompt: `Más fogalom: ${m.prompt}`, coversConceptIds: ["perimeter"] })));
  e.tasks.push(...e.tasks.map(t => ({ ...t, id: `${t.id}-p`, q: `Más fogalom: ${t.q}`, coversConceptIds: ["perimeter"] })));
  e.quiz.push(...e.quiz.map(q => ({ ...q, id: `${q.id}-p`, question: `Más fogalom: ${q.question}`, coversConceptIds: ["perimeter"] })));
  assert.equal(experienceSchema.safeParse(e).success, true);
  e.tasks[0].coversConceptIds = ["area", "perimeter"];
  const invalid = experienceSchema.safeParse(e);
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.ok(invalid.error.issues.some(i => i.path.join(".") === "tasks.0.coversConceptIds"));
});

test("builder sends the precise binding error and preserves untouched items during repair", async () => {
  const lesson = standardFusionFixture(), original = lesson.experience!;
  const bad = structuredClone(original);
  bad.tasks[1].coversConceptIds = ["area", "foreign"];
  bad.tasks[1].q = "Mi a csomagon kívüli fogalom?";
  bad.tasks[1].required = [["idegen"]];
  bad.tasks[1].sample = "Ez az idegen fogalom a csomagon kívül van.";
  let calls = 0;
  const result = await buildLessonExperience(lesson, [{ localId: "area", examWeight: "core" }], {
    call: async (_system, user) => {
      if (++calls === 1) return bad;
      assert.match(user, /tasks\.1\.coversConceptIds/);
      assert.ok(user.includes(bad.tasks[1].id));
      assert.match(user, /foreign/);
      assert.match(user, /JAVÍTÁSI MÓD/);
      return { tasks: [original.tasks[1]] };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.tasks.length, original.tasks.length);
  assert.equal(result.quiz.length, original.quiz.length);
  assert.deepEqual(result.tasks.map(t => t.q), original.tasks.map(t => t.q));
  assert.equal(experienceSchema.safeParse(result).success, true);
});

test("binding repair permission cannot weaken another rubric or widen reviewer scope", () => {
  const packet = standardFusionFixture().experience!;
  const changed = { ...packet.tasks[1], required: [["different"]] };
  assert.throws(() => applyBankPacketRepair(packet, { tasks: [changed] }, undefined, new Set([packet.tasks[0].id])), /nem törölhet/);
  assert.throws(() => applyBankPacketRepair(packet, { tasks: [changed] }, new Set([packet.tasks[0].id]), new Set([changed.id])), /nem érintett/);
});