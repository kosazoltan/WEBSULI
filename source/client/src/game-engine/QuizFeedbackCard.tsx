import { useEffect, useRef } from "react";

import type { FeedbackCard } from "./feedback";
import { useReducedMotion } from "./useReducedMotion";

/**
 * G-3 — a közös visszajelző kártya.
 *
 * Ez az a felület, ahol a tanulás történik. Measured on 2026-09-07: SpeedQuizMath
 * gave a wrong answer 140 ms of red flash and then loaded the next question. That is
 * long enough to notice a punishment and far too short to learn anything — the child
 * leaves with the wrong idea intact, which is the opposite of what the product is for.
 *
 * Design rules, each of them load-bearing:
 *
 *  - A rossz válasz kártyája NEM tűnik el magától. A gyerek zárja be, amikor
 *    elolvasta. Az automatikus továbblépés pont azt a másodpercet venné el, amiért
 *    az egész kártya készült.
 *  - A helyes válasz kártyája viszont eltűnik magától: ott nincs mit tanulni, és a
 *    lendület megtörése büntetésnek érződne a jó válaszért.
 *  - Szolid háttér, nem áttetsző. Három játék 3D jelenet fölé rajzol; az olvashatóság
 *    nem függhet attól, épp mi van a kamera előtt.
 *  - Billentyűzet: a gomb kap fókuszt, Enter és Escape zár. A 3D játékokban eddig
 *    egérrel kellett a kártyát elütni.
 */

export type QuizFeedbackCardProps = {
  card: FeedbackCard;
  /** Bezárás / továbblépés. */
  onDismiss: () => void;
  /** Újrapróbálkozás ugyanazon a kérdésen; csak ha `card.retryable`. */
  onRetry?: () => void;
  /** Ennyi ms után tűnik el a helyes válasz kártyája. */
  autoDismissMs?: number;
};

const TONE: Record<FeedbackCard["outcome"], { ring: string; badge: string; icon: string }> = {
  correct: { ring: "ring-emerald-400/70", badge: "bg-emerald-500", icon: "✓" },
  wrong: { ring: "ring-amber-400/70", badge: "bg-amber-500", icon: "!" },
  timeout: { ring: "ring-sky-400/70", badge: "bg-sky-500", icon: "⏱" },
};

export default function QuizFeedbackCard({
  card,
  onDismiss,
  onRetry,
  autoDismissMs = 1100,
}: QuizFeedbackCardProps) {
  const reduced = useReducedMotion();
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  const tone = TONE[card.outcome];

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  // Csak a helyes válasz zárul magától. Rossz válasznál a gyerek olvas — az
  // automatikus továbblépés pont a tanulás idejét venné el.
  useEffect(() => {
    if (card.outcome !== "correct") return;
    const id = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [card.outcome, autoDismissMs, onDismiss]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const showRetry = card.retryable && typeof onRetry === "function";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
      data-testid="quiz-feedback"
      data-outcome={card.outcome}
    >
      <div
        className={[
          "w-full max-w-md rounded-2xl bg-slate-900 p-5 text-slate-50 shadow-2xl ring-2",
          tone.ring,
          reduced ? "" : "animate-in fade-in zoom-in-95 duration-200",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${tone.badge}`}
            aria-hidden="true"
          >
            {tone.icon}
          </span>
          <p className="text-lg font-semibold leading-snug" data-testid="quiz-feedback-headline">
            {card.headline}
          </p>
        </div>

        {card.why.length > 0 && (
          <p
            className="mt-3 text-base leading-relaxed text-slate-200"
            data-testid="quiz-feedback-why"
          >
            {card.why}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            ref={primaryRef}
            type="button"
            onClick={onDismiss}
            // 44 px érintési cél — ugyanaz a mérce, amit a lecke-futtató is tart (#198).
            className="min-h-[44px] flex-1 rounded-xl bg-slate-100 px-4 text-base font-semibold text-slate-900 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-100"
            data-testid="quiz-feedback-dismiss"
          >
            {card.outcome === "correct" ? "Tovább" : "Értem, megyek tovább"}
          </button>
          {showRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-[44px] flex-1 rounded-xl border border-slate-500 px-4 text-base font-semibold text-slate-100 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              data-testid="quiz-feedback-retry"
            >
              Újrapróbálom
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
