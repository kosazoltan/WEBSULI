import { createHash } from "node:crypto";
import type { IAIProvider } from "../ai/AIProvider";
import { stepStreamIdleMs } from "../ai/studio-provider";
import { stripJsonFences } from "../ai/OpenRouterProvider";
import { logger } from "../lib/logger";
import { workflowCheckpoint, workflowOrchestratorAllow, workflowRecordFailure, workflowUsage } from "../workflows/engine";
import { echoesInput, ORCHESTRATOR_MAX_ROUNDS, ORCHESTRATOR_MODELS, orchestrate, withCorrectivePrompt, type FailureKind, type OrchestratorInput, type OrchestratorResult } from "../workflows/orchestrator";
import { StepModelError } from "./run-step";
import { withSupportSkill } from "./support-skills";

/**
 * Spec 2026-10-05-s9-prompt-javito-orkesztrator (tulajdonosi tervezés) + a független terv-ellenőrzés javításai: a bukott lépés
 * HELYBEN (új lépés-látogatás nélkül) kap orkesztrált újrafuttatást — az orkesztrátor elemzi a hibát, javító promptot ír, a
 * szerep ugyanazzal a modellel újra fut, a kimenetet ugyanazok a kapuk/validálás ítélik meg. Kapcsoló: WORKFLOW_ORCHESTRATOR=1
 * (alapból KI — a gyártás viselkedése kapcsoló nélkül változatlan).
 */
export function orchestratorEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.WORKFLOW_ORCHESTRATOR === "1";
}

/** Validálási bukás a redo-ból (séma, ismeretlen azonosító, coverage) — orkesztrálható, nem szolgáltatói hiba. */
export class OrchestrationValidationError extends Error {
  constructor(readonly kind: FailureKind, readonly reasons: string[], readonly rawOutput?: string) {
    super(reasons.join("; ").slice(0, 2000));
    this.name = "OrchestrationValidationError";
  }
}

/** Csak a kapu/validálás bukása orkesztrálható (terv-ellenőrzés 11.); szolgáltatói hiba és időtúllépés NEM. */
export function failureKindOf(error: unknown): FailureKind | null {
  if (error instanceof OrchestrationValidationError) return error.kind;
  if (!(error instanceof StepModelError)) return null;
  if (/nem érvényes JSON/.test(error.message)) return "invalid_json";
  if (/hosszkorlát/.test(error.message)) return "length";
  if (/a válasz üres/.test(error.message)) return "empty";
  return null;
}

/** A javító prompt injekció-szűrése az orkesztrátor-magban (review #190); itt a meglévő hívók miatt újraexportálva. */
export { echoesInput };

export type OrchestrationDeps = {
  providerFactory: (model: string, step?: string) => IAIProvider;
  keyConfigured: (model: string) => boolean;
};

type Base = { role: string; step: string; model: string; system: string; user: string; point: string; round: number; subject?: string };
type Failure = { kind: FailureKind; reasons: string[]; rawOutput?: string };
const hash = (s: string | undefined) => (s ? createHash("sha256").update(s).digest("hex").slice(0, 16) : undefined);

/**
 * Review #191: a keret-ellenőrzés a checkpoint `work` ágában fut — folytatáskor a gyorsítótár-találat nem fogyaszt keretet,
 * így a mentett javító prompt nem vész el. Elutasításkor dobunk (nem `null`-t adunk vissza), hogy a `null` ne kerüljön a
 * checkpointba: egy későbbi futás (új keret) újra elemezhessen.
 */
export class OrchestratorBudgetExhausted extends Error {
  constructor(readonly point: string) {
    super(`Az orkesztrátor-keret elfogyott (${point}).`);
    this.name = "OrchestratorBudgetExhausted";
  }
}

async function analyse(base: Base, failure: Failure, n: number, previousDiagnoses: string[], deps: OrchestrationDeps): Promise<OrchestratorResult | null> {
  const input: OrchestratorInput = { role: base.role, step: base.step, model: base.model, system: base.system, user: base.user, failure, previousDiagnoses, ...(base.subject ? { subject: base.subject } : {}) };
  const models = ORCHESTRATOR_MODELS.filter((m) => deps.keyConfigured(m));
  // Terv-ellenőrzés 3.: a kulcs a hibát azonosítja (más hiba → új elemzés); szolgáltatói szöveg nincs benne.
  const key = { step: base.step, round: base.round, point: base.point, n, kind: failure.kind, outputHash: hash(failure.rawOutput), reasons: failure.reasons.slice(0, 20) };
  let result: OrchestratorResult | null;
  try {
    result = await workflowCheckpoint("orchestrator", key, async () => {
      if (!await workflowOrchestratorAllow(base.point)) throw new OrchestratorBudgetExhausted(base.point);
      return orchestrate(input, async (model, system, user) => {
        const provider = deps.providerFactory(model, "orchestrator");
        const idleMs = stepStreamIdleMs("orchestrator");
        // A skill a hívási ponton is kötelező (idempotens: a már skill-elt prompt nem duplázódik).
        const res = await provider.chat([{ role: "system", content: withSupportSkill("orchestrator", system) }, { role: "user", content: user }], AbortSignal.timeout(120_000),
          provider.supportsStreamingChat && idleMs ? { stream: { idleMs } } : undefined);
        await workflowUsage(res.usage);
        return { json: JSON.parse(stripJsonFences(res.content ?? "").trim()) };
      }, models);
    });
  } catch (error) {
    if (!(error instanceof OrchestratorBudgetExhausted)) throw error;
    logger.warn(`[ORKESZTRÁTOR] ${base.point}: a keret elfogyott — a régi hibaút folytatódik.`);
    return null;
  }
  if (!result) return null;
  if (echoesInput(result.correctivePrompt, [failure.rawOutput, base.user])) {
    logger.warn(`[ORKESZTRÁTOR] ${base.point}: a javító prompt a bemenetet/kimenetet másolná — elvetve.`);
    return null;
  }
  return result;
}

/**
 * Legfeljebb ORCHESTRATOR_MAX_ROUNDS orkesztrált kör: elemzés → `redo(javított rendszerprompt)`. Siker → az érték; bármely
 * nem orkesztrálható hiba (szolgáltatói), elfogyott keret vagy sikertelen körök → null (a hívó a RÉGI hibaútját folytatja).
 */
export async function orchestratedRetry<T>(base: Base, first: Failure, redo: (correctedSystem: string, n: number) => Promise<T>, deps: OrchestrationDeps): Promise<{ value: T; rootCause: string } | null> {
  let failure = first;
  const diagnoses: string[] = [];
  for (let n = 1; n <= ORCHESTRATOR_MAX_ROUNDS; n++) {
    const res = await analyse(base, failure, n, diagnoses, deps);
    if (!res) {
      await workflowRecordFailure({ at: Date.now(), step: base.step, point: base.point, kind: failure.kind, reasons: failure.reasons.slice(0, 10), ...(failure.rawOutput ? { outputHash: hash(failure.rawOutput) } : {}), orchestrated: { rootCause: "", outcome: "skipped" } });
      return null;
    }
    logger.info(`[ORKESZTRÁTOR] ${base.point} (${n}. kör, ${failure.kind}): ${res.rootCause.slice(0, 200)}`);
    try {
      const value = await redo(withCorrectivePrompt(base.system, res), n);
      logger.info(`[ORKESZTRÁTOR] ${base.point}: a javított futás átment a kapukon (${n}. kör).`);
      await workflowRecordFailure({ at: Date.now(), step: base.step, point: base.point, kind: failure.kind, reasons: failure.reasons.slice(0, 10), ...(failure.rawOutput ? { outputHash: hash(failure.rawOutput) } : {}), orchestrated: { rootCause: res.rootCause.slice(0, 200), outcome: "ok" } });
      return { value, rootCause: res.rootCause };
    } catch (error) {
      await workflowRecordFailure({ at: Date.now(), step: base.step, point: base.point, kind: failure.kind, reasons: failure.reasons.slice(0, 10), ...(failure.rawOutput ? { outputHash: hash(failure.rawOutput) } : {}), orchestrated: { rootCause: res.rootCause.slice(0, 200), outcome: "failed" } });
      const kind = failureKindOf(error);
      if (!kind) { logger.warn(`[ORKESZTRÁTOR] ${base.point}: a javított futás szolgáltatói hibán bukott — a régi hibaút folytatódik.`); return null; }
      diagnoses.push(`${res.rootCause} — ${res.diagnosis}`.slice(0, 600));
      failure = { kind, reasons: [error instanceof Error ? error.message : String(error)], rawOutput: (error as { rawOutput?: string }).rawOutput };
      logger.warn(`[ORKESZTRÁTOR] ${base.point}: a javított futás is bukott (${kind}) — új elemzés.`);
    }
  }
  return null;
}

/**
 * Spec 2026-10-05-s9 (bankcsomag, terv-ellenőrzés 6.): a bank-ciklus a MEGLÉVŐ kísérleteivel fut tovább (a modell-sorrend és a
 * mentő-/salvage-szemantika változatlan); az orkesztrátor csak a következő kísérlet FEJEZETENKÉNTI rendszerpromptját javítja.
 * null: nincs javítás (keret, kulcs, érvénytelen válasz, injekció-gyanú) — a ciklus a régi módon folytatódik.
 */
export async function correctedSystemFor(base: Base, failure: Failure, n: number, previousDiagnoses: string[], deps: OrchestrationDeps): Promise<{ system: string; rootCause: string; diagnosis: string } | null> {
  const res = await analyse(base, failure, n, previousDiagnoses, deps);
  if (!res) return null;
  logger.info(`[ORKESZTRÁTOR] ${base.point} (${n}. kör, ${failure.kind}): ${res.rootCause.slice(0, 200)}`);
  return { system: withCorrectivePrompt(base.system, res), rootCause: res.rootCause, diagnosis: res.diagnosis };
}
