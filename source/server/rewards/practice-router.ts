import express, { type Request, type Response } from "express";
import { z } from "zod";
import { answerPractice, beginPractice, finishPractice, markPracticeHint, PracticeError, practiceReview, readPractice } from "./lesson-attempts";
import { logger } from "../lib/logger";

export const practiceRouter = express.Router();
function handle(action: (userId: string, req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) return res.status(401).json({ message: "A mentett gyakorláshoz jelentkezz be. Vendégként helyben gyakorolhatsz." });
    try { return res.json(await action(userId, req)); }
    catch (error) {
      if (error instanceof PracticeError) return res.status(error.status).json({ message: error.message });
      logger.error("[PRACTICE] A gyakorlókör művelete nem sikerült.");
      return res.status(500).json({ message: "Most nem sikerült menteni. Próbáld újra!" });
    }
  };
}
const answerBody = z.object({ questionId: z.string().length(64), pickedIndex: z.number().int().min(0).max(3), usedHint: z.boolean().default(false) }).strict();
practiceRouter.post("/:lessonId/start", handle((userId, req) => beginPractice(userId, req.params.lessonId)));
practiceRouter.get("/:lessonId/review", handle((userId, req) => practiceReview(userId, req.params.lessonId)));
practiceRouter.get("/:id", handle((userId, req) => readPractice(userId, req.params.id)));
practiceRouter.post("/:id/answer", handle((userId, req) => {
  const data = answerBody.safeParse(req.body);
  if (!data.success) throw new PracticeError(400, "Hibás válasz.");
  return answerPractice(userId, req.params.id, data.data.questionId, data.data.pickedIndex, data.data.usedHint);
}));
practiceRouter.post("/:id/finish", handle((userId, req) => finishPractice(userId, req.params.id)));
practiceRouter.post("/:id/hint", handle((userId, req) => {
  const data = z.object({ questionId: z.string().length(64) }).strict().safeParse(req.body);
  if (!data.success) throw new PracticeError(400, "Hibás kérdés.");
  return markPracticeHint(userId, req.params.id, data.data.questionId);
}));
