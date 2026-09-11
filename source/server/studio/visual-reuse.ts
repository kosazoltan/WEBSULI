import { checkLessonArc } from "../../shared/lesson-arc";
import { lessonSchema, type Block } from "../../shared/lesson-schema";
import { triangleAreaLabParamsSchema } from "../../shared/triangle-area-lab";
import { decisionStoryParamsSchema } from "../../shared/decision-story";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const texts = (v: unknown): boolean => Array.isArray(v) && v.length >= 2 && v.every(s => typeof s === "string" && s.trim().length > 0);

/** Conservative structural eligibility, never a claim of pedagogical correctness.
 * Missing renderer parameters must not silently reuse the renderer's placeholders.
 * The independent lektor and publication gate still run after reuse.
 */
function hasRenderableData(block: Extract<Block, { kind: "animate" }>): boolean {
  const p = block.params;
  switch (block.animKind) {
    case "triangleArea": return triangleAreaLabParamsSchema.safeParse(p).success;
    case "decisionStory": return decisionStoryParamsSchema.safeParse(p).success;
    case "numberLine": return finite(p.from) && finite(p.to) && p.to > p.from
      && (p.highlightTo === undefined || (finite(p.highlightTo) && p.highlightTo >= p.from && p.highlightTo <= p.to));
    case "fraction": return finite(p.numerator) && finite(p.denominator) && Number.isInteger(p.numerator)
      && Number.isInteger(p.denominator) && p.denominator >= 2 && 12 % p.denominator === 0
      && p.numerator >= 0 && p.numerator <= p.denominator;
    case "geometry": return ["triangle", "circle", "square"].includes(String(p.shape));
    case "process": return texts(p.steps);
    case "timeline": return texts(p.events);
    case "wordBuilder":
    case "sentenceParts": return texts(p.parts);
    case "map": return Array.isArray(p.spots) && p.spots.length > 0 && p.spots.length <= 8 && p.spots.every(s =>
      s && typeof s === "object" && typeof s.label === "string" && s.label.trim() && finite(s.x) && finite(s.y)
      && s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100);
  }
}

export function canReuseLessonVisuals(value: unknown): boolean {
  const parsed = lessonSchema.safeParse(value);
  if (!parsed.success || !checkLessonArc(parsed.data).ok) return false;
  return parsed.data.sections.every(section => {
    const taught = new Set(section.blocks.flatMap(b => b.kind === "explain" || b.kind === "example" ? b.coversConceptIds : []));
    const visuals = section.blocks.filter(b => b.kind === "animate");
    return visuals.length > 0 && visuals.every(b => hasRenderableData(b) && b.coversConceptIds.every(id => taught.has(id)));
  });
}
