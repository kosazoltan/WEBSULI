import { z } from "zod";
import { evaluateOpenAnswer, scoreSummary, type AnswerScore } from "./lesson-experience-score";

/**
 * Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md) — tiszta modul, DB és hálózat nélkül:
 * a beküldés sémája, a SZERVEROLDALI újrapontozás (a kliens pontszámát nem fogadjuk), és a levél (minden szöveg escape-elve).
 */
const roundId = z.string().regex(/^[a-z0-9-]{4,64}$/);
const id = z.string().min(1).max(80);
// Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S2): a párosított eszköz tokenje — a szerver ellenőrzi.
const learner = z.string().max(120).optional();
export const resultRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tasks"), roundId, answers: z.record(id, z.string().max(4000)).refine(r => Object.keys(r).length <= 60, "Legfeljebb 60 válasz."), fingerprint: z.string().max(80).optional(), learner }).strict(),
  z.object({ kind: z.literal("quiz"), roundId, picks: z.record(id, z.number().int().min(-1).max(7)).refine(r => Object.keys(r).length <= 100, "Legfeljebb 100 kérdés."), fingerprint: z.string().max(80).optional(), learner }).strict(),
]);
export type ResultRequest = z.infer<typeof resultRequestSchema>;

type OpenTask = Parameters<typeof evaluateOpenAnswer>[1] & { id: string; q: string };
type QuizItem = { id: string; question: string; options: string[]; correctIndex: number };
export type ArbiterLookup = (task: OpenTask, answer: string) => { state: AnswerScore["state"]; score: number } | null | undefined;

export type GradedTasks = { kind: "tasks"; rows: Array<{ q: string; answer: string; state: AnswerScore["state"]; score: number }>; summary: ReturnType<typeof scoreSummary> };
export type GradedQuiz = { kind: "quiz"; wrong: Array<{ question: string; picked: string | null; correct: string }>; summary: ReturnType<typeof scoreSummary> };

/** Csak az ismert feladatokat pontozza; a döntőbíró gyorsítótár-ítélete (ha van) csak emelhet — mint a tanuló képernyőjén. */
export function gradeTasks(tasks: readonly OpenTask[], answers: Record<string, string>, arbiter?: ArbiterLookup): GradedTasks {
  const rows: GradedTasks["rows"] = [];
  for (const [taskId, raw] of Object.entries(answers)) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) continue;
    const answer = raw.trim();
    const det = evaluateOpenAnswer(answer, task);
    const arb = answer ? arbiter?.(task, answer) : null;
    const best = arb && arb.score > det.score ? { state: arb.state, score: arb.score } : { state: det.state, score: det.score };
    rows.push({ q: task.q, answer, ...best });
  }
  return { kind: "tasks", rows, summary: scoreSummary(rows.reduce((s, r) => s + r.score, 0), rows.length) };
}

/**
 * A kör ÖSSZES kérdését kapja; a kihagyott kérdés jele -1 (review #280: különben 1 helyes + 24 kihagyás 100%-ot adna a képernyő 4%-a
 * helyett). A kihagyás nulla pont, és a hibás kérdések között „nincs válasz”-ként szerepel.
 */
export function gradeQuiz(quiz: readonly QuizItem[], picks: Record<string, number>): GradedQuiz {
  const asked = Object.entries(picks).map(([qid, pick]) => ({ item: quiz.find(q => q.id === qid), pick })).filter((x): x is { item: QuizItem; pick: number } => !!x.item);
  const wrong = asked.filter(x => x.pick !== x.item.correctIndex).map(x => ({ question: x.item.question, picked: x.pick >= 0 ? x.item.options[x.pick] ?? null : null, correct: x.item.options[x.item.correctIndex] }));
  return { kind: "quiz", wrong, summary: scoreSummary(asked.length - wrong.length, asked.length) };
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const MARK = { ok: "✅", partial: "🟡", fail: "❌" } as const;

export function buildResultEmail(input: { lessonTitle: string; classroom: number; learner: string; learnerFirst?: string; url: string; graded: GradedTasks | GradedQuiz }): { subject: string; html: string } {
  const { graded } = input;
  const part = graded.kind === "tasks" ? "Feladatok" : "Kvíz";
  const s = graded.summary;
  const subject = `[WebSuli eredmény] ${input.learnerFirst ? `${input.learnerFirst} – ` : ""}${input.lessonTitle} — ${part} — ${s.percent}% (${s.label})`.slice(0, 200);
  const head = `<h2>${esc(input.lessonTitle)} — ${part}</h2>
<p><strong>Tanuló:</strong> ${esc(input.learner)}<br><strong>Évfolyam:</strong> ${input.classroom}. osztály<br>
<strong>Eredmény:</strong> ${s.points} / ${s.total} pont — ${s.percent}% — ${s.grade} (${esc(s.label)})</p>`;
  const body = graded.kind === "tasks"
    ? `<ol>${graded.rows.map(r => `<li><p><strong>${esc(r.q)}</strong></p><p>${MARK[r.state]} ${r.answer ? esc(r.answer) : "<em>(nem válaszolt)</em>"}</p></li>`).join("")}</ol>`
    : graded.wrong.length
      ? `<p><strong>Hibás válaszok:</strong></p><ol>${graded.wrong.map(w => `<li><p>${esc(w.question)}</p><p>❌ ${w.picked ? esc(w.picked) : "<em>(nincs válasz)</em>"} — helyes: ${esc(w.correct)}</p></li>`).join("")}</ol>`
      : "<p>Minden kérdésre helyes választ adott.</p>";
  return { subject, html: `${head}${body}<p><a href="${esc(input.url)}">A lecke megnyitása</a></p>` };
}
