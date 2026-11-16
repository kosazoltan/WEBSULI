/**
 * J0b — közös áramlat-vezérlő (végrehajtás J0b „Szerződés”; terv 4.1/6, 6.2 „Adaptivitás”, J8).
 *
 * Két kimenet egy helyen:
 * - `band()` — a kérdés-sáv. A szabályt NEM duplikálja: a `GE/difficulty.ts` `nextDifficulty`-ját hívja az utolsó három
 *   válasszal (ugyanúgy, mint a `GE/adaptiveSession.ts`): 3 helyes egymás után +0,10, 2 hibás −0,15; padló 0,15
 *   (`DIFFICULTY_FLOOR`), plafon itt 0,95 (`FLOW_BAND_MAX`).
 * - `intensity()` — a játék-intenzitás 0..1, exponenciális mozgóátlag (α = 0,15) a jelek célértéke felé:
 *   gyors jó válasz (a válaszablak 50%-án belül) → 1; lassú jó válasz → 0,6; hibás / időtúllépés → 0;
 *   játékjel: `good` → 1, `!good` → 0, súllyal (`α × weight`, legfeljebb 1).
 *
 * Tiszta: nincs óra, nincs véletlen; ugyanaz a jelsorozat mindig ugyanazt adja.
 */
import { DIFFICULTY_FLOOR, nextDifficulty } from "../difficulty";

export type FlowSignal =
  | { kind: "answer"; correct: boolean; responseMs: number; windowMs: number }
  | { kind: "game"; good: boolean; weight?: number }; // pl. sérülés: good=false; tiszta szakasz: good=true
export type FlowController = {
  push(s: FlowSignal): void;
  /** Kérdés-sáv: a GE/difficulty.ts nextDifficulty szabálya (padló 0.15, plafon 0.95). */
  band(): number;
  /** Játék-intenzitás 0..1: exponenciális mozgóátlag (α = 0.15) a válasz- és játékjelekből; gyors jó válasz (< 50% ablak) +, hiba / sérülés −. */
  intensity(): number;
  /** Az utolsó `lastN` (alap 20) válasz helyes aránya; válasz nélkül 0. */
  successRate(lastN?: number): number;
};

export const FLOW_BAND_MAX = 0.95;
export const FLOW_ALPHA = 0.15;
/** Gyors jó válasz: a válaszablak ennyi részén belül. */
export const FAST_ANSWER_SHARE = 0.5;
/** A lassú (de jó) válasz célértéke: mérsékelten emeli az intenzitást, ha alatta van. */
export const SLOW_CORRECT_TARGET = 0.6;
const DEFAULT_START_INTENSITY = 0.5;
/** A válasz-előzmény hossza (a `successRate` legfeljebb ennyit néz vissza). */
const HISTORY_CAP = 200;

function clamp(v: number, lo: number, hi: number, fallback: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

export function createFlowController(opts: { startBand: number; startIntensity?: number }): FlowController {
  let band = clamp(opts.startBand, DIFFICULTY_FLOOR, FLOW_BAND_MAX, DIFFICULTY_FLOOR);
  let intensity = clamp(opts.startIntensity ?? DEFAULT_START_INTENSITY, 0, 1, DEFAULT_START_INTENSITY);
  const answers: boolean[] = [];

  function ease(target: number, alpha: number): void {
    intensity = clamp(intensity + alpha * (target - intensity), 0, 1, intensity);
  }

  return {
    push(s) {
      if (s.kind === "answer") {
        answers.push(s.correct);
        if (answers.length > HISTORY_CAP) answers.shift();
        band = Math.min(FLOW_BAND_MAX, nextDifficulty({ current: band, recentCorrect: answers.slice(-3) }));
        const fast = s.windowMs > 0 && s.responseMs < s.windowMs * FAST_ANSWER_SHARE;
        ease(s.correct ? (fast ? 1 : SLOW_CORRECT_TARGET) : 0, FLOW_ALPHA);
        return;
      }
      const weight = s.weight === undefined ? 1 : clamp(s.weight, 0, Number.POSITIVE_INFINITY, 1);
      ease(s.good ? 1 : 0, Math.min(1, FLOW_ALPHA * weight));
    },
    band: () => band,
    intensity: () => intensity,
    successRate(lastN = 20) {
      const n = Math.max(1, Math.floor(lastN));
      const tail = answers.slice(-n);
      if (tail.length === 0) return 0;
      let ok = 0;
      for (const a of tail) if (a) ok += 1;
      return ok / tail.length;
    },
  };
}
