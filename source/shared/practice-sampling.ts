/**
 * TG-P6 (docs/specs/2026-11-27-tananyag-gyakorlati-p6-vegrehajtas.md): kiegyensúlyozott tanulói kör.
 *
 * A teljes bank 60–75%-a alkalmazó tétel (TG-P4), de a kör csak minta belőle: a sima véletlen minta vagy a banksorrend
 * (üres ismétlési előzménynél) fogalmi többséget is adhat. Itt a kör célszáma a kétharmad, a 60–75% sávba szorítva, a készlet
 * erejéig; a besorolás a közös mércéből (`shared/practice-policy.ts`) futásidőben jön, így a régi, címkézetlen bank is kezelhető.
 */
import { classifyQuizItem } from "./practice-policy";

export const isApplyQuiz = (q: { question?: string; prompt?: string; options?: readonly string[] }): boolean =>
  classifyQuizItem({ question: q.question ?? q.prompt ?? "", options: q.options ? [...q.options] : undefined }).kind === "alkalmazas";

/**
 * Hány alkalmazó és hány egyéb tétel kerüljön egy `n` méretű körbe. A `fixed*` a már rögzített (pl. kötelező szóbeli) tételek
 * száma csoportonként; a visszaadott érték a még kiválasztandó darab. Ha valamelyik csoport kevés, a másik pótolja.
 */
export function balancedCounts(n: number, applyAvail: number, otherAvail: number, applyFixed = 0, otherFixed = 0): { apply: number; other: number } {
  const lower = Math.ceil(n * 0.6);
  const upper = Math.floor(n * 0.75);
  const goal = Math.min(Math.max(Math.round((n * 2) / 3), lower), Math.max(lower, upper));
  const free = Math.max(0, n - applyFixed - otherFixed);
  let apply = Math.min(applyAvail, Math.max(0, goal - applyFixed), free);
  const other = Math.min(otherAvail, free - apply);
  apply = Math.min(applyAvail, free - other);
  return { apply, other };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Helyi kvízkör: a két csoportból külön sorsol, majd összekeveri. */
export function sampleQuizIds<T extends { id: string; question?: string; prompt?: string; options?: readonly string[] }>(
  bank: readonly T[], count: number, random = Math.random,
): string[] {
  const apply = bank.filter((q) => isApplyQuiz(q)).map((q) => q.id);
  const other = bank.filter((q) => !isApplyQuiz(q)).map((q) => q.id);
  const n = Math.min(count, bank.length);
  const want = balancedCounts(n, apply.length, other.length);
  return shuffled([...shuffled(apply, random).slice(0, want.apply), ...shuffled(other, random).slice(0, want.other)], random);
}

/** Rangsorolt listából (pl. ismétlési sorrend) a csoportonkénti darab, a csoporton belüli sorrend és az összsorrend megtartásával. */
export function pickBalanced<T>(ranked: readonly T[], count: number, isApply: (q: T) => boolean): T[] {
  const apply = ranked.filter(isApply);
  const other = ranked.filter((q) => !isApply(q));
  const want = balancedCounts(Math.min(count, ranked.length), apply.length, other.length);
  const chosen = new Set<T>([...apply.slice(0, want.apply), ...other.slice(0, want.other)]);
  return ranked.filter((q) => chosen.has(q));
}
