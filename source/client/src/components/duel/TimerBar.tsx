/**
 * Időjelző sáv (JM1r: az aréna időjelzője). A kitöltést a hívó képkocka-hurka írja közvetlenül a DOM-ba
 * (`writeTimerBar`), React-állapot nélkül (K.4/10) — a sáv maga nem renderel újra képkockánként.
 */
import { forwardRef } from "react";

export const TimerBar = forwardRef<HTMLDivElement, { testId?: string }>(function TimerBar({ testId }, ref) {
  return (
    <div className="duel-timer" aria-hidden="true">
      <div className="duel-timer-fill" ref={ref} data-testid={testId} />
    </div>
  );
});

/** A hurokból hívandó: `scaleX(ratio)`, 30% alatt figyelmeztető szín (nem villog). */
export function writeTimerBar(el: HTMLElement | null, ratio: number): void {
  if (!el) return;
  const r = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  el.style.transform = `scaleX(${r.toFixed(4)})`;
  el.dataset.low = r < 0.3 && r > 0 ? "true" : "false";
}
