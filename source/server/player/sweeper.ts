/**
 * JM7a (biztonsági review #445, A3): a belépőkód-rekordok ütemezett takarítása — induláskor és óránként, a PLAYER_ACCOUNTS
 * flagtől FÜGGETLENÜL (kikapcsolt flag mellett is eltakarítja a maradékot). A lejárt rekordokból a nyílt cím törlődik,
 * a 24 óránál régebbiek teljesen. Hiba esetén csak naplóz (cím nélkül), a következő körben újra próbál.
 */
import { logger } from "../lib/logger";

export const PLAYER_CODE_SWEEP_INTERVAL_MS = 60 * 60_000;

type Timers = { setInterval: (fn: () => void, ms: number) => { unref?: () => void } };

export function startPlayerCodeSweeper(purge: () => Promise<[number, number, number?]>, timers: Timers = globalThis): () => Promise<void> {
  const run = async () => {
    try {
      const [blanked, deleted, bans = 0] = await purge();
      if (blanked || deleted) logger.info(`[PLAYER] kódrekord-takarítás: ${blanked} címtelenítve, ${deleted} törölve`);
      // K1-c: a megőrzési időn túli tiltás-ujjlenyomatok törlése (cím nélkül naplózva).
      if (bans) logger.info(`[PLAYER] tiltás-ujjlenyomat lejárt és törölve: ${bans}`);
    } catch (error) {
      logger.error("[PLAYER] kódrekord-takarítás hiba:", error instanceof Error ? error.message : "ismeretlen hiba");
    }
  };
  void run();
  timers.setInterval(() => { void run(); }, PLAYER_CODE_SWEEP_INTERVAL_MS).unref?.();
  return run;
}
