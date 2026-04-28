/**
 * Daily Challenge — napi 1 random játék az osztály legutóbbi tananyagából.
 *
 * Mechanika:
 *  - Minden naptári napnak determinisztikus seed-je van (YYYY-MM-DD).
 *  - A seed alapján a 6 játék közül 1 lesz "today's pick".
 *  - Ha aznap teljesíti, kapja: +50 bonus XP, +1 daily streak, achievement-check.
 *  - Streak: ha tegnap is teljesítette → +1, ha kihagyott egy napot → reset 1-re.
 *  - Készségek: napi seed-deterministic, böngészőtől független (ugyanaz mindenhol).
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "websuli.daily";
const CHANGE_EVENT = "websuli:daily-changed";

export type DailyGameId =
  | "block-craft-quiz"
  | "space-asteroid-quiz"
  | "brain-rot-steal"
  | "tsunami-english"
  | "word-ladder-hu-en"
  | "speed-quiz-math";

const DAILY_GAMES: { id: DailyGameId; title: string; emoji: string }[] = [
  { id: "block-craft-quiz", title: "Kockavadász Quiz", emoji: "🧱" },
  { id: "space-asteroid-quiz", title: "Galaktikus Aszteroida", emoji: "🚀" },
  { id: "brain-rot-steal", title: "Brain Rot Lopás", emoji: "🧠" },
  { id: "tsunami-english", title: "Szökőár Szökés", emoji: "🌊" },
  { id: "word-ladder-hu-en", title: "Szólétra HU↔EN", emoji: "📚" },
  { id: "speed-quiz-math", title: "Speed Math Sprint", emoji: "⚡" },
];

type DailyState = {
  /** Legutóbb teljesített nap ISO-dátum (YYYY-MM-DD). */
  lastCompletedDate: string | null;
  /** Folyamatos napi streak (0 ha nem teljesített még). */
  streakDays: number;
  /** Összesen hány nap teljesített (lifetime). */
  totalDays: number;
};

const DEFAULT_STATE: DailyState = {
  lastCompletedDate: null,
  streakDays: 0,
  totalDays: 0,
};

function loadState(): DailyState {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed) {
      return { ...DEFAULT_STATE, ...parsed };
    }
    return { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state: DailyState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* no-op */
  }
}

/** YYYY-MM-DD a helyi időzónában. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Egy sztring → 32 bites determinisztikus hash (FNV-1a). */
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

export type DailyPick = {
  date: string;
  game: DailyGameId;
  title: string;
  emoji: string;
  /** Bónusz XP, amit teljesítéskor kap. */
  bonusXp: number;
};

/** A mai napi kihívás (deterministic — minden eszközön ugyanaz). */
export function getTodaysPick(date: string = todayISO()): DailyPick {
  const idx = fnv1a(date) % DAILY_GAMES.length;
  const g = DAILY_GAMES[idx]!;
  return {
    date,
    game: g.id,
    title: g.title,
    emoji: g.emoji,
    bonusXp: 50,
  };
}

/**
 * Megjelölés, hogy ma teljesítette a játékos a napi kihívást.
 * Streak-számítás:
 *   - ha tegnap is teljesítette → streakDays += 1
 *   - ha kihagyott napot → streakDays = 1
 *   - ha ma már teljesítette korábban → no-op
 *
 * Visszaadja, hogy MOST jelölte-e meg (true) vagy már korábban megvolt (false).
 */
export function markDailyCompleted(): { newlyCompleted: boolean; state: DailyState } {
  const today = todayISO();
  const state = loadState();
  if (state.lastCompletedDate === today) {
    return { newlyCompleted: false, state };
  }
  // Streak: tegnapi vagy nem.
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();
  const continuing = state.lastCompletedDate === yesterday;
  const next: DailyState = {
    lastCompletedDate: today,
    streakDays: continuing ? state.streakDays + 1 : 1,
    totalDays: state.totalDays + 1,
  };
  saveState(next);
  return { newlyCompleted: true, state: next };
}

/** Igaz-e, hogy a megadott gameId megegyezik a mai napival, és még nem teljesítette? */
export function isTodaysGameAvailable(gameId: DailyGameId): boolean {
  const pick = getTodaysPick();
  if (pick.game !== gameId) return false;
  const state = loadState();
  return state.lastCompletedDate !== pick.date;
}

/* ============== React hook ============== */

export function useDailyChallenge() {
  const [state, setState] = useState<DailyState>(() => loadState());
  const [pick, setPick] = useState<DailyPick>(() => getTodaysPick());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setState(loadState());
      setPick(getTodaysPick());
    };
    window.addEventListener(CHANGE_EVENT, handler);
    // Naponta egyszer (vagy oldalbetöltéskor) frissítjük a pick-et — ez automatikusan
    // megtörténik a CHANGE_EVENT triggerelésekor a markDailyCompleted-ben.
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);

  return {
    state,
    pick,
    /** Ma megvan-e a daily teljesítve? */
    completedToday: state.lastCompletedDate === pick.date,
    streakDays: state.streakDays,
    totalDays: state.totalDays,
  };
}
