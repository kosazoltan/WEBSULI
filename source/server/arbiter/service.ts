/**
 * Tételgyár T7.1: a döntőbíró folyamata — determinisztikus ítélet → (nem `ok` esetén) gyorsítótár → napi keret → modell. Minden hiba a
 * determinisztikus ítéletre esik vissza (E2). A függőségek injektálhatók (teszt); a napló csak számokat és állapotot ír, szöveget nem.
 */
import type { OpenTask } from "../../shared/lesson-experience";
import { evaluateOpenAnswer } from "../../shared/lesson-experience-score";
import { logger } from "../lib/logger";
import {
  ARBITER_SYSTEM, arbiterCacheKey, buildArbiterUserMessage, combineVerdicts, parseArbiterVerdict,
  type ArbiterVerdict, type JudgedScore,
} from "./arbiter";

export type ArbiterDeps = {
  cacheGet(key: string): Promise<ArbiterVerdict | null>;
  cachePut(key: string, verdict: ArbiterVerdict): Promise<void>;
  /** Atomi foglalás a napi keretből; `false` = a plafon elfogyott. */
  reserveDailyCall(): Promise<boolean>;
  callModel(system: string, user: string): Promise<unknown>;
};

export async function judgeOpenAnswer(input: { task: OpenTask; teaching: string; answer: string }, deps: ArbiterDeps): Promise<JudgedScore> {
  const det = evaluateOpenAnswer(input.answer, input.task);
  // E1: teljes pontos vagy üres válaszra nincs döntőbíró.
  if (det.state === "ok" || !input.answer.trim()) return { ...det, source: "pontozó" };
  const key = arbiterCacheKey(input.task, input.answer);
  try {
    const cached = await deps.cacheGet(key);
    if (cached) return combineVerdicts(det, cached, "gyorsítótár");
    if (!(await deps.reserveDailyCall())) {
      logger.warn("[DÖNTŐBÍRÓ] A napi keret elfogyott — a determinisztikus ítélet marad.");
      return { ...det, source: "pontozó" };
    }
    const verdict = parseArbiterVerdict(await deps.callModel(ARBITER_SYSTEM, buildArbiterUserMessage(input.task, input.teaching, input.answer)));
    if (!verdict) {
      logger.warn("[DÖNTŐBÍRÓ] A modell válasza nem értelmezhető — a determinisztikus ítélet marad.");
      return { ...det, source: "pontozó" };
    }
    await deps.cachePut(key, verdict).catch((e) => logger.warn(`[DÖNTŐBÍRÓ] A gyorsítótár írása nem sikerült: ${e instanceof Error ? e.message.slice(0, 120) : "ismeretlen"}`));
    const judged = combineVerdicts(det, verdict, "döntőbíró");
    logger.info(`[DÖNTŐBÍRÓ] ítélet: pontozó=${det.state}, döntőbíró=${verdict.state}, végső=${judged.state}`);
    return judged;
  } catch (error) {
    logger.warn(`[DÖNTŐBÍRÓ] Hiba — a determinisztikus ítélet marad: ${error instanceof Error ? error.message.slice(0, 160) : "ismeretlen"}`);
    return { ...det, source: "pontozó" };
  }
}
