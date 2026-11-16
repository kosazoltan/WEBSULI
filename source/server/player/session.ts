/**
 * JM7a — a játékos-munkamenet (terv 10.4, D12: szerkezeti elválasztás, „deny by default”).
 * A játékos-belépés KIZÁRÓLAG a `req.session.player` kulcsot állítja; `req.login`-t SOHA nem hív, így `req.user`
 * (az admin / meglévő felhasználói út) nem jön létre, és az `isAuthenticatedAdmin` játékos-munkamenettel 401-et ad.
 * A munkamenet-azonosító belépéskor újragenerálódik (session-fixation védelem, mint az `S/auth.ts` helyi belépésénél);
 * az újragenerálás egy esetleg ugyanabban a böngészőben élő admin-munkamenetet is lezárja — a kettő nem keveredhet.
 */
import type { Request } from "express";

declare module "express-session" {
  interface SessionData {
    /** `at`: a belépés ideje (ms) — JM7b: a fióktörlés friss belépést kér (account-routes.ts). */
    player?: { id: string; at?: number };
  }
}

/** A munkamenet belépési ideje (ms); régebbi / beültetett munkamenetnél null. */
export function getPlayerSessionAuthAt(req: Request): number | null {
  const at = req.session?.player?.at;
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

export function getPlayerSessionId(req: Request): string | null {
  const id = req.session?.player?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function setPlayerSession(req: Request, playerId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((regenErr) => {
      if (regenErr) return reject(regenErr);
      req.session.player = { id: playerId, at: Date.now() };
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

/** Kijelentkezés: a teljes munkamenet megszűnik (a sor és a süti is), nem csak a kulcs. */
export function destroyPlayerSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve();
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}
