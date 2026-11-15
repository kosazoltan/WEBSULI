import { useEffect, useState } from "react";

/**
 * S2 / terv 4.5 „Érintés” — érintés-észlelés mind a hét játéknak.
 *
 * A régi `useCoarsePointer` csak az ELSŐDLEGES mutatót nézte (`pointer: coarse`, `hover: none`), ezért az
 * érintős laptop (egér az elsődleges, az érintőkijelző másodlagos) nem kapott érintővezérlést. Az
 * `any-pointer: coarse` és a `navigator.maxTouchPoints` ezt pótolja. Az első kettő a képletben marad, mert a
 * `tests/games-pointer-controls.spec.ts` pontosan azt a kettőt csonkolja.
 */

export type TouchEnv = {
  anyPointerCoarse: boolean;
  pointerCoarse: boolean;
  hoverNone: boolean;
  maxTouchPoints: number;
};

export function detectTouchCapable(env: TouchEnv): boolean {
  return env.anyPointerCoarse || env.pointerCoarse || env.hoverNone || env.maxTouchPoints > 0;
}

const QUERIES = {
  anyPointerCoarse: "(any-pointer: coarse)",
  pointerCoarse: "(pointer: coarse)",
  hoverNone: "(hover: none)",
} as const;

function matches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

/**
 * A `maxTouchPoints` csak akkor számít, ha a böngésző érintés-eseményeket is ad (`ontouchstart`).
 * Mért eset (2026-11-15, érintőkijelzős Windows gép): a Chrome érintés nélküli környezetben is
 * `maxTouchPoints = 10`-et jelentett (a hardvert tükrözi), miközben `any-pointer: coarse` hamis és
 * `ontouchstart` nincs — a nyers érték egérrel vezérelt gépen is érintővezérlőt kapcsolt volna be.
 */
function readMaxTouchPoints(): number {
  if (typeof navigator === "undefined" || typeof window === "undefined") return 0;
  if (!("ontouchstart" in window)) return 0;
  return Number(navigator.maxTouchPoints) || 0;
}

function readTouchEnv(): TouchEnv {
  return {
    anyPointerCoarse: matches(QUERIES.anyPointerCoarse),
    pointerCoarse: matches(QUERIES.pointerCoarse),
    hoverNone: matches(QUERIES.hoverNone),
    maxTouchPoints: readMaxTouchPoints(),
  };
}

function readTouchCapable(): boolean {
  if (typeof window === "undefined") return false;
  return detectTouchCapable(readTouchEnv());
}

/** Igaz, ha az eszköz bármelyik mutatója érintéses; SSR-ben és teszt-környezetben hamis. */
export function useTouchCapable(): boolean {
  const [touch, setTouch] = useState<boolean>(readTouchCapable);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => setTouch(readTouchCapable());
    apply();
    const lists =
      typeof window.matchMedia === "function"
        ? Object.values(QUERIES).map((q) => window.matchMedia(q))
        : [];
    for (const list of lists) list.addEventListener?.("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      for (const list of lists) list.removeEventListener?.("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);

  return touch;
}
