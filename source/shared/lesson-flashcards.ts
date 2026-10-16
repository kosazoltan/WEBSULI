import type { Lesson } from "./lesson-schema";

/**
 * Websuli Design §3/§6 — memóriakártyák a lecke saját, már ellenőrzött anyagából (docs/specs/2026-10-16-websuli-ismetles.md).
 * Determinisztikus: a kliens és a szerver ugyanazt a listát számolja, a szerver így ellenőrzi a beküldött kártya-azonosítót.
 * - a kvíz felidéző kérdései (az `apply` kimarad): előlap a kérdés, hátlap a helyes válasz;
 * - nyelvi leckénél a szószedet: előlap a szó, hátlap a fordítás.
 */
export type Flashcard = { id: string; front: string; back: string; kind: "quiz" | "glossary" };
export const FLASHCARD_ID_MAX = 80;

/**
 * Review #268: a kártya-azonosító a tartalomhoz kötött. A javítás ugyanazt a `lessons.id` sort írja felül (csak a verzió nő), ezért
 * a megváltozott kérdés vagy szószedetelem új azonosítót és így új ütemezést kap; a változatlan kártya megtartja a sajátját, a régi
 * oldalról érkező, elavult azonosítót a szerver elutasítja. cyrb53 (53 bites, szinkron, böngészőben és Node-ban is), 36-os alapon.
 */
export function contentKey(front: string, back: string): string {
  // Review #269: NFC előtt — a kliens a megjelenítéshez NFC-re normalizált leckéből, a szerver a tárolt (akár NFD) JSON-ból számol.
  const text = `${front}\u0000${back}`.normalize("NFC");
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function lessonFlashcards(lesson: Pick<Lesson, "experience">): Flashcard[] {
  const e = lesson.experience;
  if (!e) return [];
  const cards: Flashcard[] = e.quiz
    .filter(q => q.intent !== "apply")
    .map(q => ({ id: `q:${q.id}:${contentKey(q.question, q.options[q.correctIndex] ?? "")}`, front: q.question, back: q.options[q.correctIndex], kind: "quiz" as const }));
  if (e.language) e.glossary.forEach(g => cards.push({ id: `g:${contentKey(g.word, g.translation)}`, front: g.word, back: g.translation, kind: "glossary" }));
  // Egyforma szószedetelem kétszer nem lesz kártya (azonos tartalom → azonos azonosító).
  return cards.filter((c, i) => c.id.length <= FLASHCARD_ID_MAX && c.front.trim() && c.back?.trim() && cards.findIndex(o => o.id === c.id) === i);
}
