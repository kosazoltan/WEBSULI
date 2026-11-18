import { AnimatePresence, animate, motion } from "framer-motion";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useReducedMotion } from "../useReducedMotion";
import type { Achievement } from "@/lib/achievements";

import { setResultScreenOpen, useModalLayer } from "./modalLayer";
import ResultBadges from "./ResultBadges";
import { computeStars } from "./stars";

/**
 * S2 / terv 4.5 „Folyamat” — egységes eredményképernyő: 1–3 csillag, pontszám, legjobb, jó válaszok
 * aránya, „Újra” és „Vissza a játékokhoz”. Portálon a `body`-ba kerül (lásd `PauseMenu`).
 */

export type ResultScreenProps = {
  open: boolean;
  /** A játék MEGLÉVŐ eredmény-testid-je (sq-won, wl-won, ts-won, br-over, bc-level-complete, sa-over, th-result …). */
  testId: string;
  title: string;
  won: boolean;
  score: number;
  best: number | null;
  isNewBest?: boolean;
  correct: number;
  total: number;
  /** Alap: `computeStars({ correct, total, won })`. */
  stars?: 1 | 2 | 3;
  onRetry: () => void;
  /** Ha meg van adva, a gomb ezt a testid-t kapja (`game-result-retry` helyett) és `data-game-retry="true"`-t. */
  retryTestId?: string;
  retryLabel?: string;
  onBack: () => void;
  backLabel?: string;
  /** Játékspecifikus sor (Storm Coin, tantárgyi bontás). */
  extra?: ReactNode;
  /** S13 / B6: a futás új jelvényei — egységes sor a kártyán (`game-result-badges`). */
  badges?: readonly Achievement[];
};

function CountUp({ value, reduced }: { value: number; reduced: boolean }) {
  const [shown, setShown] = useState(reduced ? value : 0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(fromRef.current, value, {
      duration: Math.min(1.2, 0.4 + Math.abs(value) / 400),
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
    });
    fromRef.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  return <>{shown.toLocaleString("hu-HU")}</>;
}

export default function ResultScreen({
  open,
  testId,
  title,
  won,
  score,
  best,
  isNewBest = false,
  correct,
  total,
  stars,
  onRetry,
  retryTestId,
  retryLabel = "Újra",
  onBack,
  backLabel = "Vissza a játékokhoz",
  extra,
  badges,
}: ResultScreenProps) {
  const reduced = useReducedMotion();
  // A fókusz a párbeszédre kerül (képernyőolvasó felolvassa, Tab az „Újra” gombra visz), nem a gombra:
  // a programozott gombfókusz érintős eszközön is kirajzolná a fókuszkeretet.
  const dialogRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  // S13 / review K1: inert háttér, fókuszcsapda, fókusz vissza bezáráskor.
  useModalLayer(open, layerRef, dialogRef);
  useEffect(() => {
    if (!open) return;
    setResultScreenOpen(true);
    return () => setResultScreenOpen(false);
  }, [open]);
  const starCount = stars ?? computeStars({ correct, total, won });
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

  useEffect(() => {
    if (open) dialogRef.current?.focus({ preventScroll: true });
  }, [open]);

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="game-result"
          ref={layerRef}
          data-testid={testId}
          data-game-result="true"
          data-won={won ? "true" : "false"}
          className="game-overlay game-result-overlay"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-result-title"
            className="game-dialog game-result"
            data-won={won ? "true" : "false"}
            initial={reduced ? false : { opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          >
            <div className="game-result-hero">
              <h2 id="game-result-title" className="game-result-title">
                {title}
              </h2>
              <div
                className="game-result-stars"
                data-testid="game-result-stars"
                data-stars={starCount}
                role="img"
                aria-label={`${starCount} csillag a háromból`}
              >
                {[1, 2, 3].map((n) => {
                  const filled = n <= starCount;
                  return (
                    <motion.span
                      key={n}
                      aria-hidden="true"
                      className={`game-result-star ${n === 2 ? "game-result-star-mid" : ""}`}
                      data-filled={filled ? "true" : "false"}
                      initial={reduced ? false : { scale: 0, rotate: -40, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 440, damping: 15, delay: reduced ? 0 : 0.25 + n * 0.16 }}
                    >
                      {filled ? "★" : "☆"}
                    </motion.span>
                  );
                })}
              </div>
              <div className="game-result-score" aria-label={`Pontszám: ${score}`}>
                <span className="game-result-score-label">Pontszám</span>
                <span className="game-result-score-value">
                  <CountUp value={score} reduced={reduced} />
                </span>
              </div>
            </div>

            <div className="game-result-side">
              <div className="game-result-stats">
                <div className="game-result-stat">
                  <Trophy className="h-5 w-5 text-amber-300" aria-hidden="true" />
                  <span>
                    Legjobb: <strong>{(best ?? score).toLocaleString("hu-HU")}</strong>
                  </span>
                  {isNewBest && (
                    <motion.span
                      className="game-result-newbest"
                      initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: reduced ? 0 : 0.9, type: "spring", stiffness: 500, damping: 18 }}
                    >
                      Új rekord!
                    </motion.span>
                  )}
                </div>
                <div className="game-result-stat">
                  <span className="game-result-dot" aria-hidden="true" />
                  <span>
                    Jó válaszok: <strong>{correct}/{total}</strong> ({percent}%)
                  </span>
                </div>
                {badges && badges.length > 0 && <ResultBadges badges={badges} />}
                {extra && <div className="game-result-extra">{extra}</div>}
              </div>
              <div className="game-result-actions">
                <button
                  type="button"
                  data-testid={retryTestId ?? "game-result-retry"}
                  data-game-retry="true"
                  className="game-btn game-btn-primary"
                  onClick={onRetry}
                >
                  <RotateCcw className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                  {retryLabel}
                </button>
                <button type="button" data-testid="game-result-back" className="game-btn game-btn-secondary" onClick={onBack}>
                  <ArrowLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                  {backLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
