import { stripJsonFences } from "../ai/OpenRouterProvider";
import type { AIResponse, IAIProvider } from "../ai/AIProvider";
import type { StudioStep } from "./pipeline";

/**
 * LS-2c — the call layer between the pipeline state machine and the provider.
 *
 * Deliberately narrow: it sends one prompt pair, gets one answer, strips fences and
 * parses JSON. Persisting the job row, the input-hash idempotency and the transition
 * stay with the routes layer — this module fails closed and returns nothing but a
 * parsed object, so a caller can never accidentally carry a raw model string forward.
 */

export class StepModelError extends Error {
  override readonly name = "StepModelError";
  /** The step that failed, so the job row can be marked `error` precisely. */
  readonly step: StudioStep;

  constructor(step: StudioStep, message: string, options?: { cause?: unknown }) {
    super(`A(z) "${step}" lépés modellhívása hibára futott: ${message}`, options);
    this.step = step;
  }
}

export type StepCallInput = {
  step: StudioStep;
  model: string;
  system: string;
  user: string;
};

export type StepCallResult = {
  /** The parsed answer. Schema validation happens at the call site. */
  json: unknown;
  usage: AIResponse["usage"];
};

/**
 * One pipeline step's model call.
 *
 * The answer must be JSON and must parse, or the call throws — fail closed, per the
 * master plan §6. The raw text never leaves this function; the error carries at most
 * the provider's message.
 */
export async function callStepModel(
  provider: IAIProvider,
  input: StepCallInput,
): Promise<StepCallResult> {
  let response: AIResponse;
  try {
    response = await provider.chat([
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ]);
  } catch (error) {
    throw new StepModelError(input.step, "a szolgáltató hibát jelzett", { cause: error });
  }

  const text = stripJsonFences(response.content ?? "").trim();
  if (text.length === 0) {
    throw new StepModelError(input.step, "a válasz üres");
  }

  try {
    const json: unknown = JSON.parse(text);
    return { json, usage: response.usage };
  } catch {
    // Length, never content: the raw text may itself be a prompt injection.
    throw new StepModelError(
      input.step,
      `a válasz nem érvényes JSON (${text.length} karakter)`,
    );
  }
}
