import { useEffect, useRef } from "react";

/**
 * S2 / terv 4.5 „Folyamat” — automatikus szünet, ha a lap háttérbe kerül vagy a telefon elfordul.
 *
 * A tiszta `attachAutoPause` Node `EventTarget`-tel tesztelhető; a hook csak bekötés.
 */

export type AutoPauseTarget = {
  doc: {
    visibilityState: string;
    addEventListener(t: string, f: () => void): void;
    removeEventListener(t: string, f: () => void): void;
  };
  win: {
    addEventListener(t: string, f: () => void): void;
    removeEventListener(t: string, f: () => void): void;
  };
};

export function attachAutoPause(target: AutoPauseTarget, onPause: () => void): () => void {
  const { doc, win } = target;
  const onVisibility = () => {
    if (doc.visibilityState === "hidden") onPause();
  };
  const onLeave = () => onPause();
  doc.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("pagehide", onLeave);
  win.addEventListener("orientationchange", onLeave);
  return () => {
    doc.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("pagehide", onLeave);
    win.removeEventListener("orientationchange", onLeave);
  };
}

/** `active` igaz amíg a játék fut; az `onPause` mindig a legfrissebb példány (nem iratkozik újra minden renderre). */
export function useAutoPause(active: boolean, onPause: () => void): void {
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;

  useEffect(() => {
    if (!active || typeof window === "undefined" || typeof document === "undefined") return;
    return attachAutoPause({ doc: document, win: window }, () => onPauseRef.current());
  }, [active]);
}
