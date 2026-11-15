/**
 * C2 — true when the device has a touch-capable pointer.
 *
 * S2 (docs/specs/2026-11-15-jatekok-mobil-szobank.md 4.5): the detection now lives in
 * `@/game-engine/mobile` (`useTouchCapable`), which also reads `any-pointer: coarse` and
 * `navigator.maxTouchPoints`, so a touch laptop gets touch controls too.
 *
 * @deprecated Use `useTouchCapable` from `@/game-engine/mobile`. Kept so BlockCraft and
 * SpaceAsteroid switch to the new detection without a page change.
 */

import { useTouchCapable } from "@/game-engine/mobile/touch";

export function useCoarsePointer(): boolean {
  return useTouchCapable();
}
