import { useEffect, useState } from "react";

import type { GameOrientation } from "./types";

/** Négyzetes nézetben álló: a játékok álló elrendezése a biztonságosabb alap. */
export function orientationFrom(width: number, height: number): GameOrientation {
  return width > height ? "landscape" : "portrait";
}

function readOrientation(): GameOrientation {
  if (typeof window === "undefined") return "portrait";
  return orientationFrom(window.innerWidth, window.innerHeight);
}

export function useOrientation(): GameOrientation {
  const [orientation, setOrientation] = useState<GameOrientation>(readOrientation);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => setOrientation(readOrientation());
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  return orientation;
}
