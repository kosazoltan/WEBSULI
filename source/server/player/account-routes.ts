/**
 * JM7b — a „kis fiók” végpontjai (terv 10.4 „Fiókoldal”, „Kapcsolat a tanulói profillal”, D11; JM-A11, JM-A15).
 * Mind a `PLAYER_ACCOUNTS` flag (alapból KI → 404) és a `requirePlayer` (nincs munkamenet → 401, tiltott → 403) mögött;
 * az írások CSRF-tokenesek (a routes.ts globális őre) ÉS Origin-allowlistesek, játékosonként sebességkorlátosak.
 *
 *   GET  /api/player/account               → saját fiók: becenév, avatar, maszkolt cím, Google / tanulói kapcsolat jelzője
 *   GET  /api/player/nickname-suggestions  → szabad, ajánlott becenevek
 *   POST /api/player/profile               → { nickname?, avatar? } — szűrő (shared/player-nickname.ts), foglaltság az
 *                                             egyedi kulcs-indexen; ütközésnél 409 + `#1234`-es javaslat
 *   POST /api/player/link-learner          → { confirm: true } + `X-Learner-Token` fejléc: az eszközön tárolt, ALÁÍRT tanulói
 *                                             token szerveroldali ellenőrzése után; egy tanulói profil egy fiókhoz
 *   POST /api/player/unlink-learner        → a kapcsolat bontása
 *   POST /api/player/export                → JSON letöltés: KIZÁRÓLAG a saját fiók tárolt adatai
 *   POST /api/player/account/delete/start  → egyszeri törlési kód a fiók e-mail-címére (review #449 A3)
 *   POST /api/player/account/delete        → { confirm: "TÖRLÖM", code }: fiók, kódrekordok, minden munkamenet törlése
 *                                             (account-store.ts deleteAccount) + értesítő levél a fiók címére
 * Napló: e-mail csak maszkolva, tanulói token és tanulónév soha.
 */
import { randomInt } from "node:crypto";
import express, { type Request, type RequestHandler, type Response, type Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { isAvatarKey } from "@shared/player-avatars";
import { NICKNAME_MESSAGES, checkPlayerNickname, suggestNicknames, withDiscriminator } from "@shared/player-nickname";
import { clientIpKeyGenerator } from "../lib/client-ip";
import { logger } from "../lib/logger";
import { maskEmail } from "../lib/mask-email";
import { enforceOriginAllowlist } from "../lib/origin-guard";
import type { PlayerAccountStore } from "./account-store";
import { CODE_PATTERN, codeHash, emailHash, generateCode, generateLinkToken, limitHash, linkHash, playerAuthKey } from "./codes";
import type { PlayerMailer } from "./auth-routes";
import { buildAccountDeletedEmail, buildDeleteCodeEmail } from "./email-template";
import { createRequirePlayer, requirePlayerAccountsFlag } from "./require-player";
import { destroyPlayerSession, getPlayerSessionAuthAt, getPlayerSessionId } from "./session";
import type { PlayerStore } from "./store";

export const DELETE_CONFIRM_WORD = "TÖRLÖM";
/** A tanulói összekapcsoláshoz a belépés legfeljebb ennyi ideje történhetett (review #449 K2: friss belépés). */
export const FRESH_LOGIN_MS = 30 * 60_000;
/** A törlésről szóló értesítő levelek szerverszintű napi plafonja (a belépő levelek keretétől független, szűk). */
export const DELETED_NOTICE_DAILY_MAX = 50;
const DELETE_CODE_PREFIX = "del:";

export type PlayerAccountDeps = {
  store: Pick<PlayerStore, "getPlayer" | "reserveCode" | "consumeCode">;
  /** A fiók e-mail-címére menő levelek (törlési kód, törlés-értesítő) — a belépő levelek küldője. */
  mailer: PlayerMailer;
  accounts: PlayerAccountStore;
  /** Aláírt tanulói token → tanuló azonosítója (a meglévő `resolveLearner`, server/learners.ts); érvénytelen → null. */
  resolveLearnerId: (token: string) => Promise<string | null>;
  now?: () => number;
};

const profileSchema = z.object({
  nickname: z.string().max(64).optional(),
  avatar: z.string().max(32).optional(),
}).strict();
const linkSchema = z.object({ confirm: z.literal(true) }).strict();
const deleteSchema = z.object({ confirm: z.string().max(16), code: z.string().max(16) }).strict();
const LEARNER_TOKEN_SHAPE = /^[A-Za-z0-9-]{8,64}\.[1-9][0-9]{0,8}\.[A-Za-z0-9_-]{22}$/;

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

const errMsg = (error: unknown) => (error instanceof Error ? error.message : "ismeretlen hiba");

/** Levélküldési hiba naplózása: a cím csak maszkolva, a hibaüzenetből is kicserélve. */
function logMailFailure(what: string, address: string, mailError: unknown): void {
  const masked = maskEmail(address);
  const reason = errMsg(mailError).replaceAll(address, masked);
  logger.error(`[PLAYER] ${what} (${masked}): ${reason}`);
}

/** Játékosonként (munkamenet-azonosítóval), annak hiányában IP-nként számolt korlát. */
function playerLimiter(windowMs: number, max: number, message: string): RequestHandler {
  return rateLimit({
    windowMs, max, standardHeaders: true, legacyHeaders: false, message: { ok: false, code: "RATE_LIMITED", message },
    keyGenerator: (req) => {
      const id = getPlayerSessionId(req as Request);
      return id ? `player:${id}` : `ip:${clientIpKeyGenerator(req as Request)}`;
    },
  });
}

export function createPlayerAccountRouter(deps: PlayerAccountDeps): Router {
  const router = express.Router();
  const requirePlayer = createRequirePlayer(deps.store);
  const now = deps.now ?? Date.now;
  const writeLimiter = playerLimiter(15 * 60_000, 40, "Túl sok módosítás. Próbáld újra egy kicsit később!");
  const readLimiter = playerLimiter(15 * 60_000, 120, "Túl sok kérés. Próbáld újra egy kicsit később!");
  const heavyLimiter = playerLimiter(60 * 60_000, 6, "Ezt most túl sokszor kérted. Próbáld újra egy óra múlva!");
  const deleteStartLimiter = playerLimiter(60 * 60_000, 4, "Ezt most túl sokszor kérted. Próbáld újra egy óra múlva!");
  const deleteLimiter = playerLimiter(60 * 60_000, 10, "Túl sok próbálkozás. Próbáld újra egy óra múlva!");

  const playerId = (res: Response) => (res.locals.player as { id: string }).id;

  /** Szabad változat ütközéskor: becenév + `#` + 4 számjegy, a foglaltsági kulcson ellenőrizve. */
  async function freeVariant(nickname: string, selfId: string): Promise<string | null> {
    for (let i = 0; i < 6; i++) {
      const candidate = withDiscriminator(nickname, randomInt(0, 10_000));
      const check = checkPlayerNickname(candidate);
      if (check.ok && await deps.accounts.isNicknameKeyFree(check.key, selfId)) return check.nickname;
    }
    return null;
  }

  router.get("/account", requirePlayerAccountsFlag, readLimiter, requirePlayer, async (_req, res) => {
    noStore(res);
    try {
      const a = await deps.accounts.getAccount(playerId(res));
      if (!a) return res.status(401).json({ message: "Unauthorized" });
      return res.json({
        id: a.id, nickname: a.nickname, avatar: a.avatarKey, needsProfile: a.nickname === null, maskedEmail: maskEmail(a.email),
        googleLinked: a.googleLinked, learnerLinked: a.learnerLinked, createdAt: a.createdAt,
      });
    } catch (error) {
      logger.error("[PLAYER] fiók-lekérés hiba:", errMsg(error));
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  router.get("/nickname-suggestions", requirePlayerAccountsFlag, readLimiter, requirePlayer, async (_req, res) => {
    noStore(res);
    try {
      const pool = suggestNicknames(() => randomInt(0, 1_000_000) / 1_000_000, 12);
      const free: string[] = [];
      for (const name of pool) {
        if (free.length >= 4) break;
        const check = checkPlayerNickname(name);
        if (check.ok && await deps.accounts.isNicknameKeyFree(check.key, playerId(res))) free.push(check.nickname);
      }
      return res.json({ suggestions: free });
    } catch (error) {
      logger.error("[PLAYER] becenév-ajánlás hiba:", errMsg(error));
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  router.post("/profile", requirePlayerAccountsFlag, enforceOriginAllowlist, writeLimiter, requirePlayer, async (req, res) => {
    noStore(res);
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success || (parsed.data.nickname === undefined && parsed.data.avatar === undefined)) {
      return res.status(400).json({ ok: false, code: "BAD_REQUEST" });
    }
    const { nickname, avatar } = parsed.data;
    if (avatar !== undefined && !isAvatarKey(avatar)) return res.status(400).json({ ok: false, code: "BAD_AVATAR" });
    let nick: { value: string; key: string } | undefined;
    if (nickname !== undefined) {
      const check = checkPlayerNickname(nickname);
      if (!check.ok) {
        return res.status(400).json({ ok: false, code: "BAD_NICKNAME", problems: check.problems, messages: check.problems.map((p) => NICKNAME_MESSAGES[p]) });
      }
      nick = { value: check.nickname, key: check.key };
    }
    try {
      const id = playerId(res);
      const result = await deps.accounts.setProfile(id, { nickname: nick, avatarKey: avatar });
      if (result === "NICKNAME_TAKEN") {
        return res.status(409).json({ ok: false, code: "NICKNAME_TAKEN", suggestion: await freeVariant(nick!.value, id) });
      }
      if (result === "NOT_FOUND") return res.status(401).json({ message: "Unauthorized" });
      return res.json({ ok: true, nickname: nick?.value ?? undefined, avatar });
    } catch (error) {
      logger.error("[PLAYER] profil-mentés hiba:", errMsg(error));
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  router.post("/link-learner", requirePlayerAccountsFlag, enforceOriginAllowlist, writeLimiter, requirePlayer, async (req, res) => {
    noStore(res);
    // Kifejezett megerősítés (a kliens párbeszéde után) ÉS érvényes, aláírt tanulói token kell — más tanuló profilja
    // token nélkül nem kapcsolható; a válasz semmilyen tanulói adatot (nevet, évfolyamot) nem ad vissza.
    if (!linkSchema.safeParse(req.body).success) return res.status(400).json({ ok: false, code: "CONFIRM_REQUIRED" });
    // Review #449 (K2): friss belépés kell (közös eszközön egy régóta nyitva hagyott munkamenetből ne lehessen kötni).
    const linkAuthAt = getPlayerSessionAuthAt(req);
    if (linkAuthAt === null || now() - linkAuthAt > FRESH_LOGIN_MS || linkAuthAt > now() + 60_000) {
      return res.status(401).json({ ok: false, code: "REAUTH_REQUIRED" });
    }
    const token = req.get("x-learner-token") ?? "";
    if (!LEARNER_TOKEN_SHAPE.test(token)) return res.status(400).json({ ok: false, code: "LEARNER_TOKEN_INVALID" });
    try {
      const learnerId = await deps.resolveLearnerId(token);
      if (!learnerId) return res.status(400).json({ ok: false, code: "LEARNER_TOKEN_INVALID" });
      const result = await deps.accounts.linkLearner(playerId(res), learnerId);
      if (result === "TAKEN") return res.status(409).json({ ok: false, code: "LEARNER_ALREADY_LINKED" });
      logger.info("[PLAYER] tanulói profil összekapcsolva");
      return res.json({ ok: true, learnerLinked: true });
    } catch (error) {
      logger.error("[PLAYER] tanulói összekapcsolás hiba:", errMsg(error));
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  router.post("/unlink-learner", requirePlayerAccountsFlag, enforceOriginAllowlist, writeLimiter, requirePlayer, async (_req, res) => {
    noStore(res);
    try {
      await deps.accounts.unlinkLearner(playerId(res));
      return res.json({ ok: true, learnerLinked: false });
    } catch (error) {
      logger.error("[PLAYER] tanulói kapcsolat bontási hiba:", errMsg(error));
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  router.post("/export", requirePlayerAccountsFlag, enforceOriginAllowlist, heavyLimiter, requirePlayer, async (_req, res) => {
    noStore(res);
    try {
      const key = playerAuthKey();
      const data = await deps.accounts.exportAccount(playerId(res), (email) => emailHash(key, email));
      if (!data) return res.status(401).json({ message: "Unauthorized" });
      res.setHeader("Content-Disposition", 'attachment; filename="websuli-fiokom.json"');
      return res.json({
        format: "websuli-player-export-v1",
        exportedAt: new Date(now()).toISOString(),
        ...data,
        // JM8 előtt nincs szerveroldali pontkönyv: a játékokban gyűjtött haladás ezen az eszközön (localStorage) él.
        gameRuns: [],
      });
    } catch (error) {
      logger.error("[PLAYER] adatletöltés hiba:", errMsg(error));
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  /**
   * Review #449 (A3): a törlés KÖZVETLEN megerősítést kér — egyszeri kódot a fiók e-mail-címére (a belépőkódok
   * infrastruktúrájával, céljához kötött hash-sel: belépőkódként nem használható, és fordítva). A válasz mindig 202.
   */
  router.post("/account/delete/start", requirePlayerAccountsFlag, enforceOriginAllowlist, deleteStartLimiter, requirePlayer, async (_req, res) => {
    noStore(res);
    try {
      const email = await deps.accounts.playerEmailById(playerId(res));
      if (!email) return res.status(401).json({ message: "Unauthorized" });
      const key = playerAuthKey();
      const eh = emailHash(key, email);
      const code = generateCode();
      const reserved = await deps.store.reserveCode({
        emailNormalized: email, emailHash: eh, limitHash: limitHash(key, email),
        codeHash: codeHash(key, eh, `${DELETE_CODE_PREFIX}${code}`), linkHash: linkHash(key, generateLinkToken()),
      });
      if (reserved !== "OK") {
        logger.info(`[PLAYER] törlési kód korláton (${reserved}): ${maskEmail(email)}`);
        return res.status(202).json({ ok: true });
      }
      void deps.mailer(email, buildDeleteCodeEmail({ code })).catch((mailError: unknown) => {
        logMailFailure("a törlési kód levele nem ment ki", email, mailError);
      });
      return res.status(202).json({ ok: true });
    } catch (error) {
      logger.error("[PLAYER] törlési kód hiba:", errMsg(error));
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  let noticeDay = "";
  let noticeCount = 0;
  const noticeAllowed = () => {
    const day = new Date(now()).toISOString().slice(0, 10);
    if (day !== noticeDay) { noticeDay = day; noticeCount = 0; }
    if (noticeCount >= DELETED_NOTICE_DAILY_MAX) return false;
    noticeCount++;
    return true;
  };

  router.post("/account/delete", requirePlayerAccountsFlag, enforceOriginAllowlist, deleteLimiter, requirePlayer, async (req, res) => {
    noStore(res);
    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.confirm.normalize("NFC") !== DELETE_CONFIRM_WORD) {
      return res.status(400).json({ ok: false, code: "CONFIRM_REQUIRED" });
    }
    const code = parsed.data.code.replace(/\s/g, "");
    if (!CODE_PATTERN.test(code)) return res.status(400).json({ ok: false, code: "CODE_INVALID" });
    try {
      const id = playerId(res);
      const key = playerAuthKey();
      const email = await deps.accounts.playerEmailById(id);
      if (!email) return res.status(401).json({ message: "Unauthorized" });
      const eh = emailHash(key, email);
      // A kódrekord egyszeri, a fiókonkénti hibás-próba plafon (store.consumeCode) itt is érvényes.
      if ((await deps.store.consumeCode(eh, codeHash(key, eh, `${DELETE_CODE_PREFIX}${code}`))) === null) {
        return res.status(400).json({ ok: false, code: "CODE_INVALID" });
      }
      const result = await deps.accounts.deleteAccount(id, (e) => emailHash(key, e));
      if (!result) return res.status(401).json({ message: "Unauthorized" });
      await destroyPlayerSession(req);
      res.clearCookie("connect.sid", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
      logger.info(`[PLAYER] fiók törölve: ${maskEmail(email)} (kódrekord: ${result.codes}, munkamenet: ${result.sessions})`);
      if (noticeAllowed()) {
        void deps.mailer(email, buildAccountDeletedEmail()).catch((mailError: unknown) => {
          logMailFailure("a törlés-értesítő nem ment ki", email, mailError);
        });
      } else {
        logger.warn("[PLAYER] a törlés-értesítők napi plafonja betelt — értesítő nem ment ki");
      }
      return res.json({ ok: true, deleted: result });
    } catch (error) {
      logger.error("[PLAYER] fióktörlés hiba:", errMsg(error));
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  });

  return router;
}
