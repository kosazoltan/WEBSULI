import { useEffect, useState } from "react";
import { createStreakStore, recordLessonResult, streakBadge, streakNext, type StreakState } from "@shared/lesson-streak";

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

const store = createStreakStore(() => (typeof localStorage === "undefined" ? null : localStorage));
const article = (word: string) => (/^[aáeéiíoóöőuúüű]/i.test(word) ? "az" : "a");

/**
 * A kész kör egyszeri rögzítése és a sáv. `done`: a kör kész (lezárva vagy minden kérdés megválaszolva); `roundKey` a kör azonossága.
 */
export function useLessonStreak(enabled: boolean, done: boolean, lessonKey: string, roundKey: string, percent: number): { state: StreakState; good: boolean } | null {
  const [view, setView] = useState<{ state: StreakState; good: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || !done) { setView(null); return; }
    const before = store.load();
    const after = recordLessonResult(before, { lessonKey, roundKey, percent });
    if (after !== before) store.save(after);
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

/**
 * Review #606: a rögzítés és a sáv EGY komponensben, amelyet a lap csak a helyi kvíz ágában (PracticeAccess `children`) renderel —
 * bejelentkezve (mentett kvíz), illetve az azonosítás betöltése / hibája alatt nem fut, így a helyben tárolt vendégkör nem rögzül.
 */
export function LocalStreak({ done, lessonKey, roundKey, percent }: { done: boolean; lessonKey: string; roundKey: string; percent: number }) {
  const view = useLessonStreak(streakBadgeEnabled(), done, lessonKey, roundKey, percent);
  return view ? <StreakBand view={view} /> : null;
}
