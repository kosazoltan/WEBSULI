import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { arbiterVerdicts, lessonResultEmails, lessons, users } from "../shared/schema";
import { lessonSchema } from "../shared/lesson-schema";
import { buildResultEmail, gradeQuiz, gradeTasks, resultRequestSchema, type GradedQuiz, type GradedTasks } from "../shared/lesson-result-email";
import { resolveAdminRecipients } from "./lib/material-result";
import { arbiterCacheKey } from "./arbiter/arbiter";
import { getMaterialPreviewUrl } from "./utils/config";
import type { AttemptAnswer, AttemptQuestion } from "../shared/lesson-attempt";
import { logger } from "./lib/logger";

/**
 * Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md) — „motorháztető alatt”: a tanuló felülete
 * nem függ tőle. Körönként egy levél (lesson_result_emails egyedi kulcs), a pontozás a szerveren fut (a kliens pontszámát nem
 * fogadjuk), a címzettek az ADMIN_EMAILS listája.
 */
export type Sender = (subject: string, html: string, to: string) => Promise<unknown>;
let sender: Sender | null = null;
/** Teszthez: a valódi Resend-küldő helyett. */
export function setResultSender(next: Sender | null) { sender = next; }
async function send(subject: string, html: string, to: string) {
  if (sender) return sender(subject, html, to);
  // Biztonság: tesztfuttatásban (NODE_ENV=test) valódi levél sosem megy, csak a teszt által beállított küldőn át.
  if (process.env.NODE_ENV === "test") throw new Error("Tesztkörnyezetben nincs valódi e-mail-küldés.");
  const { sendAdminNotification } = await import("./resend");
  return sendAdminNotification(subject, html, to);
}

export const roundKeyOf = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex");

/** Küldés a címzettlistának; ugyanaz a kör (lecke, fajta, roundKey) csak egyszer. Sosem dob — a hiba a naplóba megy. */
export async function sendLessonResult(input: { lessonId: string; roundKey: string; learner: string; graded: GradedTasks | GradedQuiz }): Promise<{ sent: number; duplicate: boolean }> {
  try {
    const [row] = await db.select({ json: lessons.json, htmlFileId: lessons.htmlFileId }).from(lessons).where(eq(lessons.id, input.lessonId));
    const lesson = row ? lessonSchema.safeParse(row.json) : null;
    if (!row || !lesson?.success) return { sent: 0, duplicate: false };
    const [claimed] = await db.insert(lessonResultEmails)
      .values({ lessonId: input.lessonId, kind: input.graded.kind, roundKey: input.roundKey, percent: input.graded.summary.percent })
      .onConflictDoNothing().returning({ id: lessonResultEmails.id });
    if (!claimed) return { sent: 0, duplicate: true };
    const recipients = resolveAdminRecipients({ ADMIN_EMAILS: process.env.ADMIN_EMAILS, ADMIN_EMAIL: process.env.ADMIN_EMAIL });
    if (!recipients.length) { logger.warn("[LESSON-RESULT] nincs címzett (ADMIN_EMAILS)"); return { sent: 0, duplicate: false }; }
    const mail = buildResultEmail({ lessonTitle: lesson.data.title, classroom: lesson.data.classroom, learner: input.learner,
      url: row.htmlFileId ? getMaterialPreviewUrl(row.htmlFileId) : "", graded: input.graded });
    const results = await Promise.allSettled(recipients.map(to => send(mail.subject, mail.html, to)));
    const sent = results.filter(r => r.status === "fulfilled").length;
    await db.update(lessonResultEmails).set({ sent }).where(eq(lessonResultEmails.id, claimed.id));
    if (sent < recipients.length) logger.warn(`[LESSON-RESULT] ${recipients.length - sent} címzettnek nem ment el.`);
    return { sent, duplicate: false };
  } catch (error) {
    logger.error("[LESSON-RESULT] a küldés nem sikerült:", error);
    return { sent: 0, duplicate: false };
  }
}

async function learnerName(userId: string | undefined): Promise<string> {
  if (!userId) return "Vendég tanuló";
  const [u] = await db.select({ first: users.firstName, last: users.lastName }).from(users).where(eq(users.id, userId));
  const name = `${u?.last ?? ""} ${u?.first ?? ""}`.trim();
  return name || "Bejelentkezett tanuló";
}

export const resultLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: "Túl sok beküldés." } });

/** POST /api/lessons/:lessonId/results — a feladatok / a helyi kvíz befejezésekor (vendég is). Mindig 202, ha a kérés érvényes. */
export const lessonResultsRouter = Router();
lessonResultsRouter.post("/:lessonId/results", resultLimiter, async (req: Request, res: Response) => {
  const parsed = resultRequestSchema.safeParse(req.body);
  if (!parsed.success || !/^[A-Za-z0-9_-]{1,64}$/.test(req.params.lessonId)) return res.status(400).json({ message: "Érvénytelen beküldés." });
  const [row] = await db.select({ json: lessons.json, publishedAt: lessons.publishedAt }).from(lessons).where(eq(lessons.id, req.params.lessonId));
  const lesson = row?.publishedAt ? lessonSchema.safeParse(row.json) : null;
  const experience = lesson?.success ? lesson.data.experience : undefined;
  if (!experience) return res.status(404).json({ message: "Ez a lecke nem érhető el." });
  const body = parsed.data;
  const userId = (req.user as { id?: string } | undefined)?.id;
  let graded: GradedTasks | GradedQuiz;
  if (body.kind === "tasks") {
    if (!Object.values(body.answers).some(a => a.trim())) return res.status(202).json({ queued: false });
    // A döntőbíró gyorsítótára (ha a tanuló felülete már kérte): az ítélet csak emelhet, mint a képernyőn.
    const keys = Object.entries(body.answers).flatMap(([tid, a]) => { const t = experience.tasks.find(x => x.id === tid); return t && a.trim() ? [[tid, arbiterCacheKey(t, a.trim())] as const] : []; });
    const cached = keys.length ? await db.select({ key: arbiterVerdicts.cacheKey, state: arbiterVerdicts.state, score: arbiterVerdicts.score }).from(arbiterVerdicts).where(inArray(arbiterVerdicts.cacheKey, keys.map(k => k[1]))) : [];
    const byKey = new Map(cached.map(c => [c.key, c]));
    graded = gradeTasks(experience.tasks, body.answers, (task, answer) => {
      const hit = byKey.get(arbiterCacheKey(task, answer));
      return hit ? { state: hit.state as "ok" | "partial" | "fail", score: hit.score } : null;
    });
  } else {
    if (!Object.keys(body.picks).length) return res.status(202).json({ queued: false });
    graded = gradeQuiz(experience.quiz, body.picks);
  }
  const who = userId ?? `guest:${body.fingerprint ?? req.ip ?? "?"}`;
  // Nem várjuk meg: a tanuló felülete nem függ a levéltől.
  void learnerName(userId).then(learner => sendLessonResult({ lessonId: req.params.lessonId, roundKey: roundKeyOf(who, body.kind, body.roundId), learner, graded }));
  return res.status(202).json({ queued: true });
});

/**
 * A bejelentkezett tanuló szerveres kvízének első lezárása (finishPractice) — a szerver maga küld, kliens-beküldés nélkül.
 * A kör saját kérdés-pillanatképéből pontoz (nem a lecke esetleg azóta változott bankjából).
 */
export async function sendPracticeResult(input: { userId: string; attemptId: string; lessonId: string; questions: AttemptQuestion[]; answers: Record<string, AttemptAnswer> }) {
  const quiz = input.questions.map(q => ({ id: q.id, question: q.prompt, options: q.options, correctIndex: q.correctIndex }));
  const picks = Object.fromEntries(input.questions.filter(q => input.answers[q.id]).map(q => [q.id, input.answers[q.id].pickedIndex]));
  await sendLessonResult({ lessonId: input.lessonId, roundKey: roundKeyOf("practice", input.attemptId), learner: await learnerName(input.userId), graded: gradeQuiz(quiz, picks) });
}
