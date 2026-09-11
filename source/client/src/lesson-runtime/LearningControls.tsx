import { ChevronLeft, ChevronRight, LayoutList, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";

/** Optional UI preferences must never block the lesson in private browsing. */
export function useLearningPreference<T extends string | number | boolean>(key: string, fallback: T, valid: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try { const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null"); if (valid(saved)) return saved; }
    catch { /* In-memory controls remain available. */ }
    return fallback;
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } }, [key, value]);
  return [value, setValue] as const;
}

export function LearningPager({ index, count, label, onChange, children }: { index: number; count: number; label: string; onChange(index: number): void; children?: React.ReactNode }) {
  if (count < 2) return null;
  return <nav className="learning-pager" aria-label={`${label} lapozása`}>
    <button type="button" className="lesson-outline-btn" disabled={index === 0} onClick={() => onChange(index - 1)} aria-label={`Előző ${label.toLocaleLowerCase("hu")}`}><ChevronLeft size={20} /><span>Előző</span></button>
    <span className="learning-page-count" aria-live="polite">{index + 1} <span>/ {count}</span></span>
    {children}
    <button type="button" className="lesson-outline-btn" disabled={index >= count - 1} onClick={() => onChange(index + 1)} aria-label={`Következő ${label.toLocaleLowerCase("hu")}`}><span>Következő</span><ChevronRight size={20} /></button>
  </nav>;
}

export function LearningMode({ overview, onChange, label }: { overview: boolean; onChange(value: boolean): void; label: string }) {
  return <button type="button" className="lesson-outline-btn learning-mode" onClick={() => onChange(!overview)} aria-pressed={overview}>{overview ? <BookOpen size={17} /> : <LayoutList size={17} />}{overview ? "Vissza a lapozáshoz" : `Teljes ${label}`}</button>;
}
