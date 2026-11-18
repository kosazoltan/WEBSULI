/**
 * Adventi naptár — a főoldali kártya és a „következő ablak” tiszta logikája (docs/specs/2026-11-18-adventi-naptar.md 14.).
 * Tiszta modul: a kártya helyfoglalása a KLIENS órájából megy (elrendezés-ugrás ellen), a tartalom a szerver állapotából.
 */
import { adventNow } from "./calendar";
import type { AdventState } from "./contract";
import { ADVENT_DOORS } from "./rules";

/** Magyar határozott névelő sorszámnév elé: „az 1.”, „az 5.”, különben „a” (a 24 ablak tartományában). */
export function articleFor(day: number): "a" | "az" {
  return day === 1 || day === 5 ? "az" : "a";
}

/** Magyar dátumrag a nap sorszámához (1–31): 1-jén, 2-án, 3-án, 4-én, 5-én, 6-án, 7-én, 8-án, 9-én, 10-én, 13-án, 16-án, 20-án, 23-án … */
export function daySuffix(day: number): string {
  if (day === 1) return "-jén";
  return [2, 3, 6, 8, 13, 16, 18, 20, 23, 26, 28, 30].includes(day) ? "-án" : "-én";
}

/** Lefoglalja-e a főoldal a kártya helyét (a böngésző órája szerint): november 24. – január 6. */
export function homeCardReserve(now: Date): boolean {
  const phase = adventNow(now).phase;
  return phase === "teaser" || phase === "open" || phase === "catchup";
}

/**
 * A soron következő ablak (terv 14.1): a mai, még meg nem válaszolt ablak → a legkorábbi nyitható, megválaszolatlan ablak →
 * az első javítható ablak → nincs (null).
 */
export function nextDoorToOpen(state: Pick<AdventState, "phase" | "openDay" | "doors">): number | null {
  if (state.phase !== "open" && state.phase !== "catchup") return null;
  const today = state.phase === "open" ? state.doors[state.openDay - 1] : undefined;
  if (today?.state === "open") return today.day;
  const waiting = state.doors.find((d) => d.state === "open");
  if (waiting) return waiting.day;
  return state.doors.find((d) => d.state === "repairable")?.day ?? null;
}

export type HomeCardStatus = { text: string; cta: "Kinyitom" | "Megnézem" | null };

/** A kártya egysoros állapota és gombja; `null` állapotnál (még tölt / hiba) általános felhívás. */
export function homeCardStatus(state: Pick<AdventState, "phase" | "openDay" | "daysUntilStart" | "doors" | "summary"> | null): HomeCardStatus {
  if (!state) return { text: "Nyisd ki a mai ablakot!", cta: "Kinyitom" };
  if (state.phase === "teaser") return { text: `Hamarosan: december 1. — még ${state.daysUntilStart} nap`, cta: null };
  if (state.phase !== "open" && state.phase !== "catchup") return { text: "Jövőre újra találkozunk!", cta: null };
  const waiting = state.doors.filter((d) => d.state === "open").length;
  const repairable = state.doors.filter((d) => d.state === "repairable").length;
  const today = state.phase === "open" ? state.doors[state.openDay - 1] : undefined;
  if (today?.state === "open") {
    const others = waiting - 1;
    return { text: `Ma ${articleFor(today.day)} ${today.day}. ablak nyílik${others > 0 ? ` — és még ${others} vár rád` : ""}`, cta: "Kinyitom" };
  }
  if (waiting + repairable > 0) return { text: `${waiting + repairable} ablak vár rád`, cta: "Kinyitom" };
  if (state.summary.answered === ADVENT_DOORS) return { text: `Végigértél: ${state.summary.solved} / ${ADVENT_DOORS} ablak világít`, cta: "Megnézem" };
  if (state.phase === "open" && state.openDay < ADVENT_DOORS) {
    const next = state.openDay + 1;
    return { text: `Mára kész! Holnap nyílik ${articleFor(next)} ${next}. ablak`, cta: "Megnézem" };
  }
  return { text: `${state.summary.solved} / ${ADVENT_DOORS} ablak világít`, cta: "Megnézem" };
}
