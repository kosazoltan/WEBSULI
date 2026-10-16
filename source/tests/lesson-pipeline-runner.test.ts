import assert from "node:assert/strict";
import test from "node:test";
import { draftSummaryOf, recordOneStepFailure } from "../server/studio/lesson-pipeline-routes";
import { lektorReportSchema } from "../server/studio/step-io";
import { fromMapBody } from "../server/studio/from-map-body";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { __resetRunsForTest, createRun, getRun, updateRun } from "../server/studio/one-step-progress";

test("one-step draft summary: saved unpublished teaching with its finished bank packets, nothing once published", () => {
  const lesson = standardFusionFixture();
  assert.deepEqual(draftSummaryOf({ lesson, experienceCheckpoint: { hash: "h", parts: { a: {}, b: {} } } }), { teachingSections: lesson.sections.length, savedBankPackets: 2 });
  assert.deepEqual(draftSummaryOf({ lesson }), { teachingSections: lesson.sections.length, savedBankPackets: 0 });
  assert.equal(draftSummaryOf({ lesson, htmlFileId: "published" }), null);
  assert.equal(draftSummaryOf({ lesson }, true), null, "a lessons-sor már publikált, a job-output még nem tudja");
  assert.equal(draftSummaryOf({ outline: {} }), null);
  assert.equal(draftSummaryOf(null), null);
});

test("a terminal one-step állapotot a generikus háttérhiba nem írja felül", async () => {
  __resetRunsForTest();
  const doneId = createRun();
  updateRun(doneId, { phase: "done", detail: "A lecke elkészült.", lessonId: "lesson-1" });
  recordOneStepFailure(doneId, new Error("readback-failed"));
  const done = await getRun(doneId);
  assert.equal(done?.phase, "done");
  assert.equal(done?.error, null);

  const parkedId = createRun();
  updateRun(parkedId, { phase: "parked", detail: "Forrásellenőrzés szükséges.", mapId: "map-1" });
  recordOneStepFailure(parkedId, new Error("readback-failed"));
  const parked = await getRun(parkedId);
  assert.equal(parked?.phase, "parked");
  assert.equal(parked?.error, null);
});

test("(q) fromMapBody: az üres törzs érvényes (a scope opcionális), a hiányos scope nem", () => {
  assert.equal(fromMapBody.safeParse({}).success, true, "üres body = térkép scope");
  assert.equal(fromMapBody.safeParse(undefined).success, true, "body nélkül is");
  assert.equal(fromMapBody.safeParse({ subject: "biológia", classroom: 7 }).success, true);
  assert.equal(fromMapBody.safeParse({ subject: "biológia" }).success, false, "fél scope nem elfogadható");
});

test("(m3) a lektor jelentése 45 önálló megoldással sem bukik és nem vág (U5/H49: a plafon 200, fölötte jelölt csonkolás)", () => {
  const solutions = Array.from({ length: 45 }, (_, i) => ({ task: `f${i}`, own: "1", lesson: "1", match: true }));
  const parsed = lektorReportSchema.safeParse({ solutions, notes: [] });
  assert.ok(parsed.success);
  assert.equal(parsed.data.solutions?.length, 45, "nincs néma 40-es vágás");
});
