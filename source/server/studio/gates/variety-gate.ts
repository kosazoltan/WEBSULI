import { SECTION_SHAPES } from "../../../shared/lesson-section-shapes";
import { sectionRoleOf } from "../../../shared/lesson-ui-text";
import { hasLegacyOpener } from "../../../shared/lesson-feedback-openers";
import { VARIETY_THRESHOLDS, animKindShares, sectionSkeleton } from "../../../shared/variety-metrics";
import { registerGate, type GateInput, type GateResult } from "./types";

/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (15. szakasz; alap: TGM-terv SK2): a változatosság leckeszintű kapuja. Tiszta
 * függvény — modell és adatbázis nélkül.
 * (a) KAPU: minden fogalom-fejezet váza (`sectionSkeleton`: ábra és try nélkül, ismétlés összevonva) egy készletbeli minta váza. A kiosztott
 *     mintát nem mentjük (terv 12. szakasz 5. pont), ezért bármely készletbeli minta elfogadott; a különleges fejezetek nem számítanak.
 * (b) JELZÉS (a kapu kimenetét nem rontja): régi bátorító előtag a visszajelzésben, `try`-arány 1/3 alatt, egy ábrafajta > 40%.
 */
const ALLOWED = new Set(SECTION_SHAPES.flatMap((s) => {
  const skeleton = sectionSkeleton({ blocks: s.blocks.map((kind) => ({ kind })) });
  return [skeleton, skeleton.endsWith("R") ? skeleton : `${skeleton}R`];
}));

type Block = { kind?: unknown; feedbackPerOption?: unknown; correctIndex?: unknown; animKind?: unknown; sourceVisualId?: unknown };
type Section = { heading?: unknown; blocks: ReadonlyArray<Block> };

export function varietyGate(input: GateInput): GateResult {
  const sections = input.lesson.sections as ReadonlyArray<Section>;
  const problems: string[] = [];
  let measured = 0;
  sections.forEach((section, i) => {
    const heading = typeof section.heading === "string" ? section.heading : "";
    if (heading && sectionRoleOf(heading) !== null) return;
    measured++;
    const skeleton = sectionSkeleton(section);
    if (!ALLOWED.has(skeleton)) problems.push(`„${heading || `${i + 1}. fejezet`}” (${i + 1}. fejezet): a váz (${skeleton}) nem a fejezetmintakészletből való.`);
  });
  const legacyOpeners = sections.flatMap((s) => s.blocks).filter((b) => b.kind === "check")
    .flatMap((b) => (Array.isArray(b.feedbackPerOption) ? b.feedbackPerOption : []))
    .filter((f): f is string => typeof f === "string" && hasLegacyOpener(f)).length;
  const withTry = sections.filter((s) => s.blocks.some((b) => b.kind === "try")).length;
  const tryShare = sections.length ? withTry / sections.length : 0;
  const kindShares = Object.values(animKindShares({ sections }));
  const visuals = sections.flatMap((s) => s.blocks).filter((b) => b.kind === "animate" && !b.sourceVisualId).length;
  return {
    gate: "variety",
    ok: problems.length === 0,
    problems,
    metrics: {
      measuredSections: measured,
      skeletonMisses: problems.length,
      legacyOpeners,
      tryShareBelowMin: tryShare < VARIETY_THRESHOLDS.minTryShare ? 1 : 0,
      kindShareOver: visuals >= 5 && kindShares.some((s) => s > VARIETY_THRESHOLDS.maxKindShare) ? 1 : 0,
    },
  };
}

registerGate("variety", varietyGate);
