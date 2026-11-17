import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { Clock, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRemaining } from "./coupon-clock";
import { GAME_HALT_EVENT, setCouponExpired } from "./mobile/modalLayer";
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
        // S13 / átfogó review L3: a hely (biztonsági sáv, a HUD alá tolása) a közös .game-coupon-hud CSS-ben.
        "game-coupon-hud pointer-events-none fixed left-1/2 -translate-x-1/2 z-40",
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const expired = session.expired;

  useEffect(() => {
    if (!expired) return;
    backRef.current?.focus({ preventScroll: true });

    // Everything else on the page (the game, the pause menu, the result screen, an open quiz
    // feedback card) stops receiving pointer, focus and assistive-tech input.
    const inerted = new Set<HTMLElement>();
    const keepFocus = () => {
      const dialog = dialogRef.current;
      if (dialog && !dialog.contains(document.activeElement)) backRef.current?.focus({ preventScroll: true });
    };
    const inertSiblings = () => {
      for (const el of Array.from(document.body.children)) {
        if (el instanceof HTMLElement && el !== dialogRef.current && !el.hasAttribute("inert")) {
          el.setAttribute("inert", "");
          inerted.add(el);
        }
      }
      keepFocus();
    };
    inertSiblings();
    // Layers that appear later (the automatic pause menu after a screen rotation, a late toast) are
    // body children too: they must be inert from the moment they are added, not only the ones
    // present when the time ran out.
    const observer = new MutationObserver(inertSiblings);
    observer.observe(document.body, { childList: true });
    // Belt and braces: focus that still lands outside the dialog comes straight back to the button.
    document.addEventListener("focusin", keepFocus, true);
    document.documentElement.dataset.gameCouponExpired = "true";
    // #58: a játék MEGÁLL — a saját szünet-útján (GameShell automatikus szünet: hurok, óra, bemenet), a szünet menü
    // nélkül (a `PauseMenu` a lejárt kupon alatt nem rajzol). Korábban a játékok a párbeszéd alatt tovább futottak.
    setCouponExpired(true);
    window.dispatchEvent(new Event(GAME_HALT_EVENT));

    // The dialog is the only thing that receives keys. A capture listener on `window` runs
    // before every bubble-phase `window` listener (QuizFeedbackCard, PauseMenu, the games'
    // own P / Esc / arrow / space handlers), so stopping propagation here keeps them from
    // acting on the layers beneath — e.g. Enter closing a hidden feedback card instead of
    // following the link. The default action is untouched: Enter / Space still activate the
    // focused button. Tab is pinned to the only control.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.type === "keydown" && e.key === "Tab") {
        e.preventDefault();
        backRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      observer.disconnect();
      document.removeEventListener("focusin", keepFocus, true);
      for (const el of inerted) el.removeAttribute("inert");
      delete document.documentElement.dataset.gameCouponExpired;
      setCouponExpired(false);
    };
  }, [expired]);

  if (!expired || typeof document === "undefined") return null;

  const back =
    session.lessonId !== null
      ? `/lesson/${session.lessonId}${session.sectionIdx != null && session.sectionIdx >= 0 ? `#section-${session.sectionIdx + 1}` : ""}`
      : "/games";

  return createPortal(
    <div
      ref={dialogRef}
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
