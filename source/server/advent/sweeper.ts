/**
 * Adventi naptár — takarító (docs/specs/2026-11-18-adventi-naptar.md E23, 16.6, 18.1; végrehajtás „S6” 3. pont).
 * Induláskor és 24 óránként: a régóta nem használt névtelen (eszköz-) sorok, a régi előnézeti sorok és a korábbi évadok
 * értesítő-foglalásai törlődnek (`store.sweep`); ha a hívó átadja, a szülői levelek tartós pótlása is fut (`resumeMail`, terv 18.1 —
 * az S5 köti be, csak bekapcsolt naptárnál; 10 percenként). A kapcsolótól független (kikapcsolt naptár mellett
 * is eltakarítja a maradékot), az időzítő `unref()`-elt (nem tartja életben a folyamatot), e2e-módban a hívó nem indítja (a
 * `server/player/sweeper.ts` mintája). Hiba esetén csak a hiba osztálya kerül a naplóba, a következő kör újra próbálja.
 */
import { adventNow } from "../../shared/advent/calendar";
import { logger } from "../lib/logger";

export const ADVENT_SWEEP_INTERVAL_MS = 24 * 60 * 60_000;
/** A tartós levélpótlás gyakorisága (S5/S6 1. vak L1): a leállás után ennyin belül (+ a bérlet lejárta) folytatódik a kézbesítés. */
export const ADVENT_MAIL_RESUME_INTERVAL_MS = 10 * 60_000;

type Timers = { setInterval: (fn: () => void, ms: number) => { unref?: () => void } };

export type AdventSweepDeps = {
  sweep: (now: Date, currentSeason: number) => Promise<{ devices: number; previews: number; announcements: number }>;
  /**
   * A szülői levelek tartós pótlása (terv 18.1; S5/S6 1. vak L1): a kézbesítetlen címzettek, a terv nélküli végleges eredmények, lezárt
   * évadban a megkezdett levél nélküli sorok. Indításkor és `ADVENT_MAIL_RESUME_INTERVAL_MS`-enként; a küldött levelek száma.
   */
  resumeMail?: (now: Date) => Promise<number>;
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
  };
  const resume = async () => {
    if (!deps.resumeMail) return;
    try {
      await deps.resumeMail(now());
    } catch (error) {
      logger.error(`[ADVENT] levélpótlás hiba: ${errorClass(error)}`);
    }
  };
  void run().then(resume);
  timers.setInterval(() => { void run(); }, ADVENT_SWEEP_INTERVAL_MS).unref?.();
  if (deps.resumeMail) timers.setInterval(() => { void resume(); }, ADVENT_MAIL_RESUME_INTERVAL_MS).unref?.();
  return async () => { await run(); await resume(); };
}
