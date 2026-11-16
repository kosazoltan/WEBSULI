import rateLimit from "express-rate-limit";
import type { Request, RequestHandler } from "express";

/**
 * JM0: a `POST /api/games/score` kéréskorlátjai.
 *  - elsődleges: bejelentkezett FELHASZNÁLÓnként 60 / 15 perc (közös IP mögött — osztályterem, testvérek, mobil-NAT — is
 *    mindenki külön keretet kap); a végpont bejelentkezést követel, ezért a kulcs mindig a felhasználó azonosítója;
 *  - mellette laza IP-plafon (600 / 15 perc) az elárasztás ellen — az index.ts köti be, a valódi kliens-IP-vel (lib/client-ip.ts).
 * A 429 válasza semmilyen személyes adatot nem tartalmaz; a `Retry-After` fejlécet a könyvtár állítja.
 */
export const GAME_SCORE_WINDOW_MS = 15 * 60 * 1000;
export const GAME_SCORE_USER_MAX = 60;
export const GAME_SCORE_IP_MAX = 600;
export const GAME_SCORE_LIMIT_MESSAGE = { message: "Túl sok pontbeküldés. Próbáld újra később!" };

export function createGameScoreUserLimiter(max: number = GAME_SCORE_USER_MAX): RequestHandler {
  return rateLimit({
    windowMs: GAME_SCORE_WINDOW_MS,
    max,
    // A kulcs a felhasználó azonosítója; hiányában (nem fordulhat elő az isAuthenticated után) közös, szigorú vödör.
    keyGenerator: (req: Request) => `user:${(req.user as { id?: string } | undefined)?.id ?? "anonymous"}`,
    message: GAME_SCORE_LIMIT_MESSAGE,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
  });
}
