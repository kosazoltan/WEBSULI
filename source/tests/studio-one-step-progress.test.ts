import assert from "node:assert/strict";
import test from "node:test";

import {
  createRun,
  getRun,
  updateRun,
  pruneRuns,
  __resetRunsForTest,
} from "../server/studio/one-step-progress";
import { oneStepPhaseRows, ONE_STEP_PHASES, lessonCreationStages, lessonCreationStageLabel } from "../shared/studio-ui";

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

// Audit 2026-09-05 (szelet A): a kapu/publikálás látható fázis a tanárnak.
test("ONE_STEP_PHASES: a lektor után 'gate' (publikálási kapu) fázis áll", () => {
  const keys = ONE_STEP_PHASES.map((p) => p.key);
  assert.equal(keys[keys.indexOf("lektor") + 1], "gate");
  const rows = oneStepPhaseRows({ phase: "gate", detail: null, error: null });
  assert.equal(rows.find((r) => r.key === "lektor")?.state, "done");
  assert.equal(rows.find((r) => r.key === "gate")?.state, "active");
});

test("oneStepPhaseRows: done fázisnál minden sor done, a gate is", () => {
  const rows = oneStepPhaseRows({ phase: "done", detail: "A lecke elkészült.", error: null });
  assert.ok(rows.every((r) => r.state === "done"));
});

test("három emberi fázis: a tényleges készítési lépések ugyanazon gyártási szakaszban vannak", () => {
  for (const phase of ["pedagogue", "author", "animator"]) {
    const rows = lessonCreationStages({ phase, detail: null, error: null });
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(r => r.state), ["done", "active", "pending"]);
    assert.equal(lessonCreationStageLabel(phase), "Tananyag készítése");
  }
  assert.deepEqual(lessonCreationStages({ phase: "ocr", detail: "3/10", error: null }).map(r => r.state), ["active", "pending", "pending"]);
  assert.deepEqual(lessonCreationStages({ phase: "gate", detail: null, error: null }).map(r => r.state), ["done", "done", "active"]);
});

test("ismeretlen/hibás/parkoló fázis nem állítja hamisan késznek az előző lépéseket", () => {
  for (const phase of ["error", "parked", "unknown"]) {
    assert.ok(lessonCreationStages({ phase, detail: null, error: "Forráshiba" }).every(r => r.state === "pending"));
  }
  assert.ok(lessonCreationStages({ phase: "done", detail: null, error: null }).every(r => r.state === "done"));
});
