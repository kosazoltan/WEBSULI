import assert from "node:assert/strict";
import test from "node:test";

import { toggleCamera, escAction, type PlayPhase, type CameraMode } from "../client/src/lib/tornado/controls";

/**
 * Audit #5/#7 — C toggles the camera; Esc pauses during a run, exits only
 * from a result screen or from an already-paused overlay.
 */

test("toggleCamera chase ↔ cockpit", () => {
  assert.equal(toggleCamera("chase"), "cockpit");
  assert.equal(toggleCamera("cockpit"), "chase");
});

test("Esc seeking/approach/quiz közben pause, nem exit", () => {
  for (const phase of ["seeking", "approach", "quiz"] as PlayPhase[]) {
    assert.equal(escAction(phase), "pause", `${phase}: pause kell`);
  }
});

test("Esc paused állapotból kilép", () => {
  assert.equal(escAction("paused"), "exit");
});

test("Esc eredményképernyőn kilép", () => {
  assert.equal(escAction("result_win"), "exit");
  assert.equal(escAction("result_lose"), "exit");
});

test("ismeretlen fázis = noop", () => {
  assert.equal(escAction("menu" as PlayPhase), "noop");
});

void (null as unknown as CameraMode);
