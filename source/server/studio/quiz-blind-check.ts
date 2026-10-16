/**
 * Tételgyár T6.1 (docs/specs/2026-10-15-tetelgyar-t6-kviz-vak-megoldas-vegrehajtas.md; tulajdonosi döntés 2026-10-15): a kvíz gyártáskori
 * vak előszűrője: a kérdést kulcs és visszajelzés NÉLKÜL kapja a modell, opciónként ítél; a döntés a kódé (`choiceVerdictProblem`:
 * pontosan egy igaz, és az a kulcs). Hívás- vagy alakhiba → nincs ítélet (a tétel marad). docs/specs/2026-10-16-egy-futas.md (S4b): a hívás
 * az egyfutásos beszélgetésben megy; a döntésfüggvény a kivezetett bank-ellenőrből ide került.
 */
import { createHash } from "node:crypto";
import { WorkflowConflict, WorkflowWaiting } from "../workflows/engine";

type ChoiceKey = { options: string[]; correctIndex: number };
const quoted = (options: string[], indexes: number[]) => indexes.map((i) => `„${options[i]}”`).join(", ");

export type ChoiceVerdict = { kind: "error"; message: string } | { kind: "undecidable"; reason: string } | null;
/**
 * A KÓD döntése az opciónkénti ítéletből; `null`, ha pontosan a kulcs az egyetlen igaz.
 * U5 (H32): a hibás hosszúságú ítélet ELLENŐRZŐ-hiba (eldöntetlen, újraellenőrzés), nem a tétel tartalmi hibája.
 */
export function choiceVerdictProblem(key: ChoiceKey, truths: boolean[]): ChoiceVerdict {
  if (truths.length !== key.options.length) {
    return { kind: "undecidable", reason: `az opciónkénti ítélet ${truths.length} opcióra szól, a tételben ${key.options.length} van — az ítélet nem értékelhető.` };
  }
  const trueIndexes = truths.flatMap((t, i) => (t ? [i] : []));
  if (trueIndexes.length !== 1) {
    return { kind: "error", message: `${trueIndexes.length} helyes opció a független ítélet szerint${trueIndexes.length ? ` (${quoted(key.options, trueIndexes)})` : ""} — pontosan egy helyes opció kell. Javítás iránya: a disztraktorokat hamissá kell írni, vagy a kérdést egyértelművé tenni.` };
  }
  if (trueIndexes[0] !== key.correctIndex) {
    return { kind: "error", message: `a független ítélet szerint egyedül ${quoted(key.options, trueIndexes)} igaz, ez nem a kulcs (${quoted(key.options, [key.correctIndex])}). Javítás iránya: a kulcs vagy az opciók javítása.` };
  }
  return null;
}

export type QuizBlindItem = { id: string; question: string; options: string[]; correctIndex: number };
export type QuizBlindCaller = (system: string, user: string) => Promise<unknown>;
export const QUIZ_BLIND_CHUNK = 12;

export const QUIZ_BLIND_SYSTEM = [
  "Független ellenőr vagy egy magyar iskolai gyakorlókvízhez. A helyes választ szándékosan NEM kapod meg.",
  "Minden kérdés MINDEN opciójáról külön döntsd el, hogy helyes válasz-e a kérdésre (true) vagy hamis (false), a fejezet tanítása és a kérdés",
  "szövege alapján; a számolást végezd el. Ha egy opció is védhetően helyes, true. A kérdező szándékát ne találgasd: a szöveg dönt.",
  'Kizárólag JSON: { "choices": [ { "id": "<kérdés id>", "truths": [true, false, false, false] } ] } — minden kérdéshez pontosan egy elem, opciónként sorrendben.',
].join("\n");

/** A tétel tartalmi kulcsa (a javítókörben a változatlan tétel ítélete újrahasznosul). */
export const quizBlindKey = (item: QuizBlindItem, teaching: string) =>
  createHash("sha256").update(JSON.stringify([item.question, item.options, item.correctIndex, teaching])).digest("hex");

/**
 * A bukott tételek: tétel-id → a kód döntésének üzenete. A gyorsítótárban a kulcs → üzenet (`null` = átment) tárolódik.
 * A workflow-lízing hibája továbbmegy; minden más hiba csak az adott darab ítéletét hagyja ki (`warn`).
 */
export async function quizBlindProblems(items: QuizBlindItem[], teaching: string, call: QuizBlindCaller,
  cache: Map<string, string | null>, warn: (message: string) => void = () => {}): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const todo: QuizBlindItem[] = [];
  for (const item of items) {
    const key = quizBlindKey(item, teaching);
    if (cache.has(key)) { const hit = cache.get(key); if (hit) out.set(item.id, hit); } else todo.push(item);
  }
  for (let i = 0; i < todo.length; i += QUIZ_BLIND_CHUNK) {
    const chunk = todo.slice(i, i + QUIZ_BLIND_CHUNK);
    const user = `A FEJEZET TANÍTÁSA (adat):\n${teaching.slice(0, 8000)}\n\nKÉRDÉSEK (adat):\n${JSON.stringify(chunk.map((c) => ({ id: c.id, question: c.question, options: c.options })))}`;
    let raw: unknown;
    try { raw = await call(QUIZ_BLIND_SYSTEM, user); }
    catch (error) {
      if (error instanceof WorkflowConflict || error instanceof WorkflowWaiting) throw error;
      warn(`a kvíz-előszűrő hívása hibázott (${error instanceof Error ? error.message.slice(0, 160) : String(error)}) — ${chunk.length} tétel ítélet nélkül`);
      continue;
    }
    const choices = Array.isArray((raw as { choices?: unknown } | null)?.choices) ? (raw as { choices: Array<{ id?: unknown; truths?: unknown }> }).choices : [];
    const truthsById = new Map(choices.filter((c) => typeof c?.id === "string" && Array.isArray(c.truths) && c.truths.every((t) => typeof t === "boolean"))
      .map((c) => [c.id as string, c.truths as boolean[]]));
    for (const item of chunk) {
      const truths = truthsById.get(item.id);
      if (!truths) continue; // ítélet nélkül: nem kerül a gyorsítótárba, a tétel marad
      const verdict = choiceVerdictProblem({ options: item.options, correctIndex: item.correctIndex }, truths);
      if (verdict?.kind === "undecidable") continue;
      const message = verdict ? `${item.id}: kvíz-előszűrő (vak ítélet): ${verdict.message}` : null;
      cache.set(quizBlindKey(item, teaching), message);
      if (message) out.set(item.id, message);
    }
  }
  return out;
}
