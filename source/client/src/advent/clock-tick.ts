/**
 * Adventi naptár — a főoldali kártya órájának figyelője (PR #544 review): a nyitva hagyott lap a fázishatáron (november 24.,
 * december 1., január 7.) és napváltáskor is újraértékeli a kártyát. Jelez: időzítő a következő váltásig (legfeljebb percenként),
 * a láthatóvá váló lap (altatott gép ébredése, háttérlap) és az ablak fókusza. Hálózati kört nem indít — azt a hívó dönti el.
 * A figyelő a környezetet paraméterként kapja, így DOM nélkül tesztelhető (tests/advent-pr544-review.test.ts).
 */
import { useEffect, useState } from "react";
import { homeCardTickDelay } from "@shared/advent/home-card";

type TimerHost = {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  addEventListener: (name: string, fn: () => void) => void;
  removeEventListener: (name: string, fn: () => void) => void;
};
type VisibilityHost = {
  visibilityState: DocumentVisibilityState;
  addEventListener: (name: string, fn: () => void) => void;
  removeEventListener: (name: string, fn: () => void) => void;
};

/** Elindítja a figyelést; a visszaadott függvény leiratkozik (időzítő és eseményfigyelők). */
export function watchAdventClock(env: { win: TimerHost; doc: VisibilityHost }, now: () => Date | null, onTick: () => void): () => void {
  let timer: number | null = null;
  let stopped = false;
  const schedule = () => {
    timer = env.win.setTimeout(() => {
      timer = null;
      if (stopped) return;
      onTick();
      schedule();
    }, homeCardTickDelay(now()));
  };
  const onVisible = () => { if (env.doc.visibilityState === "visible") onTick(); };
  const onFocus = () => { onTick(); };
  schedule();
  env.doc.addEventListener("visibilitychange", onVisible);
  env.win.addEventListener("focus", onFocus);
  return () => {
    stopped = true;
    if (timer !== null) env.win.clearTimeout(timer);
    timer = null;
    env.doc.removeEventListener("visibilitychange", onVisible);
    env.win.removeEventListener("focus", onFocus);
  };
}

/**
 * Egy számláló, amely az óra minden újraértékelésekor nő: a komponens ezt a `useMemo` függőségébe teszi. Az első rajzolás döntése
 * szinkron marad (a számláló 0-ról indul, hálózati kör nélkül) — nincs elrendezés-ugrás.
 */
export function useAdventClockTick(now: () => Date | null): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    return watchAdventClock({ win: window as unknown as TimerHost, doc: document }, now, () => setTick((t) => t + 1));
  }, [now]);
  return tick;
}
