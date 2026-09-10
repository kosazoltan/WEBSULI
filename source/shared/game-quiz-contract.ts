/** The lesson and every compatible game accept exactly the same choice contract. */
export type ChoiceQuestion = { prompt: string; options: string[]; correctIndex: number };
export function isPlayableQuestion<T>(value: T): value is T & ChoiceQuestion {
  if (!value || typeof value !== "object") return false;
  const q = value as Partial<ChoiceQuestion>;
  return typeof q.prompt === "string" && q.prompt.trim().length > 0
    && Array.isArray(q.options) && q.options.length >= 3 && q.options.length <= 4
    && q.options.every(o => typeof o === "string" && o.trim().length > 0)
    && new Set(q.options.map(o => o.normalize("NFC").trim().toLocaleLowerCase("hu"))).size === q.options.length
    && Number.isInteger(q.correctIndex) && q.correctIndex! >= 0 && q.correctIndex! < q.options.length;
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
