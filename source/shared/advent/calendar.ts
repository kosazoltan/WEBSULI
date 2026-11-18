/**
 * Adventi naptár — idő és fázis (docs/specs/2026-11-18-adventi-naptar.md R5). Tiszta modul: az időt paraméterben kapja.
 * Az „aktuális nap” mindig az Europe/Budapest szerinti naptári nap; a hívó a SZERVER óráját adja át.
 */
import { ADVENT_DOORS, ADVENT_RULES } from "./rules";

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Budapest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type BudapestParts = { year: number; month: number; day: number; hour: number; minute: number };

/** Érvényes-e az időpont (a szerver ezzel szűri a teszt- és előnézeti dátumot, mielőtt a naptárnak adja). */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function budapestParts(now: Date): BudapestParts {
  if (!isValidDate(now)) throw new RangeError("advent: érvénytelen időpont");
  const out: Record<string, number> = {};
  for (const part of PARTS.formatToParts(now)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return { year: out.year!, month: out.month!, day: out.day!, hour: out.hour!, minute: out.minute! };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A megadott budapesti naptári nap 00:00-jának UTC-időpontja (a téli / nyári időt a zónából számolja). */
export function budapestMidnightUtc(year: number, month: number, day: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, day);
  const local = budapestParts(new Date(utcMidnight));
  return new Date(utcMidnight - (local.hour * 60 + local.minute) * 60_000);
}

export type AdventPhase = "before" | "teaser" | "open" | "catchup" | "closed";

export type AdventNow = {
  /** Az évad: novemberben és decemberben az év, januártól októberig a legutóbbi december éve. */
  season: number;
  phase: AdventPhase;
  /** A budapesti nap, `YYYY-MM-DD`. */
  today: string;
  /** A legnagyobb nyitható ablak (0 = még egyik sem). */
  openDay: number;
  /** A következő ablak nyitásának ideje (ISO, UTC), vagy null. */
  nextOpensAt: string | null;
  /** Hány nap van még december 1-jéig (csak `before` / `teaser` fázisban > 0). */
  daysUntilStart: number;
};

export function adventNow(now: Date): AdventNow {
  const { year, month, day } = budapestParts(now);
  const today = `${year}-${pad(month)}-${pad(day)}`;
  if (month === 11) {
    const daysUntilStart = 30 - day + 1;
    if (day < ADVENT_RULES.teaserFromDay) return { season: year, phase: "before", today, openDay: 0, nextOpensAt: null, daysUntilStart };
    return { season: year, phase: "teaser", today, openDay: 0, nextOpensAt: budapestMidnightUtc(year, 12, 1).toISOString(), daysUntilStart };
  }
  if (month === 12) {
    if (day <= ADVENT_DOORS) {
      const nextOpensAt = day < ADVENT_DOORS ? budapestMidnightUtc(year, 12, day + 1).toISOString() : null;
      return { season: year, phase: "open", today, openDay: day, nextOpensAt, daysUntilStart: 0 };
    }
    return { season: year, phase: "catchup", today, openDay: ADVENT_DOORS, nextOpensAt: null, daysUntilStart: 0 };
  }
  if (month === 1 && day <= ADVENT_RULES.catchupUntilJan) {
    return { season: year - 1, phase: "catchup", today, openDay: ADVENT_DOORS, nextOpensAt: null, daysUntilStart: 0 };
  }
  return { season: year - 1, phase: "closed", today, openDay: 0, nextOpensAt: null, daysUntilStart: 0 };
}

/** Nyitható-e az ablak: `open` fázisban a mai napig, `catchup` fázisban mind; máskor egyik sem. */
export function isDoorUnlocked(day: number, at: Pick<AdventNow, "phase" | "openDay">): boolean {
  if (!Number.isInteger(day) || day < 1 || day > ADVENT_DOORS) return false;
  if (at.phase !== "open" && at.phase !== "catchup") return false;
  return day <= at.openDay;
}

/** Írható-e a naptár (válasz, új kör): csak `open` és `catchup` fázisban. */
export function isAdventWritable(phase: AdventPhase): boolean {
  return phase === "open" || phase === "catchup";
}
