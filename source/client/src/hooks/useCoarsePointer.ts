/**
 * C2 — true when the primary pointer is touch-like.
 *
 * Mirrors TsunamiEscapeEnglish's coarse detection, without the low-memory /
 * reduced-motion branches (those are graphics knobs, not control layout).
 */

import { useEffect, useState } from "react";

function readCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(hover: none)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState<boolean>(() => readCoarsePointer());

  useEffect(() => {
    const hover = window.matchMedia("(hover: none)");
    const pointer = window.matchMedia("(pointer: coarse)");
    const apply = () => setCoarse(readCoarsePointer());
    apply();
    hover.addEventListener("change", apply);
    pointer.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      hover.removeEventListener("change", apply);
      pointer.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);

  return coarse;
}
