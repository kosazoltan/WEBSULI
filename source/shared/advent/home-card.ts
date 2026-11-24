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

/** A kártya órájának legritkább újraértékelése (ms): így a november 24-i megjelenés és minden határ legfeljebb egy perc késéssel él. */
export const HOME_CARD_TICK_MS = 60_000;

/**
 * Mennyi idő múlva nézzen újra az órára a nyitva hagyott főoldal (PR #544 review): a következő állapotváltás (fázishatár vagy napi nyitás)
 * után közvetlenül, de legfeljebb percenként. A ránézés nem hálózati kör — csak a böngésző órája.
 */
export function homeCardTickDelay(now: Date | null): number {
  if (!now) return HOME_CARD_TICK_MS;
  const until = adventNow(now).refreshInMs;
  // +250 ms: a határ UTÁN fusson, ne pont rajta (az időzítő pár ms-mal korábban is elsülhet).
  return until === null ? HOME_CARD_TICK_MS : Math.min(HOME_CARD_TICK_MS, until + 250);
}

/** A kártya „határkulcsa”: fázis + budapesti nap; `null`, ha a kártya nem látszik. Ha változik, a szerver státuszát újra kell kérni. */
export function homeCardBoundary(now: Date | null): string | null {
  if (!now || !homeCardReserve(now)) return null;
  const at = adventNow(now);
  return `${at.phase}/${at.today}`;
}

/** Átlépte-e az óra a határt két kiértékelés között. Az első kiértékelés és a kártya eltűnése nem váltás (nincs mit újrakérni). */
export function homeCardBoundaryCrossed(prev: string | null, next: string | null): boolean {
  return prev !== null && next !== null && prev !== next;
}

/**
 * Kérjen-e a kártya személyes állapotot: van MÁR azonosító (eszköz vagy tanulói link), vagy bejelentkezett, nem tiltott játékos
 * (a szerver a munkamenetéből azonosítja — új böngészőben is, eszközazonosító nélkül). Senkinek nem hoz létre azonosítót.
 */
export function homeCardWantsPersonal(input: { identity: boolean; player: unknown; banned: boolean }): boolean {
  if (input.identity) return true;
  return input.player != null && !input.banned;
}

/**
 * A kártya „mostja” (terv 20.): null, ha a kártya biztosan nem látszik. Kikapcsolt build-kapcsolónál mindig null.
 * Teszt-kampós buildben (e2e) CSAK a teszt által beadott, érvényes időpont számít — nélküle null, mint a szerveren
 * („érvényes tesztidő nélkül a naptár kikapcsolt”). Éles buildben a valódi idő.
 */
export function homeCardClock(input: { flag: boolean; testHooks: boolean; hookValue: unknown; realNow: Date }): Date | null {
  if (!input.flag) return null;
  if (!input.testHooks) return input.realNow;
  if (typeof input.hookValue !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(input.hookValue)) return null;
  const parsed = new Date(input.hookValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

/** Véget ért-e a kör (megfelelt, új kör kérhető, vagy nincs több lehetőség): ilyenkor nincs nyitható ablak, az összesítés a cél. */
export function roundIsOver(state: Pick<AdventState, "closing">): boolean {
  return state.closing.kind === "gift" || state.closing.kind === "new-round" || state.closing.kind === "done";
}

const MONTHS = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];
/** A szerver `YYYY-MM-DD` napja emberi alakban: „2026. december 24.”; ismeretlen alaknál a bemenet marad. */
export function adventDateLabel(isoDay: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${match[1]}. ${month} ${Number(match[3])}.` : isoDay;
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
