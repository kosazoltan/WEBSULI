import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import AudioToggleButton from "@/components/AudioToggleButton";

import { useReducedMotion } from "../useReducedMotion";
import { setPauseMenuOpen, useCouponExpired, useModalLayer } from "./modalLayer";

/**
 * S2 / terv 4.5 „Folyamat” — szünet menü: folytatás, újrakezdés, hang, kilépés.
 *
 * Portálon a `body`-ba kerül, mint a `QuizFeedbackCard`: a játékok transzformált / `overflow: hidden`
 * tárolói különben levágnák vagy a vászon alá tolnák. Megnyitáskor a „Folytatás” kapja a fókuszt,
 * `Escape` → folytatás.
 */

export type PauseMenuProps = {
  open: boolean;
  onResume: () => void;
  onRestart: () => void;
  /** A hívó navigál. */
  onExit: () => void;
  exitLabel?: string;
  /** Játékspecifikus beállítás. */
  children?: ReactNode;
};

export default function PauseMenu({ open: requested, onResume, onRestart, onExit, exitLabel = "Kilépés", children }: PauseMenuProps) {
  const reduced = useReducedMotion();
  // #58: a lejárt kupon a játékot a szünet-úton állítja meg, de a menü nem rajzol — a lejárati párbeszéd az egyetlen réteg.
  const couponExpired = useCouponExpired();
  const open = requested && !couponExpired;
  const resumeRef = useRef<HTMLButtonElement>(null);
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;
  const layerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // S13 / review K1: inert háttér, fókuszcsapda, fókusz vissza bezáráskor (a kupon-lejárati réteg mintája).
  useModalLayer(open, layerRef, dialogRef);

  // S13 / review K3: a magyarázókártya szünetben rejtve marad (különben a z 90-es kártya a menü fölé kerülne).
  useEffect(() => {
    if (!open) return;
    setPauseMenuOpen(true);
    return () => setPauseMenuOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    resumeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onResumeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="game-pause-menu"
          ref={layerRef}
          className="game-overlay"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            data-testid="game-pause-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-pause-title"
            className="game-dialog game-pause"
            initial={reduced ? false : { opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <div className="game-dialog-head">
              <span className="game-pause-badge" aria-hidden="true">
                ❚❚
              </span>
              <h2 id="game-pause-title" className="game-dialog-title">
                Szünet
              </h2>
            </div>
            <div className="game-pause-actions">
              <button
                ref={resumeRef}
                type="button"
                data-testid="game-resume"
                className="game-btn game-btn-primary game-pause-resume"
                onClick={onResume}
              >
                <Play className="h-5 w-5" strokeWidth={2.5} fill="currentColor" aria-hidden="true" />
                Folytatás
              </button>
              <button type="button" data-testid="game-restart" className="game-btn game-btn-secondary" onClick={onRestart}>
                <RotateCcw className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                Újrakezdés
              </button>
              <div data-testid="game-sound" className="game-pause-sound">
                <AudioToggleButton showLabel className="game-btn game-btn-secondary h-12 min-w-12 w-full" />
              </div>
              <button type="button" data-testid="game-exit" className="game-btn game-btn-ghost" onClick={onExit}>
                <LogOut className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
                {exitLabel}
              </button>
            </div>
            {children && <div className="game-pause-extra">{children}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
