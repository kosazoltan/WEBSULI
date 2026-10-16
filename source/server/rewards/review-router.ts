import express, { type Request, type Response } from "express";
import { z } from "zod";
import { REVIEW_RATINGS } from "../../shared/review-schedule";
import { FLASHCARD_ID_MAX } from "../../shared/lesson-flashcards";
import { rateCard, readReview, ReviewError } from "./review-store";
import { logger } from "../lib/logger";

/** Websuli Design §7 — a memóriakártya-ismétlés mentése bejelentkezett tanulónak (vendég: csak a böngészőben). */
export const reviewRouter = express.Router();
function handle(action: (userId: string, req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) return res.status(401).json({ message: "A mentett ismétléshez jelentkezz be. Vendégként a böngésződben gyakorolhatsz." });
    try { return res.json(await action(userId, req)); }
    catch (error) {
      if (error instanceof ReviewError) return res.status(error.status).json({ message: error.message });
      logger.error("[REVIEW] Az ismétlés mentése nem sikerült.");
      return res.status(500).json({ message: "Most nem sikerült menteni. Próbáld újra!" });
    }
  };
}
const rateBody = z.object({ cardId: z.string().min(1).max(FLASHCARD_ID_MAX), rating: z.enum(REVIEW_RATINGS) }).strict();
reviewRouter.get("/:lessonId", handle((userId, req) => readReview(userId, req.params.lessonId)));
reviewRouter.post("/:lessonId/rate", handle((userId, req) => {
  const data = rateBody.safeParse(req.body);
  if (!data.success) throw new ReviewError(400, "Hibás értékelés.");
  return rateCard(userId, req.params.lessonId, data.data.cardId, data.data.rating);
}));
