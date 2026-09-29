import type { MapConcept } from "./coverage";
import { logger } from "../lib/logger";

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

/** The model's `{ focusIds }` → a usable focus, or null when it would not narrow anything safely. */
export function validateTopicFocus(concepts: MapConcept[], raw: unknown): TopicFocus | null {
  const ids = (raw as { focusIds?: unknown } | null)?.focusIds;
  if (!Array.isArray(ids)) return null;
  const known = new Set(concepts.map((c) => c.localId));
  const localIds = [...new Set(ids.filter((id): id is string => typeof id === "string" && known.has(id)))];
  const chosen = new Set(localIds);
  // Without a core concept the lesson would have no backbone; choosing everything narrows nothing.
  if (!concepts.some((c) => chosen.has(c.localId) && c.examWeight === "core")) return null;
  if (localIds.length === concepts.length) return null;
  const demoted = concepts.filter((c) => !chosen.has(c.localId) && c.examWeight !== "extra").length;
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
  "Tananyag-tervező segítő vagy. A tanár egy konkrét témát kért; a tudástár ennél bővebb forrásból készült.",
  "Válaszd ki a fogalmak közül azokat, amelyek a KÉRT TÉMA tanításához szükségesek: a téma saját fogalmait,",
  "és azokat az előfeltételeket, amelyek nélkül a téma nem érthető meg (például egy szabályhoz szükséges",
  "alapfogalmakat). Ami a forrásban szerepel, de a kért témához nem kell, maradjon ki.",
  'Válaszolj kizárólag ilyen JSON-nal: { "focusIds": ["<localId>", "…"] }',
].join(" ");

/** The user message: the teacher's request and the concept list (ids, terms, short definitions, weights). */
export function topicFocusUserMessage(instruction: string, concepts: MapConcept[]): string {
  const lines = concepts.map((c) => JSON.stringify({ localId: c.localId, term: c.term ?? "", definition: (c.definition ?? "").slice(0, 240), examWeight: c.examWeight }));
  return `A tanár kérése:\n${instruction.trim()}\n\nFogalmak (soronként egy JSON):\n${lines.join("\n")}`;
}

/**
 * One cheap classification call. Any failure keeps the full map (the pre-2026-09-29 behaviour) — a missing
 * focus makes a broader lesson, never a broken one.
 */
export async function decideTopicFocus(
  instruction: string | undefined,
  concepts: MapConcept[],
  call: (system: string, user: string) => Promise<unknown>,
): Promise<TopicFocus | null> {
  if (!instruction?.trim() || concepts.length === 0) return null;
  try {
    return validateTopicFocus(concepts, await call(TOPIC_FOCUS_SYSTEM, topicFocusUserMessage(instruction, concepts)));
  } catch (error) {
    logger.warn(`[STUDIO] Témafókusz nem készült, a teljes térképpel megy tovább: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
    return null;
  }
}
