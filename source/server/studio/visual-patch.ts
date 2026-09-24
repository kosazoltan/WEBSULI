import { z } from "zod";
import { ANIM_KINDS, blockSchema, type Block, type Lesson } from "../../shared/lesson-schema";
import { visualParamProblems } from "../../shared/lesson-visual-params";

/**
 * Spec 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md, 3. szelet): az ábrakészítő CSAK az
 * ábrákat adja vissza, a program illeszti be őket.
 *
 * Eddig a modell a teljes leckét visszaírta; erős (Claude Opus 5.5) modellel ez drága és lassú volna,
 * és a tanítás véletlen átírását csak utólag lehetett kiszűrni. A folt alakja:
 *   { "sections": [{ "index": 0, "visuals": [{ "after": 2, "replace"?: 3, "animKind": …, "params": …,
 *     "caption": …, "coversConceptIds": [...] }] }] }
 * A nem-animate blokkok így szerkezetileg érintetlenek. Az érvénytelen ábra kimarad (okkal naplózva);
 * a fejezet meglévő ábrája csak kifejezett `replace`-szel cserélődik.
 */

const visualSchema = z.object({
  after: z.number().int().min(-1).optional(),
  replace: z.number().int().min(0).optional(),
  animKind: z.enum(ANIM_KINDS),
  params: z.record(z.unknown()),
  caption: z.string().trim().min(1).max(500),
  coversConceptIds: z.array(z.string().trim().min(1).max(64)).min(1),
});
export const visualPatchSchema = z.object({
  sections: z.array(z.object({ index: z.number().int().min(0), visuals: z.array(z.unknown()).max(4) })).min(1),
});

export type VisualPatchResult = { lesson: Lesson; added: number; replaced: number; rejected: string[] };

/** A folt a leckébe illesztve, vagy `null`, ha a válasz nem folt (pl. régi alakú teljes lecke). */
export function applyVisualPatch(original: Lesson, json: unknown): VisualPatchResult | null {
  const patch = visualPatchSchema.safeParse(json);
  if (!patch.success) return null;
  const rejected: string[] = [];
  let added = 0, replaced = 0;
  const sections = original.sections.map((section) => ({ ...section, blocks: [...section.blocks] }));
  for (const entry of patch.data.sections) {
    const section = sections[entry.index];
    if (!section) { rejected.push(`${entry.index + 1}. fejezet: nincs ilyen fejezet`); continue; }
    const taught = new Set(section.blocks.flatMap((b) => ("coversConceptIds" in b ? b.coversConceptIds : [])));
    // Apply from the highest position down so earlier indices stay valid (they refer to the original blocks).
    const items = entry.visuals.map((raw, n) => ({ raw, n, parsed: visualSchema.safeParse(raw) }));
    const valid: Array<{ block: Block; after: number; replace?: number }> = [];
    for (const { parsed, n } of items) {
      const where = `${entry.index + 1}. fejezet ${n + 1}. ábra`;
      if (!parsed.success) { rejected.push(`${where}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`); continue; }
      const v = parsed.data;
      const problems = visualParamProblems(v.animKind, v.params);
      const block = blockSchema.safeParse({ kind: "animate", animKind: v.animKind, params: v.params, caption: v.caption, coversConceptIds: v.coversConceptIds });
      if (!block.success) problems.push(...block.error.issues.map((i) => `${i.path.join(".")} ${i.message}`));
      const foreign = v.coversConceptIds.filter((id) => !taught.has(id));
      if (foreign.length) problems.push(`a fejezetben nem tanított fogalom: ${foreign.join(", ")}`);
      if (v.replace !== undefined && section.blocks[v.replace]?.kind !== "animate") problems.push(`a ${v.replace}. blokk nem ábra, nem cserélhető`);
      if (problems.length || !block.success) { rejected.push(`${where} (${v.animKind}): ${problems.join("; ")}`); continue; }
      valid.push({ block: block.data, after: Math.min(v.after ?? section.blocks.length - 1, section.blocks.length - 1), replace: v.replace });
    }
    const replacements = new Map(valid.filter((v) => v.replace !== undefined).map((v) => [v.replace!, v.block] as const));
    const inserts = valid.filter((v) => v.replace === undefined);
    const blocks: Block[] = [];
    // Visuals that go before the first block (after = -1).
    for (const v of inserts.filter((i) => i.after < 0)) { blocks.push(v.block); added++; }
    section.blocks.forEach((b, i) => {
      if (replacements.has(i)) { blocks.push(replacements.get(i)!); replaced++; } else blocks.push(b);
      for (const v of inserts.filter((x) => x.after === i)) { blocks.push(v.block); added++; }
    });
    section.blocks = blocks;
  }
  return { lesson: { ...original, sections }, added, replaced, rejected };
}
