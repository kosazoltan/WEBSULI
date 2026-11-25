import { useEffect, useState } from "react";
import { parseStreak, recordLessonResult, streakBadge, streakNext, type StreakState } from "@shared/lesson-streak";

/**
 * V5c — sorozatjelvény (docs/specs/2026-11-25-v5c-sorozatjelveny.md). A kapcsoló a kliens-buildbe égetett (Vercel:
 * `VITE_LESSON_STREAK_BADGE=on`); teszt-kampós buildben a `window.__websuliStreakBadge === true` kapcsolja be. KI állásban semmi nem
 * rögzül és nem jelenik meg.
 */
const BUILD_FLAG = import.meta.env.VITE_LESSON_STREAK_BADGE === "on";
const TEST_HOOKS = import.meta.env.VITE_ENABLE_GAME_TEST_HOOKS === "1";
export function streakBadgeEnabled(): boolean {
  if (BUILD_FLAG) return true;
  return TEST_HOOKS && typeof window !== "undefined" && (window as unknown as { __websuliStreakBadge?: unknown }).__websuliStreakBadge === true;
}

const STORAGE_KEY = "websuli:lesson-streak:v1";
let memory: StreakState | null = null;
function load(): StreakState {
  try { return parseStreak(localStorage.getItem(STORAGE_KEY)); } catch { return memory ?? parseStreak(null); }
}
const article = (word: string) => (/^[aáeéiíoóöőuúüű]/i.test(word) ? "az" : "a");

/**
 * A kész kör egyszeri rögzítése és a sáv. `done`: a kör kész (lezárva vagy minden kérdés megválaszolva); `roundKey` a kör azonossága.
 */
export function useLessonStreak(enabled: boolean, done: boolean, lessonKey: string, roundKey: string, percent: number): { state: StreakState; good: boolean } | null {
  const [view, setView] = useState<{ state: StreakState; good: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || !done) { setView(null); return; }
    const before = load();
    const after = recordLessonResult(before, { lessonKey, roundKey, percent });
    if (after !== before) {
      memory = after;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(after)); } catch { /* a memóriából jelenik meg */ }
    }
    setView({ state: after, good: percent >= 80 });
  }, [enabled, done, lessonKey, roundKey, percent]);
  return view;
}

export function StreakBand({ view }: { view: { state: StreakState; good: boolean } }) {
  const { count } = view.state;
  const badge = streakBadge(count);
  const next = streakNext(count);
  return <div role="status" aria-label="Leckesorozat" className="fusion-streak" data-count={count}>
    {view.good
      ? <p><strong>Sorozat: {count} jó lecke egymás után</strong>{badge ? <> · <span className="fusion-streak-badge">{badge.name} jelvény</span></> : null}</p>
      : <p>A sorozat újraindul — a következő jó leckével kezdődik.</p>}
    {view.good && next && <p>Még {next.missing} {article(next.name)} {next.name} jelvényig.</p>}
  </div>;
}
