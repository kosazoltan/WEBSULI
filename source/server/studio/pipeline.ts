import { createHash } from "node:crypto";

/**
 * The lesson pipeline as a pure state machine.
 *
 * Jobs live as `studio_jobs` rows and are polled by the client — the same pattern as
 * improveAsync.ts, and for the same reason: an in-memory job map loses every running
 * lesson when the server restarts.
 *
 * Transitions are kept here as a pure function so the two properties that cost money can
 * be tested exactly:
 *
 *  - the Author↔Lektor loop terminates after `MAX_AUTHOR_ROUNDS`, then a human decides;
 *  - identical work is recognised by hash and served from the previous row.
 */

export const STUDIO_STEPS = [
  "pedagogue",
  "author",
  "lektor",
  "gate",
  "done",
  "error",
] as const;

export type StudioStep = (typeof STUDIO_STEPS)[number];

/**
 * How many times the Author may be sent back to fix Lektor blockers.
 *
 * Two: past that the rounds stop converging and each one is another paid call over the
 * whole lesson, so the job stops and an admin looks at it.
 */
export const MAX_AUTHOR_ROUNDS = 2;

export function isTerminal(step: StudioStep): boolean {
  return step === "done" || step === "error";
}

export type TransitionInput = {
  step: StudioStep;
  /** Did the step itself run successfully (no timeout, parse error, provider failure)? */
  ok: boolean;
  /** How many Author retries have already been spent. */
  round: number;
  /** Lektor findings that must be fixed before publishing. */
  blockers?: number;
  /** Result of the deterministic gate (schema + coverage + render). */
  gatePassed?: boolean;
  error?: string;
};

export type Transition = {
  step: StudioStep;
  round: number;
  reason?: string;
};

/**
 * Decide where the job goes next.
 *
 * Fails closed: a step that did not run cleanly moves to `error` rather than carrying a
 * half-built lesson forward.
 */
export function nextStep(input: TransitionInput): Transition {
  const { step, ok, round } = input;

  if (!ok) {
    return { step: "error", round, reason: input.error ?? `A(z) "${step}" lépés hibára futott.` };
  }

  switch (step) {
    case "pedagogue":
      return { step: "author", round };

    case "author":
      return { step: "lektor", round };

    case "lektor": {
      if ((input.blockers ?? 0) === 0) return { step: "gate", round };
      if (round >= MAX_AUTHOR_ROUNDS) {
        return {
          step: "error",
          round,
          reason:
            `A lektor ${MAX_AUTHOR_ROUNDS} kör után is blokkolót talált — ` +
            `emberi döntés szükséges.`,
        };
      }
      return { step: "author", round: round + 1 };
    }

    case "gate": {
      if (input.gatePassed === false) {
        if (round >= MAX_AUTHOR_ROUNDS) {
          return { step: "error", round, reason: "A kapu a kör-limit után is elutasította a leckét." };
        }
        return { step: "author", round: round + 1 };
      }
      return { step: "done", round };
    }

    case "done":
    case "error":
      return { step, round };
  }
}

/** Stable JSON: object keys sorted, so serialisation order never changes the hash. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/**
 * Content-addressed key for one pipeline step.
 *
 * The round is part of the key: round 2 asks the Author to fix what the Lektor found, so
 * serving round 1's cached answer would turn the retry into a no-op and the loop into
 * theatre.
 */
export function computeStepHash(
  step: StudioStep,
  promptVersion: string,
  input: unknown,
  round = 0,
): string {
  return createHash("sha256")
    .update(step)
    .update("\u0000")
    .update(promptVersion)
    .update("\u0000")
    .update(String(round))
    .update("\u0000")
    .update(canonical(input))
    .digest("hex");
}
