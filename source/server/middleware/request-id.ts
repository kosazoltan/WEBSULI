/**
 * X-Request-ID middleware
 * Assigns a unique request ID to every incoming request
 */
import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers["x-request-id"];
  const requestId = (typeof existing === "string" && existing.length > 0)
    ? existing
    : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
}
