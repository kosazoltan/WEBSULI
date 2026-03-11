/**
 * Universal Error Logger — POST /api/error-report
 * Input validáció + sendErrorReport hívás
 */
import { Router, type Request, type Response } from "express";
import { sendErrorReport } from "../lib/error-mailer";

const router = Router();

const MAX_LENGTHS = {
  errorType: 50,
  message: 5000,
  stack: 10000,
  url: 500,
  requestId: 100,
  requestMethod: 10,
  requestBody: 2000,
  userId: 100,
  userEmail: 200,
  browser: 300,
  commitSha: 40,
  environment: 20,
};

/**
 * POST /api/error-report
 * Accepts error reports from frontend or backend clients
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;

    const errorType = typeof body.errorType === "string" ? body.errorType.substring(0, MAX_LENGTHS.errorType) : "UnknownError";
    const message = typeof body.message === "string" ? body.message.substring(0, MAX_LENGTHS.message) : "Unknown error";

    if (!message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    await sendErrorReport({
      errorType,
      message,
      stack: typeof body.stack === "string" ? body.stack.substring(0, MAX_LENGTHS.stack) : undefined,
      url: typeof body.url === "string" ? body.url.substring(0, MAX_LENGTHS.url) : undefined,
      requestId: (req.requestId ?? (typeof body.requestId === "string" ? body.requestId : undefined))?.substring(0, MAX_LENGTHS.requestId),
      requestMethod: (req.method ?? (typeof body.requestMethod === "string" ? body.requestMethod : undefined))?.substring(0, MAX_LENGTHS.requestMethod),
      requestBody: typeof body.requestBody === "string" ? body.requestBody.substring(0, MAX_LENGTHS.requestBody) : undefined,
      userId: typeof body.userId === "string" ? body.userId.substring(0, MAX_LENGTHS.userId) : undefined,
      userEmail: typeof body.userEmail === "string" ? body.userEmail.substring(0, MAX_LENGTHS.userEmail) : undefined,
      browser: (req.headers["user-agent"] ?? (typeof body.browser === "string" ? body.browser : undefined))?.substring(0, MAX_LENGTHS.browser),
      breadcrumbs: Array.isArray(body.breadcrumbs) ? body.breadcrumbs : undefined,
      commitSha: typeof body.commitSha === "string" ? body.commitSha.substring(0, MAX_LENGTHS.commitSha) : undefined,
      environment: typeof body.environment === "string" ? body.environment.substring(0, MAX_LENGTHS.environment) : undefined,
    });

    res.status(202).json({ ok: true });
  } catch (err) {
    console.error("[error-report route]", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
