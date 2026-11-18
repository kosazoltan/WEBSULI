/**
 * Párbaj-visszajelzés: hang, rezgés, rázás (JM1r: az aréna `handleEffects`-je, egy játékos nézőpontjára).
 *
 * Minden hangnak vizuális párja van (KSZ-18) — a hívó a megfelelő DOM-jelzést (ítélet-sáv, csapás-szám) maga rajzolja.
 * A rázás a közös `feel` traumáján át (KSZ-10), csökkentett mozgásnál 0; a saját képkocka-hurok a `shakeRef` elemre ír.
 * A hangok a meglévő `audioEngine`-en szólnak (gesztusra induló közös `AudioContext`, tartós némítás).
 */
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useHaptics } from "@/game-engine/mobile";
import { createFeel, type Feel, type ShakeOffset } from "@/game-engine/play";
import { beep, sfxClick, sfxHit, sfxLevelUp, sfxSuccess, sfxWarning } from "@/lib/audioEngine";
import { createRng } from "@shared/game-rng";

export type DuelFeedback = {
  /** A rázandó doboz (a saját panel). */
  shakeRef: (el: HTMLElement | null) => void;
  countdownTick: () => void;
  roundOpen: (round: number, tiebreak: boolean) => void;
  locked: () => void;
  /** A kör felfedése: `damageTaken` = ami ENGEM ért, `damageDealt` = amit én okoztam. */
  reveal: (args: { damageTaken: number; damageDealt: number }) => void;
  finished: (won: boolean) => void;
};

export function useDuelFeedback(opts: { reducedMotion: boolean; fxSeed?: string }): DuelFeedback {
  const haptic = useHaptics();
  const boxRef = useRef<HTMLElement | null>(null);
  const feelRef = useRef<Feel | null>(null);
  const seed = opts.fxSeed ?? "duel-fx";

  useEffect(() => {
    feelRef.current = createFeel({ reducedMotion: opts.reducedMotion, fxRng: createRng(`fx:${seed}`).next });
  }, [opts.reducedMotion, seed]);

  // Saját rázás-hurok: csak DOM-ot ír (K.4/10), React-állapot nélkül.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const off: ShakeOffset = { x: 0, y: 0, rot: 0 };
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(250, Math.max(0, t - last));
      last = t;
      const feel = feelRef.current;
      const box = boxRef.current;
      if (!feel || !box) return;
      feel.update(dt);
      feel.shakeOffset(off, box.clientHeight || 300);
      box.style.transform = off.x || off.y || off.rot ? `translate(${off.x.toFixed(2)}px, ${off.y.toFixed(2)}px) rotate(${((off.rot * 180) / Math.PI).toFixed(3)}deg)` : "";
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const shakeRef = useCallback((el: HTMLElement | null) => {
    boxRef.current = el;
  }, []);

  return useMemo<DuelFeedback>(
    () => ({
      shakeRef,
      countdownTick: () => beep(660, 0.12, "sine", 0.05),
      roundOpen: (round, tiebreak) => {
        if (tiebreak) sfxWarning();
        else if (round === 1) beep(990, 0.18, "sine", 0.06);
      },
      locked: () => {
        sfxClick();
        haptic("tap");
      },
      reveal: ({ damageTaken, damageDealt }) => {
        if (damageDealt > 0) {
          sfxSuccess();
          haptic("success");
        }
        if (damageTaken > 0) {
          window.setTimeout(() => sfxHit(), damageDealt > 0 ? 140 : 0);
          haptic("hit");
          feelRef.current?.addTrauma(Math.min(0.75, 0.3 + damageTaken / 30));
        }
        if (damageDealt <= 0 && damageTaken <= 0) beep(330, 0.22, "sine", 0.04);
      },
      finished: (won) => {
        if (won) sfxLevelUp();
        else beep(523, 0.25, "sine", 0.05);
      },
    }),
    [haptic, shakeRef],
  );
}
