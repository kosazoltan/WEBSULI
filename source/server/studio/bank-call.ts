import { AIProviderError, AIProviderTimeoutError, type IAIProvider, type ResponseFormatJsonSchema } from "../ai/AIProvider";
import { BANK_RESCUE_MODEL, fallbackModelFor, providerForModel, resolveStudioModel } from "../ai/models";
import { PACKET_ATTEMPTS, RetryableBankCallError } from "./experience-builder";
import { callStepModel, StepModelError, type StepCallResult } from "./run-step";

/**
 * Spec 2026-09-25 (webes gyártás elakadása): the bank packet's model route, shared by the upload
 * (step-runner) and the internet (web-research-runner) path — the web path had kept the author model
 * and no retry after 2026-09-19, so one bad packet answer or a sequential build over 20 min stopped it.
 *
 * Spec 2026-09-19: the bank is its own cheap role; after PACKET_ATTEMPTS failed attempts the packet is
 * rebuilt once on the strong rescue model. attempt 0..PACKET_ATTEMPTS-2: primary; PACKET_ATTEMPTS-1:
 * FALLBACK_MODELS.bank (other family — a provider/length failure on the primary must not repeat on it);
 * attempt PACKET_ATTEMPTS: rescue on the strong model.
 */
export function bankModelForAttempt(attempt: number): string {
  return attempt >= PACKET_ATTEMPTS ? BANK_RESCUE_MODEL
    : attempt === PACKET_ATTEMPTS - 1 ? (fallbackModelFor("bank") ?? resolveStudioModel("bank"))
    : resolveStudioModel("bank");
}

/** The provider policy of the attempt: the rescue runs on the author-class settings. */
export function bankProviderStep(attempt: number): "author" | "bank" {
  return attempt >= PACKET_ATTEMPTS ? "author" : "bank";
}

/**
 * Spec 2026-10-14-folytatas-mentett-reszekbol: a szolgáltató átmeneti szerverhibája (HTTP 5xx) — a hiba saját `status`
 * mezője vagy az `AIProviderError.originalError` státusza.
 */
function isServerError(cause: unknown): boolean {
  const statusOf = (value: unknown) => (value && typeof value === "object" ? (value as { status?: unknown }).status : undefined);
  const status = statusOf(cause) ?? (cause instanceof AIProviderError ? statusOf(cause.originalError) : undefined);
  return typeof status === "number" && status >= 500 && status <= 599;
}

/**
 * Model-output failure (length limit / empty / not JSON: no provider cause) → the next attempt on the
 * next model. Mérve (4. mérés): an időtúllépés a modell lassúsága (elfajult, 24k-ig futó válasz) — ez is a
 * következő kísérleté. Spec 2026-10-14 (élő: [OpenAI] 500): az átmeneti 5xx is a következő kísérleté. Other provider
 * failures (429/quota/key/status-less) keep their cause and fail the run once (resume path).
 */
export async function callBankPacketModel(provider: IAIProvider, model: string, system: string, user: string, signal?: AbortSignal, extra?: { responseFormat?: ResponseFormatJsonSchema }): Promise<StepCallResult> {
  try {
    // Spec 2026-09-30 (§C-V/3): a bankcsomag az `animator` lépésen belül fut, de a szerepe `bank` — ezt kapja a runbook/szabály-szűrő.
    // Spec 2026-09-30 (U2/C8): a szigorú séma csak az igazoltan támogató KÖZVETLEN OpenAI-úton megy; tartalék úton JSON-mód + helyi validálás.
    const responseFormat = extra?.responseFormat && providerForModel(model) === "openai" ? extra.responseFormat : undefined;
    return await callStepModel(provider, { step: "animator", role: "bank", model, system, user, ...(responseFormat ? { responseFormat } : {}) }, signal);
  } catch (error) {
    const timedOut = error instanceof StepModelError && error.cause instanceof AIProviderTimeoutError;
    const serverError = error instanceof StepModelError && isServerError(error.cause);
    if (error instanceof StepModelError && (!error.cause || timedOut || serverError)) {
      throw new RetryableBankCallError(`${model}: ${error.message}${timedOut ? " (időtúllépés)" : serverError ? " (szolgáltatói 5xx)" : ""}`, { cause: error });
    }
    throw error;
  }
}
