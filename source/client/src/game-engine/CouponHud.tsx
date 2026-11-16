import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { Clock, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRemaining } from "./coupon-clock";
import type { CouponSession } from "./useCouponSession";

/**
 * LS-3b — what the child sees of their earned play time.
 *
 * Two pieces, both deliberately small. A countdown badge that turns urgent under a
 * minute, and an overlay when the time is gone that points back at the lesson rather
 * than at a "play again" button: the coupon is the reward for a finished section, so the
 * way to get more is another section.
 *
 * Both render nothing without a coupon. Free play must look exactly as it did before.
 */

export function CouponHud({ session }: { session: CouponSession }) {
  if (!session.active) return null;

  const urgent = session.remaining <= 60;

  return (
    <div
      className={cn(
        "pointer-events-none fixed top-3 left-1/2 -translate-x-1/2 z-40",
        "flex items-center gap-2 rounded-full px-4 py-2 min-h-11",
        "font-bold tabular-nums shadow-lg backdrop-blur",
        urgent ? "bg-red-600/90 text-white" : "bg-emerald-600/90 text-white",
      )}
      data-testid="coupon-hud"
      aria-live="polite"
    >
      <Timer className="w-4 h-4" />
      <span>{formatRemaining(session.remaining)}</span>
      <span className="text-xs font-normal opacity-90">játékidő</span>
    </div>
  );
}

/**
 * Shown when the coupon runs out.
 *
 * The child is not thrown out of the game — the overlay sits on top, so an unfinished
 * run stays visible behind it. What it offers is the route back to the lesson, because
 * that is where the next minute comes from.
 *
 * Layering: portalled into `document.body` and stacked by `--game-z-coupon-expired`
 * (index.css), above every game layer — the shared pause menu and result screen
 * (`.game-overlay`, z 80) and the quiz feedback card (z 90) included. Otherwise the
 * child would reach "play again" instead of the way back to the lesson. The dialog is
 * modal: the full-screen backdrop takes every pointer event and focus lands on the link.
 */
export function CouponExpiredOverlay({ session }: { session: CouponSession }) {
  const backRef = useRef<HTMLButtonElement>(null);
  const expired = session.expired;

  useEffect(() => {
    if (!expired) return;
    backRef.current?.focus({ preventScroll: true });
    // The only focusable control is the way back: keep Tab on it instead of the layers below.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        backRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expired]);

  if (!expired || typeof document === "undefined") return null;

  const back =
    session.lessonId !== null
      ? `/lesson/${session.lessonId}${session.sectionIdx != null && session.sectionIdx >= 0 ? `#section-${session.sectionIdx + 1}` : ""}`
      : "/games";

  return createPortal(
    <div
      className="game-coupon-expired"
      data-testid="coupon-expired"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coupon-expired-title"
    >
      <div className="max-w-sm w-full rounded-2xl bg-card p-6 text-center text-card-foreground space-y-4">
        <Clock className="w-10 h-10 mx-auto text-amber-500" />
        <h2 id="coupon-expired-title" className="text-xl font-bold">
          Idő lejárt
        </h2>
        <p className="text-sm text-muted-foreground">
          Elfogyott a játékidőd. Egy újabb próba a leckében újabb perceket ér.
        </p>
        <Link href={back}>
          <Button ref={backRef} className="w-full min-h-12 text-base" data-testid="coupon-expired-back">
            Vissza a leckéhez
          </Button>
        </Link>
      </div>
    </div>,
    document.body,
  );
}
