/**
 * Adventi naptár — bevezetési flag és óra (docs/specs/2026-11-18-adventi-naptar.md R5, R9, 16.5). Adatbázis-mentes modul.
 */
import { isValidDate } from "../../shared/advent/calendar";
import { isE2eMode } from "../lib/e2e-mode";

/** Csak a pontos `on` / `1` / `true` kapcsol be (minden más, a hiány is: KI) — mint a `PLAYER_ACCOUNTS` flag. */
export function adventEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.ADVENT_CALENDAR ?? "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

export const ADVENT_TEST_NOW_HEADER = "x-advent-test-now";

/**
 * A naptár órája: élesben MINDIG a szerver órája (a kérés fejléce hatástalan). E2E-módban (`WEBSULI_E2E=1`) csak érvényes
 * `X-Advent-Test-Now` fejléccel van idő; fejléc nélkül `null` → a naptár kikapcsoltként viselkedik, a valódi dátumtól függetlenül
 * (terv 16.5 — a meglévő főoldali e2e-tesztek decemberben sem változnak).
 */
export function adventClock(req: { get(name: string): string | undefined }, env: NodeJS.ProcessEnv = process.env, realNow: () => Date = () => new Date()): Date | null {
  if (!isE2eMode(env)) return realNow();
  const raw = req.get(ADVENT_TEST_NOW_HEADER);
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(raw)) return null;
  const parsed = new Date(raw);
  return isValidDate(parsed) ? parsed : null;
}
