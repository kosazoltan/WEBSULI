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
/** JM7b: a `requirePlayer` példányok jelölője — a regressziós őr (admin-route-guard) a router-veremben erről ismeri fel. */
export const PLAYER_GUARD = Symbol.for("websuli.requirePlayer");

export function isPlayerGuard(fn: unknown): boolean {
  return typeof fn === "function" && (fn as unknown as Record<symbol, unknown>)[PLAYER_GUARD] === true;
}

export function createRequirePlayer(store: Pick<PlayerStore, "getPlayer">): RequestHandler {
  const guard: RequestHandler = (req, res, next) => {
    const id = getPlayerSessionId(req);
    if (!id) return res.status(401).json({ message: "Unauthorized" });
    store.getPlayer(id).then((player: PlayerRow | null) => {
      if (!player) return res.status(401).json({ message: "Unauthorized" });
      if (player.banned) return res.status(403).json({ message: "Forbidden", code: "BANNED" });
      res.locals.player = player;
      next();
    }, next);
  };
  Object.defineProperty(guard, PLAYER_GUARD, { value: true });
  return guard;
}

/**
 * JM7b-utójavítás N2 (tulajdonosi döntés 2026-11-16): „saját adat” őr — bejelentkezett játékos kell (nincs munkamenet /
 * nincs fiók → 401), de a TILTOTT is átmegy. KIZÁRÓLAG az adatletöltés és a fióktörlés (kódkérés + beváltás) végpontján
 * használható; a route-leltár őr-tesztje (tests/admin-route-guard.test.ts) tételesen ellenőrzi, hogy máshol nincs.
 * `res.locals.player` a munkamenet játékosa (a `banned` jelzővel együtt).
 */
export const OWN_DATA_GUARD = Symbol.for("websuli.requireOwnData");

export function isOwnDataGuard(fn: unknown): boolean {
  return typeof fn === "function" && (fn as unknown as Record<symbol, unknown>)[OWN_DATA_GUARD] === true;
}

export function createRequireOwnData(store: Pick<PlayerStore, "getPlayer">): RequestHandler {
  const guard: RequestHandler = (req, res, next) => {
    const id = getPlayerSessionId(req);
    if (!id) return res.status(401).json({ message: "Unauthorized" });
    store.getPlayer(id).then((player: PlayerRow | null) => {
      if (!player) return res.status(401).json({ message: "Unauthorized" });
      res.locals.player = player;
      next();
    }, next);
  };
  Object.defineProperty(guard, OWN_DATA_GUARD, { value: true });
  return guard;
}
