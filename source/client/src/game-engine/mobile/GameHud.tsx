import { motion } from "framer-motion";
import { Pause } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { useReducedMotion } from "../useReducedMotion";

/**
 * S2 / terv 4.5 — játék közbeni fejléc: áttetsző stat-kártyák, szünet gomb, időcsík.
 *
 * A biztonsági sávot KÜLSŐ margóval tartja (`--game-safe-*`), így a gyökér doboza maga is a sávon belül
 * marad — a `safeAreaViolations` mérés a dobozt nézi. `env()` közvetlenül tilos (az e2e a változót írja felül).
 */

export type GameHudStat = {
  id: string;
  label: string;
  value: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
};

export type GameHudProps = {
  /** Telefonon legfeljebb 4 egy sorban; több esetén 2 sor. Széles nézetben mind egy sorban. */
  stats: GameHudStat[];
  onPause: () => void;
  progress?: { value: number; max: number; label: string; tone?: "default" | "warn" | "bad" };
  /** Játékspecifikus elem (pl. CouponHud). */
  children?: ReactNode;
};

export default function GameHud({ stats, onPause, progress, children }: GameHudProps) {
  const reduced = useReducedMotion();
  const ratio = progress && progress.max > 0 ? Math.min(1, Math.max(0, progress.value / progress.max)) : 0;
  // Telefonon legfeljebb 4 egy sorban; 5–8 stat két kiegyensúlyozott sorban (5 → 3 + 2), nem 4 + 1.
  const phoneCols = stats.length <= 4 ? stats.length : Math.min(4, Math.ceil(stats.length / 2));
  const gridStyle = {
    "--hud-cols": Math.max(1, phoneCols),
    "--hud-cols-wide": Math.max(1, stats.length),
  } as CSSProperties;

  return (
    <div data-game-hud className="game-hud">
      <div className="game-hud-row">
        <div className="game-hud-stats" style={gridStyle}>
          {stats.map((s) => (
            <div key={s.id} className="game-hud-stat" data-tone={s.tone ?? "default"} data-hud-stat={s.id}>
              <span className="game-hud-stat-label">{s.label}</span>
              <motion.span
                key={reduced ? s.id : String(s.value)}
                className="game-hud-stat-value"
                initial={reduced ? false : { scale: 1.25, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 520, damping: 24 }}
              >
                {s.value}
              </motion.span>
            </div>
          ))}
        </div>
        <button
          type="button"
          data-testid="game-pause"
          aria-label="Szünet"
          className="game-hud-pause"
          onClick={onPause}
        >
          <Pause className="h-5 w-5" strokeWidth={0} fill="currentColor" aria-hidden="true" />
        </button>
      </div>
      {progress && (
        <div className="game-hud-progress" data-tone={progress.tone ?? "default"}>
          <div
            data-testid="game-progress"
            role="progressbar"
            aria-label={progress.label}
            aria-valuemin={0}
            aria-valuemax={progress.max}
            aria-valuenow={progress.value}
            className="game-hud-progress-track"
          >
            <div
              className="game-hud-progress-fill"
              style={{ transform: `scaleX(${ratio})`, transition: reduced ? "none" : undefined }}
            />
          </div>
          <span className="game-hud-progress-label">{progress.label}</span>
        </div>
      )}
      {children}
    </div>
  );
}
