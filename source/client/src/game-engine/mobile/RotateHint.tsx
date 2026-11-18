import { motion } from "framer-motion";
import { Smartphone } from "lucide-react";

import { useReducedMotion } from "../useReducedMotion";
import type { GameOrientation } from "./types";

export type RotateHintProps = { want: GameOrientation; onContinue: () => void };

/** S2 / terv 4.5 „Képernyő” — forgatási kérés, ha a játék csak az egyik tájolásban jó. */
export default function RotateHint({ want, onContinue }: RotateHintProps) {
  const reduced = useReducedMotion();
  const toLandscape = want === "landscape";
  return (
    <div data-testid="game-rotate-hint" className="game-rotate" role="dialog" aria-modal="true" aria-labelledby="game-rotate-title">
      <motion.div
        aria-hidden="true"
        className="game-rotate-icon"
        initial={false}
        animate={reduced ? { rotate: toLandscape ? 90 : 0 } : { rotate: toLandscape ? [0, 0, 90, 90, 0] : [90, 90, 0, 0, 90] }}
        transition={reduced ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut", times: [0, 0.2, 0.45, 0.8, 1] }}
      >
        <Smartphone className="h-16 w-16" strokeWidth={1.6} />
      </motion.div>
      <p id="game-rotate-title" className="game-rotate-title">
        Fordítsd el a telefont
      </p>
      <p className="game-rotate-text">
        {toLandscape ? "Ez a játék fekvő helyzetben a legjobb." : "Ez a játék álló helyzetben a legjobb."}
      </p>
      <button type="button" data-testid="game-rotate-continue" className="game-btn game-btn-ghost" onClick={onContinue}>
        Így is játszom
      </button>
    </div>
  );
}
