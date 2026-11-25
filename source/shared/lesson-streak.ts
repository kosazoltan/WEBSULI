/**
 * V5c — sorozatjelvény (docs/specs/2026-11-25-v5c-sorozatjelveny.md): egymást követő jó leckék száma és a jelvényszintek. Tiszta
 * függvények, import nélkül: a kliens sávja és az egységteszt is ezt hívja. Csak megjelenítés — nincs pont, XP vagy szerverhívás.
 */
export const STREAK_GOOD_PERCENT = 80;
export const STREAK_TIERS = [{ at: 3, name: "Bronz" }, { at: 5, name: "Ezüst" }, { at: 10, name: "Arany" }] as const;
const MAX_ROUNDS = 50;

/** `lessons`: az aktuális sorozatban már beszámított leckék (review #606: A → B → A nem növel); nullázáskor üres. */
export type StreakState = { count: number; last: string | null; rounds: string[]; lessons: string[] };
export const EMPTY_STREAK: StreakState = Object.freeze({ count: 0, last: null, rounds: [], lessons: [] }) as StreakState;

/**
 * Egy kész kör eredménye. Ugyanaz a kör (körkulcs) csak egyszer számít; ugyanannak a leckének újabb jó köre nem növel; a 80 % alatti
 * kör nulláz. Változatlan helyzetben ugyanazt az objektumot adja vissza (a hívó így nem ír fölöslegesen).
 */
export function recordLessonResult(state: StreakState, result: { lessonKey: string; roundKey: string; percent: number }): StreakState {
  if (state.rounds.includes(result.roundKey)) return state;
  const rounds = [...state.rounds, result.roundKey].slice(-MAX_ROUNDS);
  if (result.percent < STREAK_GOOD_PERCENT) return { count: 0, last: result.lessonKey, rounds, lessons: [] };
  // Review #606: a sorozat KÜLÖNBÖZŐ leckékből épül — a sorozatban már beszámított lecke (nem csak a legutóbbi) újra nem növel.
  if (state.count > 0 && state.lessons.includes(result.lessonKey)) return { ...state, last: result.lessonKey, rounds };
  return { count: state.count + 1, last: result.lessonKey, rounds, lessons: [...state.lessons, result.lessonKey].slice(-MAX_ROUNDS) };
}

/** Az elért legmagasabb jelvény, vagy `null`. */
export function streakBadge(count: number): { at: number; name: string } | null {
  let best: { at: number; name: string } | null = null;
  for (const tier of STREAK_TIERS) if (count >= tier.at) best = { at: tier.at, name: tier.name };
  return best;
}

/** A következő jelvény és a hiányzó jó leckék száma, vagy `null` (a legfelső szint felett). */
export function streakNext(count: number): { at: number; name: string; missing: number } | null {
  const tier = STREAK_TIERS.find(t => t.at > count);
  return tier ? { at: tier.at, name: tier.name, missing: tier.at - count } : null;
}

/** A tárolt érték ellenőrzött beolvasása; sérült vagy idegen érték → üres állapot. */
export function parseStreak(raw: string | null): StreakState {
  if (!raw) return EMPTY_STREAK;
  try {
    const v = JSON.parse(raw) as Partial<StreakState>;
    if (!v || typeof v !== "object" || Array.isArray(v)) return EMPTY_STREAK;
    if (!Number.isInteger(v.count) || (v.count as number) < 0) return EMPTY_STREAK;
    if (v.last !== null && typeof v.last !== "string") return EMPTY_STREAK;
    if (!Array.isArray(v.rounds) || !v.rounds.every(r => typeof r === "string")) return EMPTY_STREAK;
    if (v.lessons !== undefined && (!Array.isArray(v.lessons) || !v.lessons.every(l => typeof l === "string"))) return EMPTY_STREAK;
    // régi (leckelista nélküli) érték: a legutóbbi lecke a beszámított (a korábbiak nem ismertek)
    const lessons = v.lessons ?? ((v.count as number) > 0 && v.last ? [v.last] : []);
    return { count: v.count as number, last: v.last ?? null, rounds: v.rounds.slice(-MAX_ROUNDS), lessons: lessons.slice(-MAX_ROUNDS) };
  } catch {
    return EMPTY_STREAK;
  }
}

/** A tároló minimális felülete (böngészőben `localStorage`). */
export type StreakStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export const STREAK_STORAGE_KEY = "websuli:lesson-streak:v1";

/**
 * Tárolás memóriabeli tartalékkal (review #606): ha az írás hibázik (betelt kvóta) vagy a tároló nem érhető el, a következő
 * betöltés a legfrissebb MEMÓRIABELI állapotból folytat; sikeres mentés után újra a tároló a forrás.
 */
export function createStreakStore(storage: () => StreakStorage | null) {
  let memory: StreakState | null = null;
  let unsaved = false;
  return {
    load(): StreakState {
      if (unsaved && memory) return memory;
      try { return parseStreak(storage()?.getItem(STREAK_STORAGE_KEY) ?? null); } catch { return memory ?? EMPTY_STREAK; }
    },
    save(state: StreakState): void {
      memory = state;
      try {
        const s = storage();
        if (!s) { unsaved = true; return; }
        s.setItem(STREAK_STORAGE_KEY, JSON.stringify(state));
        unsaved = false;
      } catch { unsaved = true; }
    },
  };
}
