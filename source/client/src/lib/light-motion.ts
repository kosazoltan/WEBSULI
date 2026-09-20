/**
 * Könnyített mozgás (spec 2026-09-20, mért hiba a főoldalon).
 *
 * Mérve (tulajdonosi képernyőkép, táblagép álló nézetben, és a böngészőpanelben reprodukálva):
 * a tananyaglista `opacity: 0`-n ragadt. Ok: a döntés `useEffect`-ben született, ezért az ELSŐ
 * renderelés még a teljes animációt kérte (`initial="hidden"` → a DOM-ba azonnal kiíródott az
 * `opacity: 0`), majd az effekt átváltott könnyített módra, és ezzel eltűnt az animációs CÉL —
 * a félbehagyott áttetszőséget már semmi nem vitte 1-re. Ezért a döntés az első renderelésben,
 * szinkron módon dől el; a média-lekérdezések utólagos változását továbbra is követjük.
 */
export const LIGHT_MOTION_QUERIES = [
  "(hover: none)",
  "(pointer: coarse)",
  "(max-width: 1023px)",
  "(prefers-reduced-motion: reduce)",
] as const;

/** True when any light-motion condition holds. `matches` is injected so it is testable. */
export function prefersLightMotion(matches: (query: string) => boolean): boolean {
  return LIGHT_MOTION_QUERIES.some((query) => matches(query));
}

/** The same decision against the real `matchMedia`; false when there is no window (SSR). */
export function prefersLightMotionNow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return prefersLightMotion((query) => window.matchMedia(query).matches);
}
