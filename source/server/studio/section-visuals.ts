import type { Lesson } from "../../shared/lesson-schema";

type Block = Lesson["sections"][number]["blocks"][number];
type ConceptTerm = { localId: string; term?: string };

/**
 * Spec 2026-09-19 — every chapter gets a visual, deterministically.
 *
 * Measured on the owner's UK-geography run (job 1eeac4fd, round 0): the lektor blocked with
 * "Fejezetenként hiányzik a kötelező megértést segítő érdemi ábra" and a whole author round
 * was spent on it. When the animator leaves a section without an `animate` block, the
 * section's own worked example becomes a `process` visual (its solution steps, verbatim —
 * the same content the target lesson shows as "A számolás menete"). Sections without a
 * multi-step example are left alone: an invented figure would be worse than none.
 *
 * The caption names the example's concepts (their map terms), because the label check
 * (`stripUngroundedAnimateLabels`, #196) grounds every `coversConceptIds` entry in the block's
 * own text: a caption without the term would lose its label and the block with it — the
 * figure would silently vanish before the lektor (found by the runner test, 2026-09-19).
 */
export function ensureSectionVisuals(lesson: Lesson, concepts: ReadonlyArray<ConceptTerm> = []): { lesson: Lesson; added: number[] } {
  const termOf = new Map(concepts.map((c) => [c.localId, c.term?.trim()] as const));
  const added: number[] = [];
  const sections = lesson.sections.map((section, index) => {
    if (section.blocks.some((b) => b.kind === "animate")) return section;
    const exampleIndex = section.blocks.findIndex((b) => b.kind === "example" && b.steps.length >= 2 && b.coversConceptIds.length > 0);
    if (exampleIndex === -1) return section;
    const example = section.blocks[exampleIndex] as Extract<Block, { kind: "example" }>;
    const terms = [...new Set(example.coversConceptIds.map((id) => termOf.get(id)).filter((t): t is string => !!t))];
    const visual: Block = {
      kind: "animate",
      animKind: "process",
      params: { steps: example.steps.slice(0, 8) },
      caption: `A megoldás menete lépésről lépésre${terms.length ? ` (${terms.join(", ")})` : ""}: ${example.problem.slice(0, 120)}`,
      coversConceptIds: [...example.coversConceptIds],
    };
    added.push(index);
    const blocks = [...section.blocks];
    blocks.splice(exampleIndex + 1, 0, visual);
    return { ...section, blocks };
  });
  return { lesson: added.length ? { ...lesson, sections } : lesson, added };
}

/** Recorded as the animator step's "model" when no model call was needed. */
export const SECTION_VISUALS_TOOL = "tool:section-visuals";

/**
 * Eszköz (2026-09-19): ha minden fejezet kap ábrát a saját levezetett példájából (vagy már van),
 * az animátor MODELLHÍVÁSA kimarad — a determinisztikus lecke megy tovább. Ha marad ábra nélküli
 * fejezet, `null`: akkor a modell dolgozik, mint eddig.
 */
export function deterministicSectionVisuals(lesson: Lesson | undefined, concepts: ReadonlyArray<ConceptTerm> = []): Lesson | null {
  if (!lesson) return null;
  const { lesson: withVisuals } = ensureSectionVisuals(lesson, concepts);
  return withVisuals.sections.every((s) => s.blocks.some((b) => b.kind === "animate")) ? withVisuals : null;
}
