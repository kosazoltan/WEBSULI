import { useEffect, useState } from "react";

/**
 * G-5 — `prefers-reduced-motion` egy helyen, mind a hét játéknak.
 *
 * Measured on 2026-09-07: the three 3D games (Tornado, BlockCraft, SpaceAsteroid)
 * contained zero references to the preference, while WordLadder had eleven. So the
 * two heaviest camera-shake games were exactly the ones ignoring it.
 *
 * This matters more for children than the usual accessibility argument suggests: a
 * child who feels sick after two minutes does not file a bug, they stop playing and
 * nobody learns why. The preference is a system setting a parent can already set.
 *
 * SSR- and test-safe: without `matchMedia` it reports false rather than throwing,
 * because a game that crashes is worse than a game that animates.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function readPreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(readPreference);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(QUERY);
    const onChange = () => setReduced(media.matches);

    // A beállítás menet közben is változhat (a szülő átállítja a rendszerben),
    // és a régebbi WebKit csak az elavult addListener-t ismeri.
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return reduced;
}

/**
 * Effekt-szorzó a részecske- és rázás-mennyiséghez.
 *
 * A játékok nem kapcsolják ki teljesen a visszajelzést — a nulla részecske
 * ugyanúgy elveszi a találat örömét —, csak visszaveszik. A kamerarázás viszont
 * teljesen elmarad: az okozza a rosszullétet, nem a konfetti.
 */
export function motionScale(reduced: boolean): { particles: number; shake: number } {
  return reduced ? { particles: 0.4, shake: 0 } : { particles: 1, shake: 1 };
}
