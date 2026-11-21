/**
 * Adventi naptár — takarító (docs/specs/2026-11-18-adventi-naptar.md E23, 16.6, 18.1; végrehajtás „S6” 3. pont).
 * Induláskor és 24 óránként: a régóta nem használt névtelen (eszköz-) sorok, a régi előnézeti sorok és a korábbi évadok
 * értesítő-foglalásai törlődnek (`store.sweep`); ha a hívó átadja, a lezárt évad levél nélküli tanulói soraira egyszer elmegy a szülői
 * levél (`closeSeason`, terv 18.1 3. pont — az S5 köti be, csak bekapcsolt naptárnál). A kapcsolótól független (kikapcsolt naptár mellett
 * is eltakarítja a maradékot), az időzítő `unref()`-elt (nem tartja életben a folyamatot), e2e-módban a hívó nem indítja (a
 * `server/player/sweeper.ts` mintája). Hiba esetén csak a hiba osztálya kerül a naplóba, a következő kör újra próbálja.
 */
import { adventNow } from "../../shared/advent/calendar";
import { logger } from "../lib/logger";

export const ADVENT_SWEEP_INTERVAL_MS = 24 * 60 * 60_000;

type Timers = { setInterval: (fn: () => void, ms: number) => { unref?: () => void } };

export type AdventSweepDeps = {
  sweep: (now: Date, currentSeason: number) => Promise<{ devices: number; previews: number; announcements: number }>;
  /** A lezárt évad szülői leveleinek pótlása (terv 18.1 3.); a küldött levelek száma. */
  closeSeason?: (now: Date) => Promise<number>;
};

const errorClass = (error: unknown): string => {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z0-9_]{1,60}$/.test(name) ? name : "Error";
};

export function startAdventSweeper(deps: AdventSweepDeps, timers: Timers = globalThis, now: () => Date = () => new Date()): () => Promise<void> {
  const run = async () => {
    const at = now();
    try {
      // A modul naplója csak a hiba osztályát írja (A22 forrás-őr); a törölt sorok száma a hívóé (a `sweep` visszatérési értéke).
      await deps.sweep(at, adventNow(at).season);
    } catch (error) {
      logger.error(`[ADVENT] takarítás hiba: ${errorClass(error)}`);
    }
    if (!deps.closeSeason) return;
    try {
      await deps.closeSeason(at);
    } catch (error) {
      logger.error(`[ADVENT] évadzáró levelek hiba: ${errorClass(error)}`);
    }
  };
  void run();
  timers.setInterval(() => { void run(); }, ADVENT_SWEEP_INTERVAL_MS).unref?.();
  return run;
}
