import { useCallback } from "react";

import { isMuted } from "../../lib/audioEngine";
import { useReducedMotion } from "../useReducedMotion";

/**
 * S2 / terv 4.5 „Visszajelzés” — rezgés jó / rossz válaszra és találatra.
 *
 * Csak akkor rezeg, ha a böngésző ismeri a `navigator.vibrate`-et (iOS Safari nem), a hang nincs
 * némítva (a némítás a gyereknél / szülőnél a „csendet kérek” jele), és nincs csökkentett mozgás beállítva.
 */

export type HapticKind = "tap" | "success" | "error" | "hit";

export const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  success: 18,
  error: [30, 40, 30],
  hit: 12,
};

export function shouldVibrate(env: { supported: boolean; muted: boolean; reducedMotion: boolean }): boolean {
  return env.supported && !env.muted && !env.reducedMotion;
}

export function useHaptics(): (kind: HapticKind) => void {
  const reducedMotion = useReducedMotion();
  return useCallback(
    (kind: HapticKind) => {
      if (typeof navigator === "undefined") return;
      const supported = typeof navigator.vibrate === "function";
      if (!shouldVibrate({ supported, muted: isMuted(), reducedMotion })) return;
      try {
        navigator.vibrate(HAPTIC_PATTERNS[kind]);
      } catch (err) {
        // Egyes beágyazott nézetek (iframe-szabályzat) dobnak: a rezgés elmarad, a játék megy tovább.
        void err;
      }
    },
    [reducedMotion],
  );
}
