/**
 * X-Request-ID middleware
 * Assigns a unique request ID to every incoming request
 */
import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";

/**
 * Max length accepted for a caller-supplied request id.
 * The value is echoed into a response header, written to log lines and stored in a
 * varchar(100) column (error_logs.request_id), so it must stay bounded.
 */
const MAX_REQUEST_ID_LENGTH = 100;

/**
 * Conservative trace-id charset: what W3C trace ids, UUIDs and the common
 * `service-region-counter` shapes actually use. Anything else — whitespace, control
 * characters, HTML metacharacters, non-ASCII — is not a trace id and must not be
 * reflected back to the caller or into the logs.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * SECURITY: Accept a caller-supplied request id only when it is a short, plain trace id.
 * Anything else is replaced by a freshly generated UUID, so an attacker cannot choose
 * what lands in the response headers, the log lines or the error-report e-mail.
 */
function normalizeRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_REQUEST_ID_LENGTH) return null;
  if (!SAFE_REQUEST_ID.test(trimmed)) return null;
  return trimmed;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = normalizeRequestId(req.headers["x-request-id"]) ?? crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
}
