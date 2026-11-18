/**
 * JM2 — a valós idejű réteg HTTP-végpontjai (végrehajtás JM2 4. és 9. lépés; terv 10.3, 10.8, 10.9).
 *
 *   POST /api/rt/ticket → { ticket, expiresIn: 60, path, directUrl }   — belépőjegy a Socket.IO-kapcsolathoz
 *   GET  /api/rt/status → { enabled, mode, games, activeRooms, activeMatches, connections, draining, runsPriority, protocol }
 *
 * A jegy-végpont a megszokott HTTP-úton (munkamenet-süti) azonosít: játékos-fiók (`PLAYER_ACCOUNTS` mellett), meglévő
 * felhasználó (admin is — de a szobában ez semmilyen jogot nem ad), tanulói profil (`x-learner-token`), különben vendég.
 * A megjelenítendő név MINDIG becenév: a játékos-fiók szűrt beceneve, egyébként generált (`guestNickname`) — valódi név,
 * e-mail soha nem kerül a jegybe és a protokollba. CSRF: munkamenet előtt (vendég) nincs CSRF-token, ezért — mint a
 * `/api/player/auth/*` — Origin/Referer-engedélylista őrzi (a `routes.ts` kivétel-listája), plusz IP-korlát.
 * `MP_MODE=off` → a jegy-végpont 404. Szobanyitás (JM3a, terv D21 / JM-A4): `admin` módban csak admin-munkamenet,
 * `on` módban játékos-fiók / párosított tanulói profil / admin kap `create` jegyet (különben 403 `FEATURE_DISABLED` /
 * `ACCOUNT_REQUIRED`); csatlakozó (`join`) jegyet mindkét módban bárki kap — vendégként is, generált becenévvel.
 * A státusz nyilvános: csak számok (a telepítés előtti „futó meccs” őr erre épül), személyes adat nélkül.
 */
import { createHmac, randomBytes } from "node:crypto";
import express, { type Request, type Response, type Router } from "express";
import rateLimit from "express-rate-limit";
import { guestNickname, nicknameProblems } from "../../shared/nicknames";
import { RT_MAX_GRADE, RT_MIN_GRADE, RT_PATH, ticketRequestSchema } from "../../shared/duel/protocol";
import { isAdminUser } from "../lib/admin-access";
import { clientIpKeyGenerator } from "../lib/client-ip";
import type { RealtimeService } from "../realtime";
import { canCreateRoom, ticketSecret, type TicketClaims, type TicketKind } from "../realtime/ticket";

export type RtRouterDeps = {
  /** Tanulói profil a tokenből (név a válaszban van, de MI csak az azonosítót és az évfolyamot használjuk). */
  resolveLearner?: (token: string) => Promise<{ id: string; grade: number } | null>;
  /** Bejelentkezett, nem tiltott játékos a munkamenetből (`PLAYER_ACCOUNTS` mellett), különben null. */
  getPlayer?: (req: Request) => Promise<{ id: string; nickname: string | null; banned: boolean } | null>;
};

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

/** Stabil, nem visszafejthető becenév-seed egy belső azonosítóból (a jegy-kulcstól független, a nevet nem árulja el). */
function stableSeed(secret: string, kind: string, id: string): string {
  return createHmac("sha256", secret).update(`rt-nick:${kind}:${id}`).digest("base64url").slice(0, 16);
}

export function createRtRouter(rt: RealtimeService, deps: RtRouterDeps = {}): Router {
  const router = express.Router();
  const secretForSeeds = ticketSecret() ?? randomBytes(32).toString("hex");

  router.get("/status", (_req, res) => {
    noStore(res);
    res.json(rt.status());
  });

  const ticketLimiter = rateLimit({
    keyGenerator: clientIpKeyGenerator,
    windowMs: 60_000,
    max: () => rt.config().ticketsPerMinPerIp,
    message: { code: "RATE_LIMITED" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.post(
    "/ticket",
    (_req, res, next) => {
      // A kapcsoló a korlát ELŐTT: kikapcsolt állapotban a végpont mintha nem is létezne.
      if (rt.config().mode === "off") return res.status(404).json({ message: "Not found" });
      next();
    },
    ticketLimiter,
    async (req: Request, res: Response) => {
      noStore(res);
      const cfg = rt.config();
      if (!rt.tickets || !rt.gateway) return res.status(503).json({ code: "FEATURE_DISABLED" });
      if (rt.draining) return res.status(503).json({ code: "SERVER_RESTART" });
      const body = ticketRequestSchema.safeParse(req.body ?? {});
      if (!body.success) return res.status(400).json({ code: "BAD_MESSAGE" });

      const user = req.isAuthenticated?.() ? req.user : undefined;
      const isAdmin = isAdminUser(user); // JM7c-1: az egyetlen admin-képlet
      const wantsCreate = body.data.intent === "create";
      // Admin módban a szobát csak admin nyithatja; a kóddal csatlakozó (vendég is) jegyet kap (D21, JM-A4).
      if (cfg.mode === "admin" && wantsCreate && !isAdmin) return res.status(403).json({ code: "FEATURE_DISABLED" });

      let kind: TicketKind = "guest";
      let sub = `guest:${randomBytes(12).toString("base64url")}`;
      let nickname = guestNickname(randomBytes(8).toString("hex"));
      let grade: number | null = null;
      try {
        // Review #452 ALACSONY-6: az admin-munkamenet elsőbbséget élvez (admin módban akkor is belép, ha játékos-fiókja is
        // él); a jegy `admin` jogcíme csak a mód kapuját nyitja, a szobában semmilyen jogot nem ad.
        const player = !isAdmin && deps.getPlayer ? await deps.getPlayer(req) : null;
        if (player?.banned) return res.status(403).json({ code: "FEATURE_DISABLED" });
        if (isAdmin && user) {
          kind = "admin";
          sub = `user:${user.id}`;
          nickname = guestNickname(stableSeed(secretForSeeds, "user", String(user.id)));
        } else if (player) {
          kind = "player";
          sub = `player:${player.id}`;
          const nick = (player.nickname ?? "").trim();
          nickname = nick && nicknameProblems(nick).length === 0 ? nick : guestNickname(stableSeed(secretForSeeds, "player", player.id));
        } else {
          // JM3a: a párosított tanulói profil a fiók nélküli régi felhasználói munkamenet (`user`) ELŐTT — szobát nyithat (D21).
          const token = req.get("x-learner-token");
          const learner = token && deps.resolveLearner ? await deps.resolveLearner(token) : null;
          if (learner) {
            kind = "learner";
            sub = `learner:${learner.id}`;
            nickname = guestNickname(stableSeed(secretForSeeds, "learner", learner.id));
            grade = Number.isInteger(learner.grade) && learner.grade >= RT_MIN_GRADE && learner.grade <= RT_MAX_GRADE ? learner.grade : null;
          } else if (user) {
            kind = "user";
            sub = `user:${user.id}`;
            nickname = guestNickname(stableSeed(secretForSeeds, "user", String(user.id)));
          }
        }
      } catch {
        return res.status(503).json({ code: "FEATURE_DISABLED" });
      }
      if (wantsCreate && !canCreateRoom(cfg.mode, kind)) return res.status(403).json({ code: "ACCOUNT_REQUIRED" });

      const intent: TicketClaims["intent"] = body.data.intent === "join" ? { kind: "join", code: body.data.code } : { kind: "create", code: null };
      const { ticket } = rt.tickets.issue({ kind, sub, nickname, avatar: null, grade, intent });
      return res.json({
        ticket,
        expiresIn: Math.round(rt.tickets.ttlMs / 1000),
        path: RT_PATH,
        directUrl: cfg.directUrl,
        nickname,
        grade,
      });
    },
  );

  return router;
}
