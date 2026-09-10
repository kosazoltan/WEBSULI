import { createHash } from "node:crypto";
import { lessonSchema } from "../../shared/lesson-schema";
import { isPlayableQuestion } from "../../shared/game-quiz-contract";

export type CanonicalLessonRow = { id: string; json: unknown; htmlFileId: string | null; version: number };
export type CanonicalQuizRow = {
  id: string; gameId: string; tier: string; topic: string | null; prompt: string; options: string[]; correctIndex: number;
  explanation: string | null; feedbackPerOption: string[]; sourceMaterialId: string | null;
  lessonId: string; questionId: string; questionVersion: string; coversConceptIds: string[];
};

/** Keep subject identity; an unknown subject must not turn into English or mathematics. */
export function quizTopic(subject: string): string {
  if (/angol|english/i.test(subject)) return "english";
  if (/matematik|matek|math/i.test(subject)) return "math";
  if (/természet|környezet|biológ|földrajz|fizik|kémi/i.test(subject)) return "nature";
  if (/magyar|irodalom/i.test(subject)) return "hungarian";
  return subject.trim();
}

/** The stored lesson is the canonical bank. Game identity never changes question identity.
 * A content change creates a new version; reordering or changing unrelated questions does not.
 */
export function canonicalLessonQuiz(row: CanonicalLessonRow, gameId = "space-asteroid-quiz"): CanonicalQuizRow[] | null {
  // null means legacy. An invalid fusion bank must never revive stale exports.
  if (!row.json || typeof row.json !== "object" || !("experience" in row.json) || row.json.experience == null) return null;
  const parsed = lessonSchema.safeParse(row.json);
  if (!parsed.success || !parsed.data.experience) return [];
  const quiz = parsed.data.experience.quiz;
  if (new Set(quiz.map(q => q.id)).size !== quiz.length || quiz.some(q => !isPlayableQuestion({ ...q, prompt: q.question }))) return [];
  return quiz.map(q => {
    const questionVersion = createHash("sha256").update(JSON.stringify([
      q.question, q.options, q.correctIndex, q.feedbackPerOption, [...q.coversConceptIds].sort(),
    ])).digest("hex");
    const id = createHash("sha256").update(JSON.stringify(["lesson-quiz-1", row.id, q.id, questionVersion])).digest("hex");
    return {
      id, gameId, tier: "easy", topic: quizTopic(parsed.data.subject), prompt: q.question, options: q.options,
      correctIndex: q.correctIndex, explanation: q.feedbackPerOption[q.correctIndex], feedbackPerOption: q.feedbackPerOption,
      sourceMaterialId: row.htmlFileId, lessonId: row.id, questionId: q.id, questionVersion, coversConceptIds: q.coversConceptIds,
    };
  });
}

/** Query results arrive newest version first. Only that published version supplies a material. */
export function canonicalBanks(rows: CanonicalLessonRow[], gameId?: string): { items: CanonicalQuizRow[]; materialIds: Set<string>; lessonIds: Set<string> } {
  const items: CanonicalQuizRow[] = [];
  const materialIds = new Set<string>();
  const lessonIds = new Set<string>();
  const visited = new Set<string>();
  for (const row of rows) {
    const identity = row.htmlFileId ?? row.id;
    if (visited.has(identity)) continue;
    visited.add(identity);
    const bank = canonicalLessonQuiz(row, gameId);
    if (bank === null) continue;
    items.push(...bank);
    lessonIds.add(row.id);
    if (row.htmlFileId) materialIds.add(row.htmlFileId);
  }
  return { items, materialIds, lessonIds };
}
