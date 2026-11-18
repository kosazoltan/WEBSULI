import { singleChoiceProblems } from "./single-choice-check";
import { isSpellingPrompt, optionKeyFor } from "./option-key";

/** The lesson and every compatible game accept exactly the same choice contract. */
export type ChoiceQuestion = { prompt: string; options: string[]; correctIndex: number };
/**
 * Kanban #101: az ellenőrzés drága (`singleChoiceProblems`), a játékok pedig ugyanazt a (lekérdezés-gyorsítótárban közös)
 * tétel-objektumot többször szűrik — pl. a tananyag megérkezésekor a teljes, már ellenőrzött bankot újra. Az eredmény csak a
 * tétel `prompt` / `options` / `correctIndex` tartalmától függ, ezért objektum-identitás szerint gyorsítótárazható. Őr: a bejegyzés
 * a három mezőt (az `options` tömb referenciáját és hosszát) is tárolja; ha valaki a tételt helyben módosítja, újra kiértékelődik.
 * Nem észlelhető: egy opció-szöveg helyben átírása ugyanabban a tömbben — a hívók nem írnak helyben (#491 review, 2. pont).
 * WeakMap: a bejegyzés a tétellel együtt szabadul (a szerveren minden lekérdezés új objektumot ad → tartós memória nincs).
 */
const playableCache = new WeakMap<object, { ok: boolean; prompt: unknown; options: unknown; length: number; correctIndex: unknown }>();

export function isPlayableQuestion<T>(value: T): value is T & ChoiceQuestion {
  if (!value || typeof value !== "object") return false;
  const q = value as Partial<ChoiceQuestion>;
  const length = Array.isArray(q.options) ? q.options.length : -1;
  const hit = playableCache.get(value);
  if (hit && hit.prompt === q.prompt && hit.options === q.options && hit.length === length && hit.correctIndex === q.correctIndex) return hit.ok;
  const ok = evaluatePlayable(value);
  playableCache.set(value, { ok, prompt: q.prompt, options: q.options, length, correctIndex: q.correctIndex });
  return ok;
}

/** A gyorsítótár nélküli ellenőrzés (a teszt ezzel veti össze a gyorsítótárazott utat). */
export function evaluatePlayable(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const q = value as Partial<ChoiceQuestion>;
  return typeof q.prompt === "string" && q.prompt.trim().length > 0
    && Array.isArray(q.options) && q.options.length >= 3 && q.options.length <= 4
    && q.options.every(o => typeof o === "string" && o.trim().length > 0)
    && new Set(q.options.map(optionKeyFor(isSpellingPrompt(typeof q.prompt === "string" ? q.prompt : ""), o => o.normalize("NFC").trim().toLocaleLowerCase("hu")))).size === q.options.length
    && Number.isInteger(q.correctIndex) && q.correctIndex! >= 0 && q.correctIndex! < q.options.length
    // Spec 2026-09-29 (egy-helyes-valasz, E5): a bizonyíthatóan nem pontosan-egy helyes opciós (régi) sor nem játszható.
    && singleChoiceProblems({ prompt: q.prompt, options: q.options, correctIndex: q.correctIndex! }).length === 0;
}

/** Legacy exports contain one copy per game. Do not bias selection towards those copies.
 * Source identity and answer/explanation are preserved; similar prompts are not merged.
 */
export function uniqueQuizContent<T extends ChoiceQuestion & { id?: string; questionVersion?: string; sourceMaterialId?: string | null; explanation?: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(q => {
    const key = q.id && q.questionVersion ? `canonical:${q.id}`
      : JSON.stringify([q.sourceMaterialId ?? null, q.prompt.normalize("NFC").trim(), q.options, q.correctIndex, q.explanation ?? null]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
