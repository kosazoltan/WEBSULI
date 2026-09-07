import { nextDifficulty, startingDifficulty } from './difficulty';

/** Run-local history. The existing common rule owns every difficulty change. */
export function createAdaptiveSession(classroom: number) {
  let band = startingDifficulty(classroom);
  let history: boolean[] = [];
  return {
    get band() { return band; },
    answer(correct: boolean) {
      history = [...history.slice(-2), correct];
      band = nextDifficulty({ current: band, recentCorrect: history });
      return band;
    },
    reset(grade: number) { band = startingDifficulty(grade); history = []; },
  };
}

/** Slower pressure / more thinking time for a struggling learner. */
export function adaptiveTimeBudget(base: number, band: number): number {
  return Math.max(1, Math.round(base * (1.3 - Math.min(1, Math.max(0.15, band)) * 0.6)));
}

export function pickAdaptiveTier<T extends {id: string}>(
  pools: {easy: T[]; med: T[]; hard: T[]}, band: number,
  recent: readonly string[], rng = Math.random,
): T | null {
  const preferred = band < 0.4 ? pools.easy : band < 0.7 ? pools.med : pools.hard;
  const pool = preferred.length ? preferred : [...pools.easy,...pools.med,...pools.hard];
  const unseen = pool.filter(q=>!recent.includes(q.id));
  const candidates = unseen.length ? unseen : pool;
  return candidates.length ? candidates[Math.min(candidates.length-1,Math.floor(rng()*candidates.length))]! : null;
}
