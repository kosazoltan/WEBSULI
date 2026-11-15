import { motion } from "framer-motion";
import { Play, Settings2, Trophy } from "lucide-react";
import type { ReactNode } from "react";

import { useReducedMotion } from "../useReducedMotion";

/**
 * S2 / terv 4.5 „Folyamat” — egységes kezdőképernyő. A nagy indítógomb az ELSŐ érintés a lapon (a
 * játéklistáról legfeljebb két érintés a játékig, M8); a beállítások alapértékkel kitöltve, összecsukva.
 */

export type StartScreenProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** A meglévő e2e-regexeknek megfelelő felirat. */
  startLabel: string;
  /** A MEGLÉVŐ start-testid, ha van (sq-start, wl-start, bc-start, sa-start, button-tsunami-start). */
  startTestId?: string;
  onStart: () => void;
  best?: number | null;
  /** `<details>` „Beállítások” alatt — indításhoz nem kell megnyitni. */
  settings?: ReactNode;
  /** További gombok (pl. Tornado: Szintek, Garázs). */
  secondary?: ReactNode;
  /** `data-game-menu` értéke a meglévő CSS-hez (pl. "ladder", "brain"). */
  menuKey?: string;
  children?: ReactNode;
};

export default function StartScreen({
  title,
  subtitle,
  icon,
  startLabel,
  startTestId,
  onStart,
  best,
  settings,
  secondary,
  menuKey,
  children,
}: StartScreenProps) {
  const reduced = useReducedMotion();
  const enter = (delay: number) =>
    reduced
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.35, ease: "easeOut" as const, delay },
        };

  return (
    <section data-game-start="true" data-game-menu={menuKey} className="game-start" aria-labelledby="game-start-title">
      <header className="game-start-head">
        {icon && (
          <motion.div
            className="game-start-icon"
            aria-hidden="true"
            animate={reduced ? undefined : { y: [0, -6, 0] }}
            transition={reduced ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            {icon}
          </motion.div>
        )}
        <motion.h1 id="game-start-title" className="game-start-title" {...enter(0.05)}>
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p className="game-start-subtitle" {...enter(0.12)}>
            {subtitle}
          </motion.p>
        )}
        {typeof best === "number" && (
          <motion.p className="game-start-best" {...enter(0.18)}>
            <Trophy className="h-4 w-4 text-amber-300" aria-hidden="true" />
            Legjobb: <strong>{best.toLocaleString("hu-HU")}</strong>
          </motion.p>
        )}
      </header>

      <motion.section className="game-start-actions" aria-label="Indítás" {...enter(0.22)}>
        <button
          type="button"
          data-testid={startTestId}
          data-game-start-btn="true"
          className="game-btn game-btn-primary game-start-btn"
          onClick={onStart}
        >
          <Play className="h-6 w-6" strokeWidth={2.5} fill="currentColor" aria-hidden="true" />
          {startLabel}
        </button>
        {secondary && <nav className="game-start-secondary">{secondary}</nav>}
        {settings && (
          <details className="game-start-settings">
            <summary>
              <Settings2 className="h-5 w-5" aria-hidden="true" />
              Beállítások
            </summary>
            <div className="game-start-settings-body">{settings}</div>
          </details>
        )}
      </motion.section>

      {children && <section className="game-start-extra">{children}</section>}
    </section>
  );
}
