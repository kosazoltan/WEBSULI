import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_AUTHOR_ROUNDS,
  MAX_CHAIN_STEPS,
  STUDIO_STEPS,
  type StudioStep,
  computeStepHash,
  nextStep,
  isTerminal,
} from "../server/studio/pipeline";

/**
 * LS-2 — the pipeline state machine.
 *
 * Every step is a paid model call, so two properties are not optional:
 *
 *  - the Author↔Lektor loop terminates. Two rounds, then a human decides. An unbounded
 *    "fix it and check again" cycle burns real money and, past the second round, stops
 *    improving anything.
 *  - re-running an identical step returns the cached row instead of paying twice.
 *
 * The transition function is pure and lives apart from the DB so both can be checked
 * without a database or a network.
 */

test("the declared steps match the planned pipeline", () => {
  // LS-4 (spec: master plan §4/§6 flow): the animator step sits between author and
  // lektor — this list is the documented spec change for the slice.
  assert.deepEqual(STUDIO_STEPS, [
    "pedagogue",
    "author",
    "animator",
    "lektor",
    "gate",
    "done",
    "error",
  ]);
});

test("the happy path runs pedagogue -> author -> animator -> lektor -> gate -> done", () => {
  assert.equal(nextStep({ step: "pedagogue", ok: true, round: 0 }).step, "author");
  assert.equal(nextStep({ step: "author", ok: true, round: 0 }).step, "animator");
  assert.equal(nextStep({ step: "animator", ok: true, round: 0 }).step, "lektor");
  assert.equal(nextStep({ step: "lektor", ok: true, round: 0, blockers: 0 }).step, "gate");
  assert.equal(nextStep({ step: "gate", ok: true, round: 0 }).step, "done");
});

test("blockers send the lesson back to the author and count a round", () => {
  const r = nextStep({ step: "lektor", ok: true, round: 0, blockers: 3 });
  assert.equal(r.step, "author");
  assert.equal(r.round, 1, "the retry is counted");
});

test("the SECOND round of blockers is still allowed", () => {
  const r = nextStep({ step: "lektor", ok: true, round: 1, blockers: 1 });
  assert.equal(r.step, "author");
  assert.equal(r.round, 2);
});

test("a THIRD round is refused — the job errors instead of looping", () => {
  const r = nextStep({ step: "lektor", ok: true, round: MAX_AUTHOR_ROUNDS, blockers: 1 });
  assert.equal(r.step, "error");
  assert.match(r.reason ?? "", /kör/i);
});

test("a failed step goes to error, never silently onward", () => {
  for (const step of ["pedagogue", "author", "animator", "lektor", "gate"] as const) {
    const r = nextStep({ step, ok: false, round: 0, error: "timeout" });
    assert.equal(r.step, "error", `${step} must fail closed`);
  }
});

test("a failed gate does NOT consume an author round", () => {
  // The gate is deterministic (schema/coverage/render). Its failure means the lesson is
  // wrong, so the Author gets to try — but a render hiccup must not eat the budget.
  const r = nextStep({ step: "gate", ok: true, round: 0, gatePassed: false });
  assert.equal(r.step, "author");
  assert.equal(r.round, 1);
});

test("MAX_CHAIN_STEPS covers the worst legal walk: lektor blockers every round, then a human (#177)", () => {
  // Measured live (2026-09-05, job fd62b66a): drive() capped the chain at 8 steps while
  // round 2 was still legal, so the job died with a fake "lépés-határ" error instead of
  // the designed "N kör után emberi döntés" terminal. The safety net must be derived
  // from MAX_AUTHOR_ROUNDS, never a hand-picked constant below the legal maximum.
  let state: { step: StudioStep; round: number } = { step: "pedagogue", round: 0 };
  let steps = 0;
  while (!isTerminal(state.step)) {
    steps++;
    assert.ok(steps <= MAX_CHAIN_STEPS, `walk exceeded MAX_CHAIN_STEPS=${MAX_CHAIN_STEPS} at step ${steps} (${state.step})`);
    state = nextStep({ step: state.step, ok: true, round: state.round, blockers: 1, gatePassed: false });
  }
  assert.equal(state.step, "error");
  assert.match((state as { reason?: string }).reason ?? "", /kör/i, "the designed terminal, not the safety net");
});

test("MAX_CHAIN_STEPS also covers a gate that fails on every round", () => {
  let state: { step: StudioStep; round: number } = { step: "pedagogue", round: 0 };
  let steps = 0;
  while (!isTerminal(state.step)) {
    steps++;
    assert.ok(steps <= MAX_CHAIN_STEPS, `gate-fail walk exceeded the bound at ${state.step}`);
    state = nextStep({ step: state.step, ok: true, round: state.round, blockers: 0, gatePassed: false });
  }
  assert.equal(state.step, "error");
});

test("done and error are terminal", () => {
  assert.equal(isTerminal("done"), true);
  assert.equal(isTerminal("error"), true);
  assert.equal(isTerminal("author"), false);
});

test("computeStepHash is stable for the same step, prompt version and input", () => {
  const input = { mapId: "km-1", concepts: ["c1", "c2"] };
  assert.equal(
    computeStepHash("author", "v1", input),
    computeStepHash("author", "v1", input),
  );
});

test("computeStepHash changes with the step, the prompt version, or the input", () => {
  const input = { mapId: "km-1", concepts: ["c1"] };
  const base = computeStepHash("author", "v1", input);
  assert.notEqual(base, computeStepHash("lektor", "v1", input));
  assert.notEqual(base, computeStepHash("author", "v2", input), "a new prompt is new work");
  assert.notEqual(base, computeStepHash("author", "v1", { ...input, concepts: ["c2"] }));
});

test("computeStepHash ignores key order in the input object", () => {
  // The same request serialised differently is the same request.
  assert.equal(
    computeStepHash("author", "v1", { a: 1, b: 2 }),
    computeStepHash("author", "v1", { b: 2, a: 1 }),
  );
});

test("computeStepHash separates the round, so a retry is not served from cache", () => {
  // Round 2 asks the Author to fix what the Lektor found; returning round 1's cached
  // answer would make the retry a no-op and the loop pointless.
  assert.notEqual(
    computeStepHash("author", "v1", { mapId: "km-1" }, 1),
    computeStepHash("author", "v1", { mapId: "km-1" }, 2),
  );
});
