import type { Lesson } from "../../shared/lesson-schema";
import { itemFingerprint, type CatalogItemDraft } from "./catalog-item";

/**
 * Spec 2026-10-05-s1-katalogus-kinyeres: a publikált fúziós lecke (`lessons.json`) tudása ugyanabban a tétel-alakban, mint a
 * régi leckéké — fejezet-szöveg (explain/example/recap), kvíz helyes indexszel, nyílt feladat kulcsszó-csoportokkal + mintával,
 * módszer. Determinisztikus, modellhívás nélkül.
 */
export function extractFusionLesson(lesson: Lesson, provenance: string): CatalogItemDraft[] {
  const items: CatalogItemDraft[] = [];
  const seen = new Set<string>();
  const push = (d: Omit<CatalogItemDraft, "fingerprint" | "provenance">) => {
    const fingerprint = itemFingerprint(d);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    items.push({ ...d, provenance, fingerprint });
  };
  for (const section of lesson.sections) {
    const text = section.blocks.flatMap((b) => {
      if (b.kind === "explain") return [b.text];
      if (b.kind === "example") return [`Példa: ${b.problem}\n${b.steps.join("\n")}\nEredmény: ${b.answer}`];
      if (b.kind === "recap") return b.bullets;
      return [];
    }).join("\n\n").trim();
    const ids = [...new Set(section.blocks.flatMap((b) => ("coversConceptIds" in b ? b.coversConceptIds : [])))];
    if (text) push({ kind: "section", prompt: section.heading, body: text, conceptIds: ids, shape: "fusion.section" });
  }
  const ex = lesson.experience;
  if (!ex) return items;
  for (const q of ex.quiz) push({ kind: "quiz", prompt: q.question, options: q.options, correctIndex: q.correctIndex, conceptIds: q.coversConceptIds, shape: "fusion.quiz" });
  for (const t of ex.tasks) push({ kind: "open_task", prompt: t.q, keywordGroups: t.required, body: t.sample, conceptIds: t.coversConceptIds, shape: "fusion.task" });
  for (const m of ex.methods) push({ kind: "method", prompt: m.prompt, body: m.answer, ...(m.options ? { options: m.options } : {}), ...(m.correctIndex !== undefined ? { correctIndex: m.correctIndex } : {}), conceptIds: m.coversConceptIds, shape: `fusion.method.${m.kind}` });
  return items;
}
