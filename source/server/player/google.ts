/**
 * JM7b — a játékos KÜLÖN Google-útja (terv 10.4, D12 „deny by default”; tulajdonosi G11: „a játékhoz rendelt
 * Google-hozzáférés csak a nyilvános játékoldalakra vonatkozik, és játékos-fiókot hoz létre”).
 *
 *   GET /auth/player/google?returnTo=/fiok  → külön nevű Passport-stratégia („google-player”), `state` (login-CSRF ellen) +
 *                                             PKCE, csak `email` hatókör (név / profilkép nem is kerül hozzánk)
 *   GET /auth/google/callback               → a meglévő visszahívás a `p.` előtagú `state`-re ide ad át (auth.ts); a döntés
 *                                             a `state`-ből ÉS a munkamenetben state-enként tárolt rekordból egyezően születik
 *
 * Elválasztás: a verify a `users` táblát NEM érinti (nincs `upsertUser`, nincs `getUserByEmail`), `req.login`-t SEHOL nem
 * hívunk — a belépés csak `req.session.player`-t állít (session.ts). Admin e-mail-című Google-fiók itt is csak
 * játékos-fiókot kap; a két tábla között nincs automatikus összekapcsolás. Élő fiók-munkamenet (req.user, pl. admin)
 * mellett az út el sem indul, és a visszahívás sem cseréli le (a JM7a 409-es szabályának megfelelője: átirányítás
 * hibakóddal, az admin bent marad). A visszatérési cél csak a belső engedélylistáról jöhet (nyílt átirányítás ellen).
 * Ugyanaz a kliens-azonosító és ugyanaz a callback URL, mint az admin-úté → a Google-konzolban nincs teendő.
 */
import { randomBytes } from "node:crypto";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { logger } from "../lib/logger";
import { maskEmail } from "../lib/mask-email";
import type { PlayerAccountStore } from "./account-store";
import { normalizeEmail } from "./codes";
import { playerAccountsEnabled, requirePlayerAccountsFlag } from "./require-player";
import { setPlayerSession } from "./session";

type PlayerOauthRecord = { v: string; r: string | null; t: number };

declare module "express-session" {
  interface SessionData {
    /**
     * Review #449 (A1): a folyamatban lévő játékos Google-belépések `state`-enként tárolt rekordjai (PKCE-ellenőrző +
     * visszatérési cél). NEM egyetlen, felülírható jelző: egy párhuzamosan indított játékos-folyamat az admin-belépést nem
     * érinti, és a folyamat fajtáját a `state` (előtag + munkamenetben tárolt rekord) együtt dönti el.
     */
    playerOauthStates?: Record<string, PlayerOauthRecord>;
  }
}

export const PLAYER_GOOGLE_STRATEGY = "google-player";
export const PLAYER_DEFAULT_RETURN = "/fiok";
/** A játékos-folyamat `state`-jének előtagja: a közös callback ebből ÉS a munkamenet rekordjából dönt. */
export const PLAYER_STATE_PREFIX = "p.";
const STATE_TTL_MS = 15 * 60_000;
const MAX_PENDING_STATES = 5;

/** A közös visszahívás elágazása: csak `p.` előtagú, alakra helyes `state` mehet a játékos-ágra. */
export function isPlayerState(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PLAYER_STATE_PREFIX) && /^p\.[A-Za-z0-9_-]{32}$/.test(value);
}

/**
 * A játékos-stratégia saját PKCE-állapottára (passport-oauth2 `store` szerződés): `state`-enként külön rekord a munkamenetben,
 * 15 perces élettartammal, egyszer használható; legfeljebb 5 függő folyamat.
 */
export class PlayerStateStore {
  store(req: Request, verifier: string, _state: unknown, _meta: unknown, cb: (err: Error | null, handle?: string) => void): void {
    if (!req.session) return cb(new Error("session required"));
    const now = Date.now();
    const recs = Object.fromEntries(Object.entries(req.session.playerOauthStates ?? {})
      .filter(([, r]) => now - r.t < STATE_TTL_MS)
      .sort(([, a], [, b]) => b.t - a.t)
      .slice(0, MAX_PENDING_STATES - 1));
    const handle = `${PLAYER_STATE_PREFIX}${randomBytes(24).toString("base64url")}`;
    recs[handle] = { v: verifier, r: (req as Request & { playerReturnTo?: string | null }).playerReturnTo ?? null, t: now };
    req.session.playerOauthStates = recs;
    cb(null, handle);
  }

  verify(req: Request, provided: unknown, cb: (err: Error | null, ok: string | false, info?: { returnTo: string | null } | { message: string }) => void): void {
    const recs = req.session?.playerOauthStates ?? {};
    const rec = typeof provided === "string" && Object.prototype.hasOwnProperty.call(recs, provided) ? recs[provided] : undefined;
    if (typeof provided === "string" && rec) {
      delete recs[provided];
      req.session.playerOauthStates = recs;
    }
    if (!rec || Date.now() - rec.t >= STATE_TTL_MS) return cb(null, false, { message: "Invalid authorization request state." });
    cb(null, rec.v, { returnTo: rec.r });
  }
}

/** Belső, engedélylistás visszatérési cél: `/fiok`, `/profile`, `/games` és a `/games/<játék>` oldalak. Minden más → null. */
export function sanitizePlayerReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value === "/fiok" || value === "/profile" || value === "/games") return value;
  return /^\/games\/[a-z0-9-]{1,40}$/.test(value) ? value : null;
}

/** A hibák a belépő oldalon (`/belepes?hiba=…`) jelennek meg — a kód nem tartalmaz személyes adatot. */
export type PlayerGoogleError = "fiok-munkamenet" | "google" | "nincs-megerositve" | "tiltva" | "utkozes" | "nem-elerheto";

type GoogleProfileLike = { id: string; emails?: { value: string; verified?: boolean | string }[] };
type VerifyDone = (err: Error | null, user?: { id: string } | false, info?: { code: PlayerGoogleError }) => void;

/**
 * A játékos-út verify-ja: KIZÁRÓLAG a játékos-tárat kapja (a `users`-tárhoz hozzá sem fér). Megerősítetlen / hiányzó
 * e-mail → elutasítás. A Google-profilból csak a megerősített címet és az azonosítót (`sub`) használja.
 */
export function createPlayerGoogleVerify(store: Pick<PlayerAccountStore, "upsertGooglePlayer">) {
  return async (profile: GoogleProfileLike, done: VerifyDone): Promise<void> => {
    try {
      const primary = profile.emails?.[0];
      if (!profile.id || !primary?.value) return done(null, false, { code: "google" });
      if (primary.verified !== true && primary.verified !== "true") {
        logger.warn(`[PLAYER] Google-belépés elutasítva: megerősítetlen cím ${maskEmail(primary.value)}`);
        return done(null, false, { code: "nincs-megerositve" });
      }
      const email = normalizeEmail(primary.value);
      if (!email || profile.id.length > 64) return done(null, false, { code: "google" });
      const result = await store.upsertGooglePlayer(profile.id, email);
      if (result.kind === "CONFLICT") {
        logger.warn(`[PLAYER] Google-belépés ütközés (a fiókhoz már másik Google-fiók tartozik): ${maskEmail(email)}`);
        return done(null, false, { code: "utkozes" });
      }
      if (result.banned) {
        logger.info(`[PLAYER] tiltott fiók Google-belépési kísérlete: ${maskEmail(email)}`);
        return done(null, false, { code: "tiltva" });
      }
      logger.info(`[PLAYER] Google-belépés: ${maskEmail(email)}`);
      return done(null, { id: result.id });
    } catch (error) {
      logger.error("[PLAYER] Google-belépés hiba:", error instanceof Error ? error.message : "ismeretlen hiba");
      return done(error instanceof Error ? error : new Error("player google verify failed"));
    }
  };
}

const toLogin = (res: Response, code: PlayerGoogleError) => res.redirect(`/belepes?hiba=${code}`);

/**
 * A stratégia és az indító útvonal felcsatolása; a visszaadott kezelőt az auth.ts meglévő `/auth/google/callback`-je
 * hívja a játékos-ágon. Csak beállított Google-kliens mellett hívandó (az auth.ts ugyanazon az ágon).
 */
export function registerPlayerGoogle(
  app: Express,
  opts: { clientID: string; clientSecret: string; callbackURL: string; store: Pick<PlayerAccountStore, "upsertGooglePlayer"> },
): RequestHandler {
  const verify = createPlayerGoogleVerify(opts.store);
  passport.use(PLAYER_GOOGLE_STRATEGY, new GoogleStrategy({
    clientID: opts.clientID,
    clientSecret: opts.clientSecret,
    callbackURL: opts.callbackURL,
    scope: ["email"],
    state: true,
    pkce: true,
    store: new PlayerStateStore() as never,
  }, (_accessToken, _refreshToken, profile, done) => {
    void verify(profile as GoogleProfileLike, done as unknown as VerifyDone);
  }));

  app.get("/auth/player/google", requirePlayerAccountsFlag, (req: Request, res: Response, next: NextFunction) => {
    // Élő fiók-munkamenet (admin / felnőtt fiók) mellett el sem indul: a játékos-belépés nem zárhatja le csendben.
    if (req.isAuthenticated?.() === true) return toLogin(res, "fiok-munkamenet");
    // A visszatérési cél a `state` rekordjába kerül (PlayerStateStore.store), nem közös munkamenet-mezőbe.
    (req as Request & { playerReturnTo?: string | null }).playerReturnTo = sanitizePlayerReturnTo(req.query.returnTo);
    passport.authenticate(PLAYER_GOOGLE_STRATEGY, { scope: ["email"], prompt: "select_account" })(req, res, next);
  });

  return (req: Request, res: Response, next: NextFunction) => {
    if (!playerAccountsEnabled()) return toLogin(res, "nem-elerheto");
    if (req.isAuthenticated?.() === true) return toLogin(res, "fiok-munkamenet");
    // Egyedi visszahívás: a Passport így NEM hív req.login-t (req.user nem jön létre); a `state` / PKCE ellenőrzését a
    // PlayerStateStore végzi (ismeretlen / lejárt / más munkamenetbe tartozó `state` → sikertelen, senki nem lép be).
    passport.authenticate(PLAYER_GOOGLE_STRATEGY, { session: false }, (err: Error | null, player: { id: string } | false, info?: { code?: PlayerGoogleError; state?: { returnTo?: string | null } }) => {
      if (err) return toLogin(res, "google");
      if (!player) return toLogin(res, info?.code ?? "google");
      const returnTo = sanitizePlayerReturnTo(info?.state?.returnTo) ?? PLAYER_DEFAULT_RETURN;
      setPlayerSession(req, player.id).then(() => res.redirect(returnTo), next);
    })(req, res, next);
  };
}
