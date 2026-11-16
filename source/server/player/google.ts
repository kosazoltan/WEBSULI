/**
 * JM7b — a játékos KÜLÖN Google-útja (terv 10.4, D12 „deny by default”; tulajdonosi G11: „a játékhoz rendelt
 * Google-hozzáférés csak a nyilvános játékoldalakra vonatkozik, és játékos-fiókot hoz létre”).
 *
 *   GET /auth/player/google?returnTo=/fiok  → külön nevű Passport-stratégia („google-player”), `state` (login-CSRF ellen) +
 *                                             PKCE, csak `email` hatókör (név / profilkép nem is kerül hozzánk)
 *   GET /auth/google/callback               → a meglévő visszahívás az `oauthFlow === "player"` ágon ide ad át (auth.ts)
 *
 * Elválasztás: a verify a `users` táblát NEM érinti (nincs `upsertUser`, nincs `getUserByEmail`), `req.login`-t SEHOL nem
 * hívunk — a belépés csak `req.session.player`-t állít (session.ts). Admin e-mail-című Google-fiók itt is csak
 * játékos-fiókot kap; a két tábla között nincs automatikus összekapcsolás. Élő fiók-munkamenet (req.user, pl. admin)
 * mellett az út el sem indul, és a visszahívás sem cseréli le (a JM7a 409-es szabályának megfelelője: átirányítás
 * hibakóddal, az admin bent marad). A visszatérési cél csak a belső engedélylistáról jöhet (nyílt átirányítás ellen).
 * Ugyanaz a kliens-azonosító és ugyanaz a callback URL, mint az admin-úté → a Google-konzolban nincs teendő.
 */
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { logger } from "../lib/logger";
import { maskEmail } from "../lib/mask-email";
import type { PlayerAccountStore } from "./account-store";
import { normalizeEmail } from "./codes";
import { playerAccountsEnabled, requirePlayerAccountsFlag } from "./require-player";
import { setPlayerSession } from "./session";

declare module "express-session" {
  interface SessionData {
    /** A folyamatban lévő Google-belépés fajtája: csak a játékos-út indítója állítja, a visszahívás törli. */
    oauthFlow?: "player";
    playerOauthReturnTo?: string;
  }
}

export const PLAYER_GOOGLE_STRATEGY = "google-player";
/** Külön munkamenet-kulcs a `state` / PKCE-adatnak (az admin-út állapotától független). */
export const PLAYER_GOOGLE_SESSION_KEY = "oauth2:player-google";
export const PLAYER_DEFAULT_RETURN = "/fiok";

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
    sessionKey: PLAYER_GOOGLE_SESSION_KEY,
  }, (_accessToken, _refreshToken, profile, done) => {
    void verify(profile as GoogleProfileLike, done as unknown as VerifyDone);
  }));

  app.get("/auth/player/google", requirePlayerAccountsFlag, (req: Request, res: Response, next: NextFunction) => {
    // Élő fiók-munkamenet (admin / felnőtt fiók) mellett el sem indul: a játékos-belépés nem zárhatja le csendben.
    if (req.isAuthenticated?.() === true) return toLogin(res, "fiok-munkamenet");
    req.session.oauthFlow = "player";
    const target = sanitizePlayerReturnTo(req.query.returnTo);
    if (target) req.session.playerOauthReturnTo = target;
    else delete req.session.playerOauthReturnTo;
    passport.authenticate(PLAYER_GOOGLE_STRATEGY, { scope: ["email"], prompt: "select_account" })(req, res, next);
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const returnTo = sanitizePlayerReturnTo(req.session.playerOauthReturnTo) ?? PLAYER_DEFAULT_RETURN;
    delete req.session.oauthFlow;
    delete req.session.playerOauthReturnTo;
    if (!playerAccountsEnabled()) return toLogin(res, "nem-elerheto");
    if (req.isAuthenticated?.() === true) return toLogin(res, "fiok-munkamenet");
    // Egyedi visszahívás: a Passport így NEM hív req.login-t (req.user nem jön létre); a `state` / PKCE ellenőrzését a
    // stratégia végzi (eltérés / hiány → sikertelen, a munkamenet érintetlen).
    passport.authenticate(PLAYER_GOOGLE_STRATEGY, { session: false }, (err: Error | null, player: { id: string } | false, info?: { code?: PlayerGoogleError }) => {
      if (err) return toLogin(res, "google");
      if (!player) return toLogin(res, info?.code ?? "google");
      setPlayerSession(req, player.id).then(() => res.redirect(returnTo), next);
    })(req, res, next);
  };
}
