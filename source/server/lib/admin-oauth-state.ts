/**
 * JM7c-1 (review #449 K3, login-CSRF) — a meglévő admin / felhasználói `/auth/google` út `state`-tára, a játékos-út
 * `PlayerStateStore`-jának mintájára (server/player/google.ts):
 *  - `a.` előtag + 32 base64url karakter (a közös callback az előtagból ÉS a munkamenet rekordjából dönt);
 *  - munkamenethez kötött (a rekord a böngésző saját munkamenetében él — idegen munkamenet `state`-je nem illik rá);
 *  - egyszer használható (az ellenőrzés törli), 15 perc után lejár, legfeljebb 5 függő belépés;
 *  - PKCE: a rekord a `code_verifier`-t is tárolja (passport-oauth2 `store` szerződés, 5 / 3 paraméteres alak).
 * Ismeretlen / hiányzó / lejárt / idegen `state` → sikertelen ellenőrzés, senki nem lép be.
 */
import { randomBytes } from "node:crypto";
import type { Request } from "express";

type AdminOauthRecord = { v: string; t: number };

declare module "express-session" {
  interface SessionData {
    /** JM7c-1: a folyamatban lévő admin / felhasználói Google-belépések `state`-enként tárolt rekordjai (PKCE-ellenőrző). */
    adminOauthStates?: Record<string, AdminOauthRecord>;
  }
}

export const ADMIN_STATE_PREFIX = "a.";
const STATE_TTL_MS = 15 * 60_000;
const MAX_PENDING_STATES = 5;

/** Alakra helyes admin-`state` (a közös callback elágazásához és a tesztekhez). */
export function isAdminState(value: unknown): value is string {
  return typeof value === "string" && /^a\.[A-Za-z0-9_-]{32}$/.test(value);
}

export class AdminStateStore {
  store(req: Request, verifier: string, _state: unknown, _meta: unknown, cb: (err: Error | null, handle?: string) => void): void {
    if (!req.session) return cb(new Error("session required"));
    const now = Date.now();
    const recs = Object.fromEntries(Object.entries(req.session.adminOauthStates ?? {})
      .filter(([, r]) => now - r.t < STATE_TTL_MS)
      .sort(([, a], [, b]) => b.t - a.t)
      .slice(0, MAX_PENDING_STATES - 1));
    const handle = `${ADMIN_STATE_PREFIX}${randomBytes(24).toString("base64url")}`;
    recs[handle] = { v: verifier, t: now };
    req.session.adminOauthStates = recs;
    cb(null, handle);
  }

  verify(req: Request, provided: unknown, cb: (err: Error | null, ok: string | false, info?: { message: string }) => void): void {
    const recs = req.session?.adminOauthStates ?? {};
    const valid = isAdminState(provided) && Object.prototype.hasOwnProperty.call(recs, provided);
    const rec = valid ? recs[provided as string] : undefined;
    if (valid) {
      delete recs[provided as string];
      req.session.adminOauthStates = recs;
    }
    if (!rec || Date.now() - rec.t >= STATE_TTL_MS) return cb(null, false, { message: "Invalid authorization request state." });
    cb(null, rec.v);
  }
}
