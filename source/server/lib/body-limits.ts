import type { Request } from "express";

/**
 * Body-size policy per route (#162, split from index.ts so it is unit-testable).
 *
 * Only authenticated upload/AI paths may send huge bodies: admin material
 * uploads (base64 PDFs), the Enhanced Material Creator, admin backup import,
 * and the Studio (source extraction sends images/PDF pages as base64 data
 * URLs — 5 phone photos are several MB, which is what produced the measured
 * ERR_413 on /api/studio/maps/extract). Everything else stays at the standard
 * limit so an anonymous client cannot exhaust memory on cheap public routes.
 *
 * The session-cookie precheck is a cheap filter, not auth: requests without a
 * session cookie would 401 on these routes anyway, so they never deserve the
 * large parser.
 */

export const LARGE_BODY_PREFIXES = [
  "/api/html-files", // admin material create/update (base64 PDF payloads)
  "/api/ai/", // Enhanced Material Creator
  "/api/admin/", // backup import, improvement apply, ...
  "/api/studio/", // knowledge-map extraction: image/PDF sources as data URLs (#162)
] as const;

const SESSION_COOKIE_NAME = "connect.sid";

/** Methods that carry a request body; GET/DELETE/HEAD never need the 150 MB parser. */
const BODY_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH"]);

export function hasSessionCookie(req: Request): boolean {
  return typeof req.headers.cookie === "string" && req.headers.cookie.includes(`${SESSION_COOKIE_NAME}=`);
}

/**
 * Audit 2026-09-05 (D): the cookie precheck is an optimisation, not a guard — any client
 * can send `Cookie: connect.sid=x`. The real bound is the method: only body-carrying
 * methods on the upload/AI prefixes may reach the large parser. A forged cookie on a
 * POST still needs to survive the 401 downstream; that residual surface is accepted and
 * documented in docs/specs/audit-4day-fixes-2026-09-05.md §5.
 */
export function needsLargeBody(req: Request): boolean {
  const method = typeof req.method === "string" ? req.method.toUpperCase() : "";
  return (
    BODY_METHODS.has(method) &&
    LARGE_BODY_PREFIXES.some((prefix) => req.path.startsWith(prefix)) &&
    hasSessionCookie(req)
  );
}
