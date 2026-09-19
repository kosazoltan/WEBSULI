import type { Lesson } from "../../shared/lesson-schema";

type Block = Lesson["sections"][number]["blocks"][number];

/**
 * Spec 2026-09-19 — every chapter gets a visual, deterministically.
 *
 * Measured on the owner's UK-geography run (job 1eeac4fd, round 0): the lektor blocked with
 * "Fejezetenként hiányzik a kötelező megértést segítő érdemi ábra" and a whole author round
 * was spent on it. When the animator leaves a section without an `animate` block, the
 * section's own worked example becomes a `process` visual (its solution steps, verbatim —
 * the same content the target lesson shows as "A számolás menete"). Sections without a
 * multi-step example are left alone: an invented figure would be worse than none.
 */
export function ensureSectionVisuals(lesson: Lesson): { lesson: Lesson; added: number[] } {
  const added: number[] = [];
  const sections = lesson.sections.map((section, index) => {
    if (section.blocks.some((b) => b.kind === "animate")) return section;
    const exampleIndex = section.blocks.findIndex((b) => b.kind === "example" && b.steps.length >= 2 && b.coversConceptIds.length > 0);
    if (exampleIndex === -1) return section;
    const example = section.blocks[exampleIndex] as Extract<Block, { kind: "example" }>;
    const visual: Block = {
      kind: "animate",
      animKind: "process",
      params: { steps: example.steps.slice(0, 8) },
      caption: `A megoldás menete lépésről lépésre: ${example.problem.slice(0, 120)}`,
      coversConceptIds: [...example.coversConceptIds],
    };
    added.push(index);
    const blocks = [...section.blocks];
    blocks.splice(exampleIndex + 1, 0, visual);
    return { ...section, blocks };
  });
  return { lesson: added.length ? { ...lesson, sections } : lesson, added };
}
