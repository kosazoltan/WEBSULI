/**
 * JM7a — játékos e-mailes belépés / regisztráció (terv 10.4, D11 / D12; végrehajtás „JM7a” 3–6.).
 *
 *   GET  /api/player/status        → { enabled }  (mindig válaszol; a kliens ebből tudja, mutasson-e „Belépés” gombot)
 *   POST /api/player/auth/start    → 202 mindig (nem árulja el, létezik-e a fiók); kód + link e-mailben
 *   POST /api/player/auth/link-info → a link megerősítő képernyőjéhez: maszkolt cím, beváltás NÉLKÜL
 *   POST /api/player/auth/verify   → { kind: "code", email, code } | { kind: "link", linkToken } — egy közös, atomikus út;
 *                                    élő fiók-munkamenet (req.user, pl. admin) mellett 409, a munkamenet érintetlen
 *   POST /api/player/auth/logout   → a munkamenet megszűnik
 *   GET  /api/player/me            → a bejelentkezett játékos (null, ha nincs) — e-mail nélkül
 * A flag (`PLAYER_ACCOUNTS`) kikapcsolt állapotában a status kivételével minden 404.
 *
 * Biztonság: a belépés csak `req.session.player`-t állít (session.ts), `req.login`-t soha → admin-jog semmilyen úton.
 * Napló: e-mail-cím csak `maskEmail`-lel, kód / token soha. CSRF: az `/auth/*` út origin-allowlistes (mint a /api/login —
 * a routes.ts CSRF-kivétele), a többi írás CSRF-tokenes.
 */
import express, { type Request, type Response, type Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { clientIpKeyGenerator } from "../lib/client-ip";
import { logger } from "../lib/logger";
import { maskEmail } from "../lib/mask-email";
import { isResendConfigured, sendPlayerLoginEmail } from "../resend";
import {
  CODE_PATTERN, DAY_MS, LINK_TOKEN_PATTERN, START_PER_IP_DAILY_MAX, START_PER_IP_MAX, START_WINDOW_MS, VERIFY_PER_IP_MAX,
  allPurposeEmailHashes, codeHash, emailHash, generateCode, generateLinkToken, limitHash, linkHash, normalizeEmail, playerAuthKey,
} from "./codes";
import { buildPlayerLoginEmail, playerLoginLink, type PlayerLoginEmail } from "./email-template";
import { createRequirePlayer, playerAccountsEnabled, requirePlayerAccountsFlag } from "./require-player";
import { destroyPlayerSession, getPlayerSessionId, setPlayerSession } from "./session";
import type { PlayerStore } from "./store";

export type PlayerMailer = (to: string, mail: PlayerLoginEmail) => Promise<void>;

export type PlayerRouterDeps = {
  store: PlayerStore;
  mailer: PlayerMailer;
  /** A belépő link alapcíme; null → nincs érvényes (https, várt eredetű) FRONTEND_URL, levél nem megy ki. */
  baseUrl: () => string | null;
};

/** Éles küldő: a meglévő Resend-kliens. Beállítatlan Resend (helyi / e2e futás) mellett nem küld — valódi levél tesztből nem megy. */
export const defaultPlayerMailer: PlayerMailer = async (to, mail) => {
  const config = isResendConfigured();
  if (!config.ok) {
    logger.warn(`[PLAYER] a belépő levél nem küldhető: ${config.reason ?? "a Resend nincs beállítva"}`);
    return;
  }
  await sendPlayerLoginEmail(to, mail);
};

const startSchema = z.object({ email: z.string().max(320) }).strict();
const verifySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("code"), email: z.string().max(320), code: z.string().regex(CODE_PATTERN) }).strict(),
  z.object({ kind: z.literal("link"), linkToken: z.string().regex(LINK_TOKEN_PATTERN) }).strict(),
]);
const linkInfoSchema = z.object({ linkToken: z.string().regex(LINK_TOKEN_PATTERN) }).strict();

const INVALID = { ok: false, code: "INVALID_OR_EXPIRED" } as const;

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function createPlayerRouter(deps: PlayerRouterDeps): Router {
  const router = express.Router();
  const requirePlayer = createRequirePlayer(deps.store);

  const startIpLimiter = rateLimit({
    keyGenerator: clientIpKeyGenerator, windowMs: START_WINDOW_MS, max: START_PER_IP_MAX,
    message: { message: "Túl sok kódkérés. Próbáld újra később!" }, standardHeaders: true, legacyHeaders: false,
  });
  const startIpDailyLimiter = rateLimit({
    keyGenerator: clientIpKeyGenerator, windowMs: DAY_MS, max: START_PER_IP_DAILY_MAX,
    message: { message: "Túl sok kódkérés. Próbáld újra később!" }, standardHeaders: true, legacyHeaders: false,
  });
  const verifyIpLimiter = rateLimit({
    keyGenerator: clientIpKeyGenerator, windowMs: START_WINDOW_MS, max: VERIFY_PER_IP_MAX,
    message: { message: "Túl sok próbálkozás. Próbáld újra később!" }, standardHeaders: true, legacyHeaders: false,
  });

  router.get("/status", (_req, res) => {
    res.json({ enabled: playerAccountsEnabled() });
  });

  router.post("/auth/start", requirePlayerAccountsFlag, startIpLimiter, startIpDailyLimiter, async (req: Request, res: Response) => {
    noStore(res);
    const parsed = startSchema.safeParse(req.body);
    const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
    if (!email) return res.status(400).json({ ok: false, code: "INVALID_EMAIL" });
    try {
      const base = deps.baseUrl();
      if (!base) {
        logger.error(`[PLAYER] a FRONTEND_URL hiányzik vagy nem a várt https-eredet — belépő levél nem megy ki (${maskEmail(email)})`);
        return res.status(202).json({ ok: true });
      }
      const key = playerAuthKey();
      const eh = emailHash(key, email);
      const code = generateCode();
      const token = generateLinkToken();
      // Keret (korlát-kulcsonként és szerverszinten), atomikusan lefoglalva: betelt keretnél csendben (ugyanaz a 202), levél nélkül.
      const reserved = await deps.store.reserveCode({ emailNormalized: email, emailHash: eh, limitHash: limitHash(key, email), codeHash: codeHash(key, eh, code), linkHash: linkHash(key, token) });
      if (reserved === "GLOBAL_LIMIT") {
        logger.warn("[PLAYER] a belépő levelek napi szerverszintű plafonja betelt (PLAYER_LOGIN_EMAIL_DAILY_MAX) — küldés szünetel");
        return res.status(202).json({ ok: true });
      }
      if (reserved === "KEY_LIMIT") {
        logger.info(`[PLAYER] belépőkód-kérés címenkénti korláton: ${maskEmail(email)}`);
        return res.status(202).json({ ok: true });
      }
      const mail = buildPlayerLoginEmail({ code, link: playerLoginLink(base, token) });
      // A levél a válasz UTÁN megy ki (nem várjuk meg): a válaszidő így nem árulja el, hogy a keret betelt-e (időzítés
      // alapú felsorolás ellen); a küldési hiba csak maszkolva naplózódik.
      void deps.mailer(email, mail).catch((mailError: unknown) => {
        const masked = maskEmail(email);
        const reason = (mailError instanceof Error ? mailError.message : "ismeretlen hiba").replaceAll(email, masked);
        logger.error(`[PLAYER] a belépő levél nem ment ki (${masked}): ${reason}`);
      });
      return res.status(202).json({ ok: true });
    } catch (error) {
      logger.error("[PLAYER] belépőkód-kérés hiba:", error instanceof Error ? error.message : "ismeretlen hiba");
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  router.post("/auth/link-info", requirePlayerAccountsFlag, verifyIpLimiter, async (req: Request, res: Response) => {
    noStore(res);
    const parsed = linkInfoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(INVALID);
    try {
      const email = await deps.store.peekLink(linkHash(playerAuthKey(), parsed.data.linkToken));
      if (!email) return res.status(400).json(INVALID);
      const currentId = getPlayerSessionId(req);
      const currentEmail = currentId ? await deps.store.playerEmail(currentId) : null;
      return res.json({
        ok: true,
        maskedEmail: maskEmail(email),
        current: currentEmail === null ? "none" : currentEmail === email ? "same" : "other",
        accountSession: req.isAuthenticated?.() === true,
      });
    } catch (error) {
      logger.error("[PLAYER] link-info hiba:", error instanceof Error ? error.message : "ismeretlen hiba");
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  router.post("/auth/verify", requirePlayerAccountsFlag, verifyIpLimiter, async (req: Request, res: Response) => {
    noStore(res);
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(INVALID);
    // Review #445 (K3): élő fiók-munkamenet (Passport req.user — admin vagy meglévő felhasználó) mellett a játékos-belépés
    // NEM szünteti meg csendben: elutasítjuk, mielőtt a kódot / linket elhasználnánk; előbb ki kell lépni.
    if (req.isAuthenticated?.() === true) return res.status(409).json({ ok: false, code: "ACCOUNT_SESSION" });
    try {
      const key = playerAuthKey();
      let confirmedEmail: string | null = null;
      if (parsed.data.kind === "code") {
        const email = normalizeEmail(parsed.data.email);
        if (email) {
          const eh = emailHash(key, email);
          confirmedEmail = await deps.store.consumeCode(eh, codeHash(key, eh, parsed.data.code), allPurposeEmailHashes(key, email));
        }
      } else {
        confirmedEmail = await deps.store.consumeLink(linkHash(key, parsed.data.linkToken));
      }
      if (!confirmedEmail) return res.status(400).json(INVALID);
      const player = await deps.store.confirmVerifiedEmail(confirmedEmail);
      if (player.banned) {
        // N2 (tulajdonosi döntés 2026-11-16): a tiltott játékos is letöltheti az adatait és törölheti a fiókját — ehhez
        // KORLÁTOZOTT munkamenetet kap. Ez semmi mást nem nyit: a `requirePlayer` minden kérésnél az adatbázisból nézi a
        // tiltást (403), csak a `requireOwnData` három végpontja (export, törlési kód, törlés) engedi be.
        await setPlayerSession(req, player.id);
        logger.info(`[PLAYER] tiltott fiók belépése (korlátozott munkamenet): ${maskEmail(confirmedEmail)}`);
        return res.status(403).json({ ok: false, code: "BANNED", restricted: true });
      }
      await setPlayerSession(req, player.id);
      logger.info(`[PLAYER] belépés (${parsed.data.kind}): ${maskEmail(confirmedEmail)}`);
      return res.json({ ok: true, player: { id: player.id, nickname: player.nickname, needsProfile: player.nickname === null } });
    } catch (error) {
      logger.error("[PLAYER] beváltási hiba:", error instanceof Error ? error.message : "ismeretlen hiba");
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  router.post("/auth/logout", requirePlayerAccountsFlag, async (req: Request, res: Response, next) => {
    try {
      await destroyPlayerSession(req);
      res.clearCookie("connect.sid", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
      res.sendStatus(200);
    } catch (error) {
      next(error);
    }
  });

  router.get("/me", requirePlayerAccountsFlag, (req: Request, res: Response, next) => {
    noStore(res);
    if (!getPlayerSessionId(req)) return res.json(null);
    return requirePlayer(req, res, (err?: unknown) => {
      if (err) return next(err);
      const player = res.locals.player as { id: string; nickname: string | null };
      deps.store.touchLastSeen(player.id).catch((touchError: unknown) => {
        logger.warn("[PLAYER] last_seen_at frissítés hiba:", touchError instanceof Error ? touchError.message : "ismeretlen hiba");
      });
      res.json({ id: player.id, nickname: player.nickname, needsProfile: player.nickname === null });
    });
  });

  return router;
}
