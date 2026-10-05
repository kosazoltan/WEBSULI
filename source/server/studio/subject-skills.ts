import { createHash } from "node:crypto";
import type { CatalogSubject, LessonType } from "../../shared/catalog-taxonomy";
import { SUBJECT_SKILL_TEXTS } from "../../shared/subject-skills";
import { LESSON_TYPE_SKILLS } from "../../shared/lesson-type-skills";

/**
 * Spec 2026-10-05-s4-tantargyi-skillek: a tantárgyi + lecketípus-skill betöltője és verziója. A gyártásba kötés (melyik szerep
 * kapja, A/B mérés) az S6 — addig a gyártási modulok NEM importálják (teszt őrzi), így a promptok és a lépés-hashek változatlanok.
 */
export function subjectSkillText(subject: CatalogSubject | null, lessonType: LessonType | null): string {
  const parts = [subject ? SUBJECT_SKILL_TEXTS[subject] ?? "" : "", lessonType ? LESSON_TYPE_SKILLS[lessonType] : ""].filter((s) => s.trim());
  return parts.join("\n\n");
}

/** sha256/12 — a lépés-hashbe kerül (a rendszerprompt `v<hash>` jelölésén át), mint a szerep-skilleknél. */
export function subjectSkillVersion(subject: CatalogSubject | null, lessonType: LessonType | null): string {
  return createHash("sha256").update(subjectSkillText(subject, lessonType)).digest("hex").slice(0, 12);
}

/** Üres, ha nincs se tantárgyi, se típus-skill (ismeretlen tantárgy → nincs blokk, nincs találgatás). */
export function subjectSkillBlock(subject: CatalogSubject | null, lessonType: LessonType | null): string {
  const text = subjectSkillText(subject, lessonType);
  if (!text) return "";
  return `=== TANTÁRGY-SKILL: ${subject ?? "-"} / ${lessonType ?? "-"} (v${subjectSkillVersion(subject, lessonType)}) ===\n${text}\n=== TANTÁRGY-SKILL VÉGE ===`;
}
