/**
 * LS-5 — concept_results aggregation (master plan §5).
 *
 * Pure computation shared by the parent digest and the "fix this concept"
 * trigger: per-concept totals and rates, plus the weak-concept list with a
 * minimum-measurement floor so noise does not fire the loop.
 */

export type ConceptAggregate = {
  conceptId: string;
  total: number;
  correct: number;
  rate: number;
};

export function aggregateConceptResults(
  rows: ReadonlyArray<{ conceptId: string; correct: boolean }>,
): ConceptAggregate[] {
  const acc = new Map<string, { total: number; correct: number }>();
  for (const row of rows) {
    const cur = acc.get(row.conceptId) ?? { total: 0, correct: 0 };
    cur.total += 1;
    if (row.correct) cur.correct += 1;
    acc.set(row.conceptId, cur);
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([conceptId, { total, correct }]) => ({
      conceptId,
      total,
      correct,
      rate: total === 0 ? 0 : correct / total,
    }));
}

export function weakConceptIds(
  agg: ReadonlyArray<ConceptAggregate>,
  threshold: number,
  opts: { minTotal?: number } = {},
): string[] {
  const minTotal = opts.minTotal ?? 3;
  return agg
    .filter((c) => c.total >= minTotal && c.rate < threshold)
    .map((c) => c.conceptId);
}
