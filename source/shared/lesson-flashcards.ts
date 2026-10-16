import type { Lesson } from "./lesson-schema";

/**
 * Websuli Design §3/§6 — memóriakártyák a lecke saját, már ellenőrzött anyagából (docs/specs/2026-10-16-websuli-ismetles.md).
 * Determinisztikus: a kliens és a szerver ugyanazt a listát számolja, a szerver így ellenőrzi a beküldött kártya-azonosítót.
 * - a kvíz felidéző kérdései (az `apply` kimarad): előlap a kérdés, hátlap a helyes válasz;
 * - nyelvi leckénél a szószedet: előlap a szó, hátlap a fordítás.
 */
export type Flashcard = { id: string; front: string; back: string; kind: "quiz" | "glossary" };
export const FLASHCARD_ID_MAX = 80;

export function lessonFlashcards(lesson: Pick<Lesson, "experience">): Flashcard[] {
  const e = lesson.experience;
  if (!e) return [];
  const cards: Flashcard[] = e.quiz
    .filter(q => q.intent !== "apply")
    .map(q => ({ id: `q:${q.id}`, front: q.question, back: q.options[q.correctIndex], kind: "quiz" as const }));
  if (e.language) e.glossary.forEach((g, i) => cards.push({ id: `g:${i}`, front: g.word, back: g.translation, kind: "glossary" }));
  return cards.filter(c => c.id.length <= FLASHCARD_ID_MAX && c.front.trim() && c.back?.trim());
}
