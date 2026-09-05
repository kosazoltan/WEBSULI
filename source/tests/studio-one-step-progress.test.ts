import assert from "node:assert/strict";
import test from "node:test";

import {
  createRun,
  getRun,
  updateRun,
  pruneRuns,
  __resetRunsForTest,
} from "../server/studio/one-step-progress";
import { oneStepPhaseRows, ONE_STEP_PHASES } from "../shared/studio-ui";

/**
 * LS-6b (#165) — the one-step progress store and its client view-model. The
 * point: the teacher must SEE the machine working (OCR 3/10, extraction,
 * outline, writing, lektor), not stare at a dead spinner.
 */

test("store: create → update → get életciklus, ismeretlen runId = null", async () => {
  __resetRunsForTest();
  const id = createRun();
  const fresh = await getRun(id);
  assert.ok(fresh);
  assert.equal(fresh.phase, "indul");
  updateRun(id, { phase: "ocr", detail: "Kép átírása: 3/10" });
  const after = await getRun(id);
  assert.equal(after?.phase, "ocr");
  assert.equal(after?.detail, "Kép átírása: 3/10");
  assert.equal(await getRun("nincs-ilyen"), null);
});

test("store: lezárt (done/error) futás TTL után törlődik, futó nem", async () => {
  __resetRunsForTest();
  const doneId = createRun();
  const liveId = createRun();
  updateRun(doneId, { phase: "done" });
  updateRun(liveId, { phase: "author" });
  const past = Date.now() + 16 * 60 * 1000; // 16 perc múlva
  pruneRuns(past);
  assert.equal(await getRun(doneId), null, "kész futás kitakarítva");
  assert.ok(await getRun(liveId), "futó megmarad");
});

test("view-model: fázissorrend és állapotok (kész/aktív/hátralévő)", () => {
  const rows = oneStepPhaseRows({ phase: "author", detail: null, error: null });
  assert.equal(rows.length, ONE_STEP_PHASES.length);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.state]));
  assert.equal(byKey.ocr, "done");
  assert.equal(byKey.extract, "done");
  assert.equal(byKey.pedagogue, "done");
  assert.equal(byKey.author, "active");
  assert.equal(byKey.lektor, "pending");
});

test("view-model: hiba és parkolás explicit, magyar üzenettel", () => {
  const err = oneStepPhaseRows({ phase: "error", detail: null, error: "A modell nem válaszolt." });
  assert.ok(err.some((r) => r.state === "error"));
  const parked = oneStepPhaseRows({ phase: "parked", detail: "Vázlat kézi jóváhagyásra vár.", error: null });
  assert.ok(parked.some((r) => r.state === "parked"));
});
