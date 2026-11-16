/**
 * JM7a — játékos e-mailes belépés / regisztráció (terv 10.4, D11 / D12; végrehajtás „JM7a” 3–6.).
 *
 *   GET  /api/player/status        → { enabled }  (mindig válaszol; a kliens ebből tudja, mutasson-e „Belépés” gombot)
 *   POST /api/player/auth/start    → 202 mindig (nem árulja el, létezik-e a fiók); kód + link e-mailben
 *   POST /api/player/auth/verify   → { kind: "code", email, code } | { kind: "link", linkToken } — egy közös, atomikus út
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
  CODE_PATTERN, LINK_TOKEN_PATTERN, START_PER_EMAIL_MAX, START_PER_IP_MAX, START_WINDOW_MS, VERIFY_PER_IP_MAX,
  codeHash, emailHash, generateCode, generateLinkToken, linkHash, normalizeEmail, playerAuthKey,
} from "./codes";
import { buildPlayerLoginEmail, playerLoginLink, type PlayerLoginEmail } from "./email-template";
import { createRequirePlayer, playerAccountsEnabled, requirePlayerAccountsFlag } from "./require-player";
import { destroyPlayerSession, getPlayerSessionId, setPlayerSession } from "./session";
import type { PlayerStore } from "./store";

export type PlayerMailer = (to: string, mail: PlayerLoginEmail) => Promise<void>;

export type PlayerRouterDeps = {
  store: PlayerStore;
  mailer: PlayerMailer;
  baseUrl: () => string;
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
  const verifyIpLimiter = rateLimit({
    keyGenerator: clientIpKeyGenerator, windowMs: START_WINDOW_MS, max: VERIFY_PER_IP_MAX,
    message: { message: "Túl sok próbálkozás. Próbáld újra később!" }, standardHeaders: true, legacyHeaders: false,
  });

  router.get("/status", (_req, res) => {
    res.json({ enabled: playerAccountsEnabled() });
  });

  router.post("/auth/start", requirePlayerAccountsFlag, startIpLimiter, async (req: Request, res: Response) => {
    noStore(res);
    const parsed = startSchema.safeParse(req.body);
    const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
    if (!email) return res.status(400).json({ ok: false, code: "INVALID_EMAIL" });
    try {
      const key = playerAuthKey();
      const eh = emailHash(key, email);
      await deps.store.purgeOldCodes();
      // Címenkénti korlát: csendben (a válasz ugyanaz a 202), hogy a cím léte / használata ne derüljön ki.
      if ((await deps.store.recentStartCount(eh)) >= START_PER_EMAIL_MAX) {
        logger.info(`[PLAYER] belépőkód-kérés címenkénti korláton: ${maskEmail(email)}`);
        return res.status(202).json({ ok: true });
      }
      const code = generateCode();
      const token = generateLinkToken();
      await deps.store.insertCode({ emailNormalized: email, emailHash: eh, codeHash: codeHash(key, eh, code), linkHash: linkHash(key, token) });
      const mail = buildPlayerLoginEmail({ code, link: playerLoginLink(deps.baseUrl(), token) });
      try {
        await deps.mailer(email, mail);
      } catch (mailError) {
        const masked = maskEmail(email);
        const reason = (mailError instanceof Error ? mailError.message : "ismeretlen hiba").replaceAll(email, masked);
        logger.error(`[PLAYER] a belépő levél nem ment ki (${masked}): ${reason}`);
      }
      return res.status(202).json({ ok: true });
    } catch (error) {
      logger.error("[PLAYER] belépőkód-kérés hiba:", error instanceof Error ? error.message : "ismeretlen hiba");
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  router.post("/auth/verify", requirePlayerAccountsFlag, verifyIpLimiter, async (req: Request, res: Response) => {
    noStore(res);
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(INVALID);
    try {
      const key = playerAuthKey();
      let confirmedEmail: string | null = null;
      if (parsed.data.kind === "code") {
        const email = normalizeEmail(parsed.data.email);
        if (email) {
          const eh = emailHash(key, email);
          confirmedEmail = await deps.store.consumeCode(eh, codeHash(key, eh, parsed.data.code));
        }
      } else {
        confirmedEmail = await deps.store.consumeLink(linkHash(key, parsed.data.linkToken));
      }
      if (!confirmedEmail) return res.status(400).json(INVALID);
      const player = await deps.store.confirmVerifiedEmail(confirmedEmail);
      if (player.banned) {
        logger.info(`[PLAYER] tiltott fiók belépési kísérlete: ${maskEmail(confirmedEmail)}`);
        return res.status(403).json({ ok: false, code: "BANNED" });
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
