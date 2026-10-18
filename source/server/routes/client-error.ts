/**
 * Böngészős hibajelentés — POST /api/client-error (kanban #127, docs/specs/2026-10-18-kliens-hibariport.md)
 *
 * A /api/error-report HMAC-ot követel, amelynek titka a böngészőbe nem kerülhet, ezért a kliens hibái élesben 401-et
 * kaptak. Itt az aláírás helyett: Origin/Referer allowlist (fail-closed), IP-korlát, napi plafon, mezővágás, és a
 * kliensre nem bízott mezők (azonosság, környezet) a szerverről jönnek.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import type { ErrorReportPayload } from "../lib/error-mailer";
import { logger } from "../lib/logger";
import { enforceOriginAllowlist } from "../lib/origin-guard";
import { MAX_LENGTHS } from "./error-report";

const ERROR_TYPE_RE = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;
const MAX_BREADCRUMBS = 50;
const MAX_BREADCRUMB_JSON = 500;

const budapestDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" });

export interface ClientErrorRouterOptions {
  reportSender?: (payload: ErrorReportPayload) => Promise<void>;
  dailyCap?: number;
  now?: () => Date;
}

function clip(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.substring(0, max) : undefined;
}

export function sanitizeBreadcrumbs(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .slice(-MAX_BREADCRUMBS)
    .filter((crumb) => {
      try {
        return (JSON.stringify(crumb) ?? "").length <= MAX_BREADCRUMB_JSON;
      } catch {
        return false; // circular / unserialisable → drop
      }
    });
}

export function createClientErrorRouter({
  reportSender = async (payload) => {
    const { sendErrorReport } = await import("../lib/error-mailer");
    await sendErrorReport(payload);
  },
  dailyCap = 200,
  now = () => new Date(),
}: ClientErrorRouterOptions = {}): Router {
  const router = Router();
  let day = "";
  let count = 0;

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many error reports" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const dailyCapGuard = (_req: Request, res: Response, next: NextFunction): void => {
    const today = budapestDay.format(now());
    if (today !== day) {
      day = today;
      count = 0;
    }
    if (count >= dailyCap) {
      res.status(429).json({ error: "daily cap reached" });
      return;
    }
    next();
  };

  router.post("/", enforceOriginAllowlist, limiter, dailyCapGuard, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const message = clip(body.message, MAX_LENGTHS.message) ?? "";
    if (!message.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const sessionUser =
      typeof req.isAuthenticated === "function" && req.isAuthenticated()
        ? (req.user as { id?: unknown; email?: unknown } | undefined)
        : undefined;

    count++;
    try {
      await reportSender({
        errorType: typeof body.errorType === "string" && ERROR_TYPE_RE.test(body.errorType) ? body.errorType : "ClientError",
        message,
        stack: clip(body.stack, MAX_LENGTHS.stack),
        url: clip(body.url, MAX_LENGTHS.url),
        requestId: req.requestId?.substring(0, MAX_LENGTHS.requestId),
        browser: req.headers["user-agent"]?.substring(0, MAX_LENGTHS.browser),
        breadcrumbs: sanitizeBreadcrumbs(body.breadcrumbs),
        userId: sessionUser?.id != null ? String(sessionUser.id).substring(0, MAX_LENGTHS.userId) : undefined,
        userEmail: clip(sessionUser?.email, MAX_LENGTHS.userEmail),
        environment: (process.env.NODE_ENV ?? "production").substring(0, MAX_LENGTHS.environment),
      });
      res.status(202).json({ ok: true });
    } catch (err) {
      logger.error("[client-error route]", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  return router;
}

export default createClientErrorRouter();
