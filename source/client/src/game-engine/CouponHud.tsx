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
 */
export function CouponExpiredOverlay({ session }: { session: CouponSession }) {
  if (!session.expired) return null;

  const back =
    session.lessonId !== null
      ? `/lesson/${session.lessonId}#section-${(session.sectionIdx ?? 0) + 1}`
      : "/games";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      data-testid="coupon-expired"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-w-sm w-full rounded-2xl bg-card p-6 text-center space-y-4">
        <Clock className="w-10 h-10 mx-auto text-amber-500" />
        <h2 className="text-xl font-bold">Idő lejárt</h2>
        <p className="text-sm text-muted-foreground">
          Elfogyott a játékidőd. Egy újabb próba a leckében újabb perceket ér.
        </p>
        <Link href={back}>
          <Button className="w-full min-h-11" data-testid="coupon-expired-back">
            Vissza a leckéhez
          </Button>
        </Link>
      </div>
    </div>
  );
}
