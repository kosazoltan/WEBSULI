import type { Request, Response, NextFunction } from 'express';
import { isOriginAllowed } from './allowed-origins';

/**
 * SECURITY: Resolve the request's origin from the Origin header, falling back to the
 * origin part of the Referer header. Returns undefined when neither is present/parseable.
 */
export function getRequestOrigin(req: Request): string | undefined {
  const originHeader = req.headers.origin;
  if (originHeader) {
    return originHeader;
  }
  const referer = req.headers.referer;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * SECURITY: Fail-closed Origin/Referer allowlist for mutating endpoints that cannot use
 * the synchroniser-token CSRF flow (login/logout have no session yet; the AI endpoints are
 * called directly by the Enhanced Material Creator).
 * A request without a usable Origin/Referer is rejected — never allowed through.
 *
 * AUDIT 2026-09-01: külön modulba került, mert a /api/login és /api/logout route-ok az
 * auth.ts-ben (setupAuth) regisztrálódnak, MÉG a routes.ts globális app.use()-őre ELŐTT —
 * az Express regisztrációs sorrendben fut, így ott az őr sosem érte el őket. Az auth.ts
 * most közvetlenül route-middleware-ként alkalmazza.
 */
export function enforceOriginAllowlist(req: Request, res: Response, next: NextFunction): void {
  const requestOrigin = getRequestOrigin(req);
  if (isOriginAllowed(requestOrigin)) {
    return next();
  }
  // A same-origin request is by definition not cross-site, so it is always safe. This also
  // keeps login working on a deployment whose domain isn't in the allowlist yet.
  // req.protocol honours X-Forwarded-Proto because `trust proxy` is set in index.ts.
  if (requestOrigin && requestOrigin === `${req.protocol}://${req.get('host')}`) {
    return next();
  }
  res.status(403).json({ error: 'Origin not allowed' });
}
