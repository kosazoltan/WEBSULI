/**
 * A párbaj megjelenítő komponenseinek tiszta segédei (JM1r: az egyeszközös aréna újrahasznosítható részei, a JM3a online
 * meccsképernyője és a gépi ellenfél ugyanezt használja). DOM és React nélkül — egységtesztelhető.
 */
import { DUEL_BASE_DAMAGE } from "@shared/duel/rules";

export const fmt1 = (n: number) => n.toLocaleString("hu-HU", { maximumFractionDigits: 1 });

export const fmtSec = (ms: number) =>
  `${(ms / 1000).toLocaleString("hu-HU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mp`;

export type HpTone = "ok" | "mid" | "low";

/** Az életerő-sáv kitöltése (0..100 %) és színe: > 50% zöld, > 25% sárga, alatta narancs (nem telített piros). */
export function hpView(hp: number, max: number): { pct: number; tone: HpTone } {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  return { pct, tone: pct > 50 ? "ok" : pct > 25 ? "mid" : "low" };
}

/** Az időjelző aránya: a hátralévő idő a saját ablakhoz képest, [0, 1]-re vágva (érvénytelen ablaknál 0). */
export function timerRatio(deadlineMs: number, nowMs: number, windowMs: number): number {
  if (!(windowMs > 0) || !Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.min(1, (deadlineMs - nowMs) / windowMs));
}

export type VerdictKind = "correct" | "wrong" | "timeout";

/** Az ítélet-sáv címe (bátorító: rossz válasznál „Majdnem!”, sosem szégyenítő). */
export function verdictTitle(kind: VerdictKind, args: { correctText: string; bonus?: number }): string {
  if (kind === "correct") {
    const bonus = args.bonus ?? 0;
    return `Helyes! ⚡ ${fmt1(DUEL_BASE_DAMAGE + bonus)} csapás${bonus > 0 ? ` (gyorsasági bónusz +${fmt1(bonus)})` : ""}`;
  }
  if (kind === "timeout") return `Lejárt az idő. A helyes: ${args.correctText}`;
  return `Majdnem! A helyes: ${args.correctText}`;
}

/** A győzteshirdetés elismerő mondata — a vesztes is dicséretet kap (rangsor-szégyenítés nincs, terv 10.5). */
export function praiseFor(args: { won: boolean; coWin: boolean; correct: number }): string {
  if (args.won) return args.coWin ? "Fej fej mellett — közös győzelem!" : "Gratulálunk, győztél!";
  return args.correct > 0 ? `Szép munka: ${args.correct} helyes válasz! Visszavágó?` : "Jó próbálkozás! A következő kör a tiéd lehet.";
}

/** Betűméret-szintek a kérdéskártya illesztéséhez (CSS: `.duel-qcard[data-fit]`): a 0. a legnagyobb. */
export const DUEL_FIT_LEVELS = 6;
