import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
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
const rateBody = z.object({ cardId: z.string().min(1).max(FLASHCARD_ID_MAX), rating: z.enum(REVIEW_RATINGS), requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/) }).strict();
/**
 * Review #268: tanulónkénti keret. A közös, IP-alapú /api/lessons írási keret (server/index.ts) egy iskolai NAT mögött két tanuló
 * 75 kártyás ismétlésénél elfogyna, ezért az ismétlés abból kimarad, és itt a bejelentkezett tanulóhoz kötött keretet kapja.
 */
export const REVIEW_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 600 } as const;
const reviewLimiter = rateLimit({
  ...REVIEW_RATE_LIMIT,
  // Vendég: a handle 401-et ad, a keret nem érinti.
  skip: req => !(req.user as { id?: string } | undefined)?.id,
  keyGenerator: req => `review:${(req.user as { id: string }).id}`,
  message: { message: "Túl sok értékelés rövid idő alatt. Pihenj egy kicsit, és próbáld újra!" },
  standardHeaders: true, legacyHeaders: false,
});
reviewRouter.get("/:lessonId", handle((userId, req) => readReview(userId, req.params.lessonId)));
reviewRouter.post("/:lessonId/rate", reviewLimiter, handle((userId, req) => {
  const data = rateBody.safeParse(req.body);
  if (!data.success) throw new ReviewError(400, "Hibás értékelés.");
  return rateCard(userId, req.params.lessonId, data.data.cardId, data.data.rating, data.data.requestId);
}));
