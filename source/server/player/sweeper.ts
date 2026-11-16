/**
 * JM7a (biztonsági review #445, A3): a belépőkód-rekordok ütemezett takarítása — induláskor és óránként, a PLAYER_ACCOUNTS
 * flagtől FÜGGETLENÜL (kikapcsolt flag mellett is eltakarítja a maradékot). A lejárt rekordokból a nyílt cím törlődik,
 * a 24 óránál régebbiek teljesen. Hiba esetén csak naplóz (cím nélkül), a következő körben újra próbál.
 * K1 / K1b: a tiltás-karbantartás (kulcsrotáció-egyeztetés, 12 hónapos megőrzés-takarítás) CSAK ha a hívó átadja (élesben vagy
 * `PLAYER_BAN_MAINTENANCE=on` mellett — `banMaintenanceEnabled`); a három lépés egymástól független (külön `try`).
 */
import { logger } from "../lib/logger";

export const PLAYER_CODE_SWEEP_INTERVAL_MS = 60 * 60_000;

type Timers = { setInterval: (fn: () => void, ms: number) => { unref?: () => void } };

export type BanMaintenance = {
  /** [más kulcsú (megőrzött) sorok száma, helyreállított élő tiltott fiók]. */
  reconcile: () => Promise<[number, number]>;
  /** A megőrzési időn túli (élő tiltott fiók nélküli) ujjlenyomatok törlése; a törölt sorok száma. */
  purgeExpired: () => Promise<number>;
};

const errText = (error: unknown) => (error instanceof Error ? error.message : "ismeretlen hiba");

export function startPlayerCodeSweeper(
  purge: () => Promise<[number, number]>, timers: Timers = globalThis, bans: BanMaintenance | null = null,
): () => Promise<void> {
  const run = async () => {
    try {
      const [blanked, deleted] = await purge();
      if (blanked || deleted) logger.info(`[PLAYER] kódrekord-takarítás: ${blanked} címtelenítve, ${deleted} törölve`);
    } catch (error) {
      logger.error("[PLAYER] kódrekord-takarítás hiba:", errText(error));
    }
    if (!bans) return;
    try {
      const [legacy, restored] = await bans.reconcile();
      // K1b (Ú1, Ú3): a más kulcsú sorok MEGMARADNAK (a megőrzés-takarító viszi el őket 12 hónap után) — figyelmeztetés, ha vannak.
      if (legacy) logger.warn(`[PLAYER] kulcsrotáció: ${legacy} régi kulcsú tiltás-ujjlenyomat megőrizve (az élő tiltott fiókoké az új kulccsal helyreállt)`);
      if (restored) logger.info(`[PLAYER] tiltás-ujjlenyomat helyreállítva élő tiltott fiókhoz: ${restored}`);
    } catch (error) {
      logger.error("[PLAYER] tiltás-ujjlenyomat egyeztetés hiba:", errText(error));
    }
    try {
      const expired = await bans.purgeExpired();
      if (expired) logger.info(`[PLAYER] tiltás-ujjlenyomat lejárt és törölve: ${expired}`);
    } catch (error) {
      logger.error("[PLAYER] tiltás-ujjlenyomat megőrzés-takarítás hiba:", errText(error));
    }
  };
  void run();
  timers.setInterval(() => { void run(); }, PLAYER_CODE_SWEEP_INTERVAL_MS).unref?.();
  return run;
}
