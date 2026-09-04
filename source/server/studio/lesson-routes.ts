import express, { type Request, type Response } from "express";
import { desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { lessons, htmlFiles } from "../../shared/schema";
import { lessonSchema } from "../../shared/lesson-schema";
import { logger } from "../lib/logger";
import { normalizeFingerprint } from "../lib/public-input";
import { gradeProba } from "../rewards/grade";
import { applyBonus, remainingSeconds, BONUS_ALREADY_CLAIMED } from "../rewards/coupons";
import {
  activeCoupon,
  currentStreak,
  issueCoupon,
  loadCoupon,
  loadPublishedLesson,
  loadRewardPolicy,
  persistBonus,
  saveConceptResults,
  startCoupon,
  type Learner,
} from "../rewards/store";
import { computeCoupon } from "../../shared/reward-policy";

/**
 * Public read side of the Lesson Studio (LS-2).
 *
 * Separate from studio/routes.ts because the audience is different: those endpoints are
 * admin-only and spend money, these are what a pupil's browser fetches. Only published
 * lessons are served, and the stored JSON is re-validated before it leaves the server —
 * a lesson row that no longer matches the schema is an incident, not something to stream
 * to a child half-rendered.
 */

export const lessonPublicRouter = express.Router();

/** GET /api/lessons/by-file/:htmlFileId — the lesson behind a `contentType:'lesson'` material. */
lessonPublicRouter.get("/by-file/:htmlFileId", async (req: Request, res: Response) => {
  const [row] = await db
    .select({
      id: lessons.id,
      json: lessons.json,
      publishedAt: lessons.publishedAt,
      version: lessons.version,
    })
    .from(lessons)
    .where(eq(lessons.htmlFileId, req.params.htmlFileId))
    .orderBy(desc(lessons.version))
    .limit(1);

  if (!row) return res.status(404).json({ message: "Ehhez a tananyaghoz nincs lecke." });

  if (!row.publishedAt) {
    return res.status(404).json({ message: "Ez a lecke még nincs publikálva." });
  }

  const parsed = lessonSchema.safeParse(row.json);
  if (!parsed.success) {
    // Loud on the server, vague to the client: the pupil cannot act on a schema error.
    logger.error(
      `[LESSON] A tárolt lecke nem érvényes: ${row.id} — ${parsed.error.issues.length} hibás mező.`,
    );
    return res.status(500).json({ message: "A lecke sérült, szólj az adminnak." });
  }

  res.json({ lessonId: row.id, version: row.version, lesson: parsed.data });
});

/** GET /api/lessons — published lessons, for listings. */
lessonPublicRouter.get("/", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: lessons.id,
      htmlFileId: lessons.htmlFileId,
      publishedAt: lessons.publishedAt,
      title: htmlFiles.title,
      classroom: htmlFiles.classroom,
    })
    .from(lessons)
    .leftJoin(htmlFiles, eq(lessons.htmlFileId, htmlFiles.id))
    .where(isNotNull(lessons.publishedAt))
    .orderBy(desc(lessons.publishedAt))
    .limit(200);

  res.json({ lessons: rows });
});

/* ------------------------------------------------------------------ *
 * LS-3a — Próba, kupon, bónusz.
 *
 * Public and unauthenticated, because a child may be playing without a Google
 * account. What is NOT trusted from that client: the score (graded here from the
 * stored lesson), the clock (derived from the server's own timestamps) and the
 * quiz item behind a bonus (must be one this server handed out).
 * ------------------------------------------------------------------ */

const probaBody = z.object({
  sectionIdx: z.number().int().min(0).max(200),
  answers: z
    .array(
      z.object({
        blockIndex: z.number().int().min(0).max(500),
        pickedIndex: z.number().int().min(0).max(50),
      }),
    )
    .max(200)
    .default([]),
  fingerprint: z.string().max(128).optional(),
});

const bonusBody = z.object({
  quizItemId: z.string().min(1).max(64),
  fingerprint: z.string().max(128).optional(),
});

/** Which child this is: the session when logged in, otherwise the browser fingerprint. */
function learnerOf(req: Request, fingerprint?: string): Learner | null {
  const userId = (req.user as { id?: string } | undefined)?.id ?? null;
  if (userId) return { userId, fingerprint: null };

  const fp = normalizeFingerprint(fingerprint);
  if (!fp) return null;
  return { userId: null, fingerprint: fp };
}

/** POST /api/lessons/:id/proba — the server marks the section and decides the reward. */
lessonPublicRouter.post("/:id/proba", async (req: Request, res: Response) => {
  const parsed = probaBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Hibás beküldés." });
  }

  const learner = learnerOf(req, parsed.data.fingerprint);
  if (!learner) {
    return res.status(400).json({ message: "Hiányzó azonosító." });
  }

  const row = await loadPublishedLesson(req.params.id);
  if (!row) return res.status(404).json({ message: "Ez a lecke nem érhető el." });

  const lesson = lessonSchema.safeParse(row.json);
  if (!lesson.success) {
    logger.error(`[PROBA] A tárolt lecke nem érvényes: ${row.id}`);
    return res.status(500).json({ message: "A lecke sérült, szólj az adminnak." });
  }

  const grade = gradeProba(lesson.data, parsed.data.sectionIdx, parsed.data.answers);
  const policy = await loadRewardPolicy();
  const streak = await currentStreak(learner, row.id);
  const grant = computeCoupon(
    policy,
    { streak },
    { score: grade.score, isLessonFinal: grade.isLessonFinal },
  );

  await saveConceptResults(learner, row.id, parsed.data.sectionIdx, grade);

  let coupon = null;
  if (grant.minutes !== null && grade.total > 0) {
    const reason =
      grade.score >= policy.thresholds.perfect
        ? grade.isLessonFinal
          ? "lesson_perfect"
          : "section_perfect"
        : "section_good";

    const issued = await issueCoupon(
      learner,
      row.id,
      parsed.data.sectionIdx,
      grant.minutes,
      reason,
      policy,
      new Date(),
    );
    coupon = { id: issued.id, minutes: issued.minutes, expiresAt: issued.expiresAt };
  }

  res.json({
    score: grade.score,
    correctCount: grade.correctCount,
    total: grade.total,
    weakConceptIds: grade.weakConceptIds,
    isLessonFinal: grade.isLessonFinal,
    coupon,
  });
});

/** POST /api/lessons/coupons/:id/start — the clock starts here, and only once. */
lessonPublicRouter.post("/coupons/:id/start", async (req: Request, res: Response) => {
  const learner = learnerOf(req, req.body?.fingerprint);
  if (!learner) return res.status(400).json({ message: "Hiányzó azonosító." });

  const coupon = await loadCoupon(learner, req.params.id);
  if (!coupon) return res.status(404).json({ message: "Nincs ilyen kupon." });

  const now = new Date();
  // Already running is not an error: a reload must not lose the child's remaining time.
  await startCoupon(coupon.id, now);

  const fresh = await loadCoupon(learner, req.params.id);
  res.json({ couponId: coupon.id, remainingSeconds: remainingSeconds(fresh ?? coupon, now) });
});

/** GET /api/lessons/coupons/active — what the game HUD counts down. */
lessonPublicRouter.get("/coupons/active", async (req: Request, res: Response) => {
  const learner = learnerOf(req, typeof req.query.fingerprint === "string" ? req.query.fingerprint : undefined);
  if (!learner) return res.json({ coupon: null });

  const now = new Date();
  const coupon = await activeCoupon(learner, now);
  if (!coupon) return res.json({ coupon: null });

  res.json({
    coupon: {
      id: coupon.id,
      lessonId: coupon.lessonId,
      sectionIdx: coupon.sectionIdx,
      minutes: coupon.minutes,
      started: coupon.serverStartedAt !== null,
      remainingSeconds: remainingSeconds(coupon, now),
    },
  });
});

/** POST /api/lessons/coupons/:id/bonus — extra seconds for a verified correct answer. */
lessonPublicRouter.post("/coupons/:id/bonus", async (req: Request, res: Response) => {
  const parsed = bonusBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Hibás kérés." });

  const learner = learnerOf(req, parsed.data.fingerprint);
  if (!learner) return res.status(400).json({ message: "Hiányzó azonosító." });

  const coupon = await loadCoupon(learner, req.params.id);
  if (!coupon) return res.status(404).json({ message: "Nincs ilyen kupon." });

  const policy = await loadRewardPolicy();
  const now = new Date();
  const result = applyBonus(coupon, parsed.data.quizItemId, policy.bonusSeconds, now);

  if (!result.ok) {
    // Replay gets its own code so the client can stay quiet instead of showing an error.
    const status = result.reason === BONUS_ALREADY_CLAIMED ? 409 : 400;
    return res.status(status).json({ message: "A bónusz nem érvényes.", reason: result.reason });
  }

  await persistBonus(result.coupon);
  res.json({
    bonusSeconds: policy.bonusSeconds,
    remainingSeconds: remainingSeconds(result.coupon, now),
  });
});
