/**
 * JM7a — a játékos-végpontok őrei. A `PLAYER_ACCOUNTS` bevezetési flag alapból KI: ilyenkor a regisztrációs / belépési
 * végpontok 404-et adnak (mintha nem léteznének); csak a `GET /api/player/status` válaszol `{ enabled: false }`-szal.
 */
import type { RequestHandler } from "express";
import type { PlayerRow, PlayerStore } from "./store";
import { getPlayerSessionId } from "./session";

/** Csak a pontos `on` / `1` / `true` kapcsol be (minden más, a hiány is: KI). Kérésenként olvassuk: env-váltás újraindítással. */
export function playerAccountsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.PLAYER_ACCOUNTS ?? "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

export const requirePlayerAccountsFlag: RequestHandler = (_req, res, next) => {
  if (!playerAccountsEnabled()) return res.status(404).json({ message: "Not found" });
  next();
};

/**
 * Bejelentkezett, nem tiltott játékos kell (`req.session.player`). Admin-munkamenet (req.user) itt NEM számít játékosnak,
 * és a játékos-munkamenet sem ad semmilyen más jogot. Nincs munkamenet → 401; tiltott → 403.
 */
export function createRequirePlayer(store: Pick<PlayerStore, "getPlayer">): RequestHandler {
  return (req, res, next) => {
    const id = getPlayerSessionId(req);
    if (!id) return res.status(401).json({ message: "Unauthorized" });
    store.getPlayer(id).then((player: PlayerRow | null) => {
      if (!player) return res.status(401).json({ message: "Unauthorized" });
      if (player.banned) return res.status(403).json({ message: "Forbidden", code: "BANNED" });
      res.locals.player = player;
      next();
    }, next);
  };
}
