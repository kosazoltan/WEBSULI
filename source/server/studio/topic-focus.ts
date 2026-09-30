import type { MapConcept } from "./coverage";
import { WorkflowConflict, WorkflowWaiting } from "../workflows/engine";
import { logger } from "../lib/logger";
import { FALLBACK_MODELS, resolveStudioModel } from "../ai/models";

/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-tanari-temafokusz.md, tulajdonosi döntés): a tanár kérése a JOBBAN
 * szűkíti a kötelező lefedettséget.
 *
 * Mérve (élő webes gyártás, „Oszthatóság 3-mal és 9-cel”): a letöltött Sulinet-oldalak minden oszthatósági
 * szabályt tartalmaztak, és mivel a lefedettség minden `core` fogalmat követel, a 12 fejezetből csak 4 szólt a
 * kért témáról. A kérés eddig csak prompt-szöveg volt, amely maga is a kötelező fedettség elsőbbségét mondta.
 *
 * A közös tudástárat szándékosan NEM módosítjuk: a térképet a forrás-hash alapján más futások is újrahasznosítják.
 * A fókusz a job kimenetében él, és a lépések a térkép fókuszált MÁSOLATÁN dolgoznak.
 */

export type TopicFocus = { localIds: string[]; demoted: number };

type FocusableMap = { concepts: MapConcept[] };

/**
 * The model's `{ narrow, focusIds }` → a usable focus, or null when it would not narrow anything safely.
 * PR #132 review: a request is not always a topic (length, grade, a typo fix) — only an explicit `narrow: true`
 * narrows. Only concepts coverage could require (not `extra`) count as the focus.
 */
export function validateTopicFocus(concepts: MapConcept[], raw: unknown): TopicFocus | null {
  const answer = raw as { narrow?: unknown; focusIds?: unknown } | null;
  if (answer?.narrow !== true || !Array.isArray(answer.focusIds)) return null;
  const requirable = new Set(concepts.filter((c) => c.examWeight !== "extra").map((c) => c.localId));
  const localIds = [...new Set(answer.focusIds.filter((id): id is string => typeof id === "string" && requirable.has(id)))];
  const chosen = new Set(localIds);
  // Without a core concept the lesson would have no backbone; choosing everything narrows nothing.
  if (!concepts.some((c) => chosen.has(c.localId) && c.examWeight === "core")) return null;
  const demoted = requirable.size - localIds.length;
  if (demoted === 0) return null;
  return { localIds, demoted };
}

/** A copy of the map where concepts outside the focus are `extra` (available, not required by coverage). */
export function applyTopicFocus<T extends FocusableMap>(map: T, focus: TopicFocus | null | undefined): T {
  if (!focus?.localIds?.length) return map;
  const chosen = new Set(focus.localIds);
  return {
    ...map,
    concepts: map.concepts.map((c) => (chosen.has(c.localId) || c.examWeight === "extra" ? c : { ...c, examWeight: "extra" as const })),
  };
}

export const TOPIC_FOCUS_SYSTEM = [
  "Tananyag-tervező segítő vagy. A tudástár a tanár által adott forrásból készült; a tanár kérést is írt.",
  "ELŐSZÖR döntsd el, hogy a kérés a forrás egy RÉSZTÉMÁJÁT kéri-e (például: csak a 3-mal és 9-cel való",
  "oszthatóságot a sok szabályból). Ha a kérés a terjedelemről, évfolyamról, nehézségről, stílusról, egy elírás",
  "javításáról szól, vagy a forrás egészét kéri, akkor NEM résztéma: ilyenkor narrow=false és üres lista.",
  "Ha résztémát kér:",
  "Válaszd ki a fogalmak közül MINDAZT, ami a KÉRT TÉMA tanításához kell: a téma szabályait, azok magyarázatát",
  "(miért működnek), a témához tartozó kidolgozott példa-fogalmakat, a témán belüli összefüggéseket, és azokat az",
  "előfeltételeket, amelyek nélkül a téma nem érthető meg. Kétes esetben, ha a fogalom a kért témáról szól,",
  "vedd be. Ami a forrásban szerepel, de más témához tartozik (például más számra vonatkozó szabály), maradjon ki.",
  'Válaszolj kizárólag ilyen JSON-nal: { "narrow": true|false, "focusIds": ["<localId>", "…"] }',
].join(" ");

/** The user message: the teacher's request and the concept list (ids, terms, short definitions, weights). */
export function topicFocusUserMessage(instruction: string, concepts: MapConcept[]): string {
  const lines = concepts.map((c) => JSON.stringify({ localId: c.localId, term: c.term ?? "", definition: (c.definition ?? "").slice(0, 240), examWeight: c.examWeight }));
  return `A tanár kérése:\n${instruction.trim()}\n\nFogalmak (soronként egy JSON):\n${lines.join("\n")}`;
}

/**
 * Spec 2026-09-30 (docs/specs/2026-09-30-temafokusz-kesleltetes.md): the model order of the focus decision.
 * Mérve (Mezopotámia-térkép, 55 fogalom, éles út, 60 s-os határidő): a deepseek-v4-flash 5 hívásból 1-szer döntött
 * (3 időtúllépés 60 s-nál, 1 üres válasz), a glm-5.3-flash 5/5-ször, 11–53 s alatt, azonos fókuszmérettel. A glm megy
 * elöl, a deepseek (a `gateHelper` szerep modellje, más szolgáltató) a tartalék.
 */
export function topicFocusModels(env: Record<string, string | undefined> = process.env): string[] {
  return [...new Set([FALLBACK_MODELS.gateHelper, resolveStudioModel("gateHelper", env)].filter((m): m is string => !!m))];
}

export type FocusCaller =(system: string, user: string) => Promise<unknown>;

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? ` (ok: ${error.cause.message})` : "";
  return `${message}${cause}`.slice(0, 300);
}

/**
 * Classification with a fallback chain (spec 2026-09-29, 2. kör: live, the only call stalled for 180 s). Each caller
 * is tried in order; a failure OR an unusable answer (no core, everything, bad shape) moves to the next one. If none
 * gives a usable focus, the full map stays (the pre-2026-09-29 behaviour) — a broader lesson, never a broken one.
 */
export async function decideTopicFocus(
  instruction: string | undefined,
  concepts: MapConcept[],
  callers: FocusCaller[],
): Promise<TopicFocus | null> {
  if (!instruction?.trim() || concepts.length === 0) return null;
  const user = topicFocusUserMessage(instruction, concepts);
  for (const [index, call] of callers.entries()) {
    try {
      const raw = await call(TOPIC_FOCUS_SYSTEM, user);
      // An explicit "not a subtopic request" is a decision, not a failure: no fallback is asked.
      if ((raw as { narrow?: unknown } | null)?.narrow === false) {
        logger.info("[STUDIO] Témafókusz: a kérés nem résztéma-kérés, a teljes térkép marad.");
        return null;
      }
      const focus = validateTopicFocus(concepts, raw);
      if (focus) return focus;
      logger.warn(`[STUDIO] Témafókusz: a(z) ${index + 1}. modell válasza nem használható (nincs kulcsfogalom vagy mindent kijelölt).`);
    } catch (error) {
      // PR #132 review: a lost lease or a waiting workflow is not a model failure — it must reach the engine.
      if (error instanceof WorkflowConflict || error instanceof WorkflowWaiting) throw error;
      logger.warn(`[STUDIO] Témafókusz: a(z) ${index + 1}. modell hívása hibázott: ${describe(error)}`);
    }
  }
  logger.warn("[STUDIO] Témafókusz nem készült, a teljes térképpel megy tovább.");
  return null;
}
