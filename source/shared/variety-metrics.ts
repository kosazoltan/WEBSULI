/**
 * SK2 — a lecke-változatosság gépi mérőszámai (docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md, SK2).
 * Tiszta függvények: a mérőszkript (scripts/measure/variety-measure.mts) és a leckeszintű kapu is ezt használja.
 *
 * Tulajdonosi döntés 2026-11-22 („NINCS LEVÁGÁS”, shared/lesson-feedback-openers.ts): a régi bátorító nyitást a kód NEM vágja le —
 * itt csak megszámoljuk (a spec eredeti `stripLegacyOpener` lépése ezzel a döntéssel elavult).
 */
import { startsWithLegacyOpener } from "./lesson-feedback-openers";

export type VarietyBlock = { kind: string; animKind?: string; feedbackPerOption?: readonly string[]; correctIndex?: number };
export type VarietySection = { blocks: readonly VarietyBlock[] };
export type VarietyLesson = { sections: readonly VarietySection[] };

export const VARIETY_THRESHOLDS = {
  topPatternShare: 0.35,
  samePatternProbability: 0.2,
  topFeedbackOpenerShare: 0.1,
  maxKindShare: 0.4,
  minTryShare: 1 / 3,
} as const;

/** Review #664: a jelentés NYERS értékeket tartalmaz (a küszöbdöntés kerekítés nélkül); kerekítés csak a megjelenítésben. */
export const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** A fejezet mintája: a blokkfajták sora („explain,example,check”). */
export function sectionPattern(section: VarietySection): string {
  return section.blocks.map((b) => b.kind).join(",");
}

function shares(counts: Map<string, number>): Map<string, number> {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return new Map([...counts].map(([k, c]) => [k, total ? c / total : 0]));
}

function countBy<T>(items: readonly T[], key: (t: T) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k !== null) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Az összes fejezet mintáinak aránya (a leckék összes fejezete egy állományban). */
export function patternShares(lessons: readonly VarietyLesson[]): Map<string, number> {
  return shares(countBy(lessons.flatMap((l) => l.sections), sectionPattern));
}

/** Két véletlen fejezet azonos mintájának valószínűsége: Σ p². Üres állományon 0. */
export function samePatternProbability(lessons: readonly VarietyLesson[]): number {
  return [...patternShares(lessons).values()].reduce((a, p) => a + p * p, 0);
}

/** A visszajelzések nyitása: az első két szó (írásjel nélkül, kisbetűsítve). */
export function feedbackOpener(text: string): string | null {
  const words = text.trim().split(/\s+/u).slice(0, 2).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase()).filter(Boolean);
  return words.length ? words.join(" ") : null;
}

function feedbacks(lessons: readonly VarietyLesson[]): string[] {
  return lessons.flatMap((l) => l.sections.flatMap((s) => s.blocks.flatMap((b) => b.feedbackPerOption ?? [])));
}

/** Review #664: a HIBÁS válaszok visszajelzései (a helyes opcióé nélkül) — az alapvonal (0,468) is ezen a halmazon mért. */
function wrongFeedbacks(lessons: readonly VarietyLesson[]): string[] {
  return lessons.flatMap((l) => l.sections.flatMap((s) => s.blocks.flatMap((b) => (b.feedbackPerOption ?? []).filter((_, i) => i !== b.correctIndex))));
}

/** A hibás válaszok visszajelzés-nyitásainak (első két szó) aránya az állományban. */
export function feedbackOpenerShares(lessons: readonly VarietyLesson[]): Map<string, number> {
  return shares(countBy(wrongFeedbacks(lessons), feedbackOpener));
}

/** A régi bátorító nyitással kezdődő visszajelzések száma (csak számlálás, a szöveg változatlan). */
export function legacyOpenerCount(lessons: readonly VarietyLesson[]): number {
  return feedbacks(lessons).filter((t) => startsWithLegacyOpener(t.trim())).length;
}

/** Egy lecke ábrafajtáinak (animate.animKind) aránya. */
export function animKindShares(lesson: VarietyLesson): Map<string, number> {
  return shares(countBy(lesson.sections.flatMap((s) => s.blocks.filter((b) => b.kind === "animate")), (b) => b.animKind ?? "ismeretlen"));
}

/** A `try` blokkot tartalmazó fejezetek aránya a leckében (nyers, kerekítés nélkül). */
export function tryShare(lesson: VarietyLesson): number {
  return lesson.sections.length ? lesson.sections.filter((s) => s.blocks.some((b) => b.kind === "try")).length / lesson.sections.length : 0;
}

const maxShare = (m: Map<string, number>) => (m.size ? Math.max(...m.values()) : 0);

export type VarietyReport = {
  lessons: number;
  sections: number;
  topPatternShare: number;
  samePatternProbability: number;
  topFeedbackOpenerShare: number;
  legacyOpeners: number;
  /** Azon leckék aránya, ahol egy ábrafajta a lecke ábráinak > maxKindShare része (legalább 3 ábránál). */
  kindHeavyLessonShare: number;
  /** Azon leckék aránya, ahol a try-arány < minTryShare. */
  lowTryLessonShare: number;
};

/** Állományszintű jelentés: a küszöbökhöz mért számok. */
export function varietyReport(lessons: readonly VarietyLesson[]): VarietyReport {
  const n = lessons.length;
  const kindHeavy = lessons.filter((l) => {
    const anims = l.sections.flatMap((s) => s.blocks).filter((b) => b.kind === "animate").length;
    return anims >= 3 && maxShare(animKindShares(l)) > VARIETY_THRESHOLDS.maxKindShare;
  }).length;
  const lowTry = lessons.filter((l) => 3 * l.sections.filter((s) => s.blocks.some((b) => b.kind === "try")).length < l.sections.length).length;
  return {
    lessons: n,
    sections: lessons.reduce((a, l) => a + l.sections.length, 0),
    topPatternShare: maxShare(patternShares(lessons)),
    samePatternProbability: samePatternProbability(lessons),
    topFeedbackOpenerShare: maxShare(feedbackOpenerShares(lessons)),
    legacyOpeners: legacyOpenerCount(lessons),
    kindHeavyLessonShare: n ? kindHeavy / n : 0,
    lowTryLessonShare: n ? lowTry / n : 0,
  };
}

/** Az állományszintű küszöbök (a három „kapu” mérőszám) — melyik nem teljesül. */
export function failedThresholds(r: VarietyReport): string[] {
  const out: string[] = [];
  if (r.topPatternShare > VARIETY_THRESHOLDS.topPatternShare) out.push("topPatternShare");
  if (r.samePatternProbability > VARIETY_THRESHOLDS.samePatternProbability) out.push("samePatternProbability");
  if (r.topFeedbackOpenerShare > VARIETY_THRESHOLDS.topFeedbackOpenerShare) out.push("topFeedbackOpenerShare");
  return out;
}
