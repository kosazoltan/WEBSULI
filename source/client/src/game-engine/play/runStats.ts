/**
 * J0b — menet-statisztika (végrehajtás J0b „Szerződés”; terv 6.2). A játékszeletek elfogadási mérései (kérdés/perc,
 * kérdés nélküli rés, ismétlés, változatosság) ebből a pillanatképből jönnek, a szimulációban és a `ResultScreen`-en is.
 *
 * Mérési definíciók (a terv 6.2 soraiból):
 * - `perMinute` = feltett kérdések / (a menet TELJES sim-ideje percben) — a bemelegítő szakasz is a nevezőben van.
 * - `maxGapSec` — a leghosszabb kérdés NÉLKÜLI összefüggő szakasz: egy kérdés vége (kimenet) és a következő indítása
 *   között, a menet végén a nyitott szakasz is számít; a nyitott kérdés ideje nem rés (terv 6.2: „a válaszablak
 *   kérdéssel töltött idő”). A menet első `warmupSec` másodperce kivétel (a szakaszok ettől számítanak).
 * - `minGapSec` — a legrövidebb rés két kérdés-INDÍTÁS között, ahol a későbbi kérdés ütemezett vagy játék-kérte
 *   (`scheduled` / `trigger`); kevesebb mint két ilyen indításnál `Infinity`. A boss-sor saját küszöbe (≥ 0,8 mp) a
 *   `minGapBossSec`-ben (additív mező); a `rescue` (mentőöv) minGap-mentes, egyikbe sem számít.
 * - `freshWindow40Distinct` — csak az ÚJ (nem ismétlésként adott) kérdések sorozatán, bármely 40-es ablak legkisebb
 *   különböző-tétel száma; 40-nél kevesebb új kérdésnél az egész sorozat különböző tételeinek száma.
 * - `reviewReturnWithin6` — a menetben hibázott TÉTELEK (kulcsonként az első hiba) közül hány tért vissza a 3.–6.
 *   következő kérdésként. A nevezőből kimarad az a tétel, amelynek 6 kérdéses ablaka a menet végéig nem telt le, és nem
 *   is tért vissza (cenzorált: a menet vége, nem az ütemező döntött). Hibázott tétel nélkül 1. A `reviewReturnWithin10`
 *   ugyanígy, a következő 10 kérdésre.
 * - `answered` = helyes + hibás (az időtúllépés és a megszakítás nem válasz).
 */
import type { QuestionOutcome, QuestionPresentation, QuestionSourceKind } from "./types";

export type RunStatsSnapshot = {
  asked: number; answered: number; correct: number; wrong: number; timeouts: number;
  distinctKeys: number; reviewsAsked: number; perMinute: number;
  maxGapSec: number; minGapSec: number; firstSource: QuestionSourceKind | null;
  simSeconds: number;
  freshWindow40Distinct: number; // az ÚJ (nem ismétlés) kérdések legrosszabb 40-es ablakának különböző tételszáma
  reviewShare: number;           // ismétlések / összes kérdés
  reviewReturnWithin6: number;   // a hibázott tételek hányada, amely a 3.–6. következő kérdésként visszatért
  /** Additív: a boss-kérdések indítási rése (≥ 0,8 mp a küszöb); boss-kérdés nélkül `Infinity`. */
  minGapBossSec: number;
  /** Additív: a hibázott tételek hányada, amely ≤ 10 kérdésen belül visszatért (terv 6.2: 75%-nál „a többi”, 45%-nál ≥ 60%). */
  reviewReturnWithin10: number;
};
export type RunStats = { onAsk(p: QuestionPresentation, simMs: number): void; onOutcome(o: QuestionOutcome): void; snapshot(simMs: number): RunStatsSnapshot };

const FRESH_WINDOW = 40;

export function createRunStats(opts?: { warmupSec?: number /* alap 10 */ }): RunStats {
  const warmupMs = Math.max(0, (opts?.warmupSec ?? 10) * 1000);
  let asked = 0;
  let correct = 0;
  let wrong = 0;
  let timeouts = 0;
  let reviewsAsked = 0;
  let firstSource: QuestionSourceKind | null = null;
  const distinct = new Set<string>();
  const freshKeys: string[] = [];
  /** A kérdés-sorozat kulcsai pozíció szerint (a visszatérés-méréshez). */
  const sequence: string[] = [];
  /** Kulcs → az első hibájának pozíciója ebben a menetben. */
  const firstMissAt = new Map<string, number>();
  /** Nyitott kérdés: id → (pozíció, indítás). */
  const open = new Map<number, { pos: number; startMs: number }>();
  let lastStartMs: number | null = null;
  let minGapMs = Number.POSITIVE_INFINITY;
  let minBossGapMs = Number.POSITIVE_INFINITY;
  /** A jelenlegi kérdés nélküli szakasz kezdete (a bemelegítés vége előtt nem kezdődhet). */
  let gapFromMs = warmupMs;
  let maxGapMs = 0;

  function closeGap(atMs: number): void {
    const from = Math.max(gapFromMs, warmupMs);
    if (atMs > from) maxGapMs = Math.max(maxGapMs, atMs - from);
  }

  function minWindowDistinct(): number {
    if (freshKeys.length <= FRESH_WINDOW) return new Set(freshKeys).size;
    const counts = new Map<string, number>();
    for (let i = 0; i < FRESH_WINDOW; i++) counts.set(freshKeys[i]!, (counts.get(freshKeys[i]!) ?? 0) + 1);
    let worst = counts.size;
    for (let i = FRESH_WINDOW; i < freshKeys.length; i++) {
      const out = freshKeys[i - FRESH_WINDOW]!;
      const n = counts.get(out)! - 1;
      if (n === 0) counts.delete(out);
      else counts.set(out, n);
      const inn = freshKeys[i]!;
      counts.set(inn, (counts.get(inn) ?? 0) + 1);
      worst = Math.min(worst, counts.size);
    }
    return worst;
  }

  /** A hibázott tételek (első hiba) hányada, amely a `lo`.–`hi`. következő kérdésként visszatért; cenzorált kimarad. */
  function returnWithin(lo: number, hi: number): number {
    let num = 0;
    let den = 0;
    for (const [key, at] of firstMissAt) {
      let returned = false;
      for (let p = at + lo; p <= at + hi && p < sequence.length; p++) {
        if (sequence[p] === key) {
          returned = true;
          break;
        }
      }
      if (returned) {
        num += 1;
        den += 1;
      } else if (at + hi < sequence.length) {
        den += 1;
      }
    }
    return den === 0 ? 1 : num / den;
  }

  return {
    onAsk(p, simMs) {
      if (open.size === 0) closeGap(simMs);
      if (lastStartMs !== null) {
        if (p.reason === "boss") minBossGapMs = Math.min(minBossGapMs, simMs - lastStartMs);
        else if (p.reason !== "rescue") minGapMs = Math.min(minGapMs, simMs - lastStartMs);
      }
      lastStartMs = simMs;
      if (asked === 0) firstSource = p.isReview ? "review" : p.question.source;
      open.set(p.id, { pos: asked, startMs: simMs });
      sequence.push(p.question.key);
      asked += 1;
      distinct.add(p.question.key);
      if (p.isReview) reviewsAsked += 1;
      else freshKeys.push(p.question.key);
    },
    onOutcome(o) {
      const q = open.get(o.id);
      if (!q) return;
      open.delete(o.id);
      if (o.result === "correct") correct += 1;
      else if (o.result === "wrong") wrong += 1;
      else if (o.result === "timeout") timeouts += 1;
      if ((o.result === "wrong" || o.result === "timeout") && !firstMissAt.has(o.key)) firstMissAt.set(o.key, q.pos);
      if (open.size === 0) gapFromMs = q.startMs + Math.max(0, o.responseMs);
    },
    snapshot(simMs) {
      let maxGap = maxGapMs;
      if (open.size === 0) {
        const from = Math.max(gapFromMs, warmupMs);
        if (simMs > from) maxGap = Math.max(maxGap, simMs - from);
      }
      const minutes = simMs / 60_000;
      return {
        asked,
        answered: correct + wrong,
        correct,
        wrong,
        timeouts,
        distinctKeys: distinct.size,
        reviewsAsked,
        perMinute: minutes > 0 ? asked / minutes : 0,
        maxGapSec: maxGap / 1000,
        minGapSec: minGapMs / 1000,
        firstSource,
        simSeconds: simMs / 1000,
        freshWindow40Distinct: minWindowDistinct(),
        reviewShare: asked > 0 ? reviewsAsked / asked : 0,
        reviewReturnWithin6: returnWithin(3, 6),
        minGapBossSec: minBossGapMs / 1000,
        reviewReturnWithin10: returnWithin(1, 10),
      };
    },
  };
}
