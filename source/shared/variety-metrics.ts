/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (15. szakasz; alap: TGM-terv SK2): a változatosság gépi mérőszámai — a
 * mérőszkript (`scripts/measure/variety-measure.mts`) és a gyártási kapu (`server/studio/gates/variety-gate.ts`) közös forrása.
 * Tiszta modul; a leckét szerkezetileg olvassa (ismeretlen mező nem dob). Jelölés a mért jelentés szerint: E explain, X example,
 * A animate, C check, T try, R recap.
 */
type BlockLike = { kind?: unknown; animKind?: unknown; sourceVisualId?: unknown; correctIndex?: unknown; feedbackPerOption?: unknown };
type SectionLike = { heading?: unknown; blocks: ReadonlyArray<BlockLike> };
type LessonLike = { sections: ReadonlyArray<SectionLike>; experience?: { quiz?: ReadonlyArray<BlockLike> } | unknown };

export const VARIETY_THRESHOLDS = { topPatternShare: 0.35, samePatternProbability: 0.2, topFeedbackOpenerShare: 0.1, maxKindShare: 0.4, minTryShare: 1 / 3 } as const;

const LETTER: Record<string, string> = { explain: "E", example: "X", animate: "A", check: "C", try: "T", recap: "R" };
const round = (x: number) => Math.round(x * 1000) / 1000;
const pairs = (n: number) => (n * (n - 1)) / 2;

export function sectionPattern(section: SectionLike): string {
  return section.blocks.map((b) => LETTER[String(b.kind)] ?? "?").join("");
}

/** A fejezet váza: ábra és try nélkül, az ismétlődő betűk összevonva (a nyitóblokkok és az ábrakészítő beszúrásai nem számítanak). */
export function sectionSkeleton(section: SectionLike): string {
  return sectionPattern(section).replace(/[AT]/g, "").replace(/(.)\1+/g, "$1");
}

export function patternShares(lessons: ReadonlyArray<LessonLike>): Array<{ pattern: string; share: number }> {
  const counts = new Map<string, number>();
  let total = 0;
  for (const l of lessons) for (const s of l.sections) { const p = sectionPattern(s); counts.set(p, (counts.get(p) ?? 0) + 1); total++; }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([pattern, n]) => ({ pattern, share: round(n / total) }));
}

/** Két KÜLÖNBÖZŐ leckéből vett fejezet azonos mintájának valószínűsége. */
export function samePatternProbability(lessons: ReadonlyArray<LessonLike>): number {
  const all = new Map<string, number>();
  let sameWithin = 0, totalWithin = 0, total = 0;
  for (const l of lessons) {
    const own = new Map<string, number>();
    for (const s of l.sections) { const p = sectionPattern(s); own.set(p, (own.get(p) ?? 0) + 1); all.set(p, (all.get(p) ?? 0) + 1); total++; }
    totalWithin += pairs(l.sections.length);
    for (const n of own.values()) sameWithin += pairs(n);
  }
  const cross = pairs(total) - totalWithin;
  if (cross <= 0) return 0;
  const sameAll = [...all.values()].reduce((a, n) => a + pairs(n), 0);
  return round((sameAll - sameWithin) / cross);
}

const firstTwoWords = (text: string) => (text.toLocaleLowerCase("hu-HU").match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 2).join(" ");

function wrongFeedbacks(lesson: LessonLike): string[] {
  const items: BlockLike[] = [
    ...lesson.sections.flatMap((s) => s.blocks.filter((b) => b.kind === "check")),
    ...((lesson.experience as { quiz?: unknown } | undefined)?.quiz && Array.isArray((lesson.experience as { quiz?: unknown }).quiz) ? (lesson.experience as { quiz: BlockLike[] }).quiz : []),
  ];
  return items.flatMap((b) => (Array.isArray(b.feedbackPerOption) ? b.feedbackPerOption : [])
    .filter((f, i): f is string => typeof f === "string" && i !== b.correctIndex));
}

export function feedbackOpenerShares(lessons: ReadonlyArray<LessonLike>): Array<{ opener: string; share: number }> {
  const counts = new Map<string, number>();
  let total = 0;
  for (const l of lessons) for (const f of wrongFeedbacks(l)) { const k = firstTwoWords(f); if (!k) continue; counts.set(k, (counts.get(k) ?? 0) + 1); total++; }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "hu")).map(([opener, n]) => ({ opener, share: round(n / total) }));
}

/** A lecke NEM forráshoz kötött ábráinak fajtánkénti aránya. */
export function animKindShares(lesson: LessonLike): Record<string, number> {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const s of lesson.sections) for (const b of s.blocks) {
    if (b.kind !== "animate" || typeof b.animKind !== "string" || b.sourceVisualId) continue;
    counts[b.animKind] = (counts[b.animKind] ?? 0) + 1; total++;
  }
  return Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, round(n / total)]));
}

export type VarietyMeasure = { lessons: number; sections: number; topPatternShare: number; samePatternProbability: number; topFeedbackOpenerShare: number; tryShare: number };

export function measureVariety(lessons: ReadonlyArray<LessonLike>): VarietyMeasure {
  const sections = lessons.reduce((n, l) => n + l.sections.length, 0);
  const withTry = lessons.reduce((n, l) => n + l.sections.filter((s) => s.blocks.some((b) => b.kind === "try")).length, 0);
  return {
    lessons: lessons.length,
    sections,
    topPatternShare: patternShares(lessons)[0]?.share ?? 0,
    samePatternProbability: samePatternProbability(lessons),
    topFeedbackOpenerShare: feedbackOpenerShares(lessons)[0]?.share ?? 0,
    tryShare: sections ? round(withTry / sections) : 0,
  };
}

export type ThresholdRow = { metric: keyof Omit<VarietyMeasure, "lessons" | "sections">; value: number; threshold: number; ok: boolean };

/** Az állományszintű küszöbök (a `tryShare` alsó, a többi felső korlát). */
export function thresholdReport(m: VarietyMeasure): ThresholdRow[] {
  const t = VARIETY_THRESHOLDS;
  return [
    { metric: "topPatternShare", value: m.topPatternShare, threshold: t.topPatternShare, ok: m.topPatternShare < t.topPatternShare },
    { metric: "samePatternProbability", value: m.samePatternProbability, threshold: t.samePatternProbability, ok: m.samePatternProbability < t.samePatternProbability },
    { metric: "topFeedbackOpenerShare", value: m.topFeedbackOpenerShare, threshold: t.topFeedbackOpenerShare, ok: m.topFeedbackOpenerShare < t.topFeedbackOpenerShare },
    { metric: "tryShare", value: m.tryShare, threshold: round(t.minTryShare), ok: m.tryShare >= t.minTryShare },
  ];
}
