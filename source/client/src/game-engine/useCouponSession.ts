import { useCallback, useEffect, useRef, useState } from "react";

import { getFingerprint } from "@/lib/fingerprintCache";
import {
  advanceClock,
  applyServerSync,
  initialClock,
  type CouponClock,
  type ServerCoupon,
} from "./coupon-clock";

/**
 * LS-3b — the shared play-time session every game mounts.
 *
 * One hook, so the six games do not each invent their own idea of how a coupon works.
 * It does three things and nothing else: keep the HUD's number honest against the
 * server, pause the display when the tab is hidden, and hand a verified correct answer
 * to the server for bonus seconds.
 *
 * Without a coupon it returns `active: false` and the game behaves exactly as it does
 * today — that is the non-regression boundary. A reward feature must never be able to
 * lock a page that used to be free.
 */

const SYNC_INTERVAL_MS = 15_000;
const TICK_INTERVAL_MS = 1_000;

/**
 * Anonymous identity, from the same FingerprintJS cache the like buttons use.
 *
 * Resolved lazily on the first sync rather than at import time: the module is pulled in
 * by every game page, and loading FingerprintJS on pages that never see a coupon would
 * be work nobody asked for. `getFingerprint` caches internally, so this is one load.
 */
let fingerprintValue: string | null = null;

async function ensureFingerprint(): Promise<string | null> {
  if (fingerprintValue) return fingerprintValue;
  try {
    fingerprintValue = await getFingerprint();
  } catch {
    fingerprintValue = null;
  }
  return fingerprintValue;
}

function readFingerprint(): string | null {
  return fingerprintValue;
}

function withFingerprint(url: string): string {
  const fp = readFingerprint();
  return fp ? `${url}${url.includes("?") ? "&" : "?"}fingerprint=${encodeURIComponent(fp)}` : url;
}

type ActiveResponse = {
  coupon:
    | (ServerCoupon & { lessonId: string; sectionIdx: number; minutes: number; started: boolean })
    | null;
};

export type CouponSession = {
  /** True only while a coupon is actually running. */
  active: boolean;
  remaining: number;
  /** Set once the time is gone — the game shows its "idő lejárt" overlay. */
  expired: boolean;
  /** Where to send the child back to. */
  lessonId: string | null;
  sectionIdx: number | null;
  minutes: number;
  /** Report a correct in-game answer; the server decides whether it is worth anything. */
  claimBonus: (quizItemId: string) => Promise<void>;
};

const IDLE: CouponSession = {
  active: false,
  remaining: 0,
  expired: false,
  lessonId: null,
  sectionIdx: null,
  minutes: 0,
  claimBonus: async () => {},
};

export function useCouponSession(): CouponSession {
  const [clock, setClock] = useState<CouponClock | null>(null);
  const [meta, setMeta] = useState<{ lessonId: string; sectionIdx: number; minutes: number } | null>(
    null,
  );
  const clockRef = useRef<CouponClock | null>(null);
  clockRef.current = clock;

  /** Ask the server what is left, and adopt its answer. */
  const sync = useCallback(async () => {
    try {
      await ensureFingerprint();
      const res = await fetch(withFingerprint("/api/lessons/coupons/active"), {
        credentials: "include",
      });
      if (!res.ok) return;

      const data = (await res.json()) as ActiveResponse;
      const now = Date.now();

      if (!data.coupon) {
        // No coupon at all is the normal free-play case, not the end of a session:
        // only tear down a session that had actually started.
        setClock((prev) => (prev ? applyServerSync(prev, null, now) : null));
        setMeta(null);
        return;
      }

      setMeta({
        lessonId: data.coupon.lessonId,
        sectionIdx: data.coupon.sectionIdx,
        minutes: data.coupon.minutes,
      });
      setClock((prev) =>
        prev
          ? applyServerSync(prev, data.coupon as ServerCoupon, now)
          : initialClock(data.coupon as ServerCoupon, now),
      );
    } catch {
      // A failed sync keeps the last known value; the next tick tries again.
    }
  }, []);

  useEffect(() => {
    void sync();
    const id = setInterval(() => void sync(), SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [sync]);

  useEffect(() => {
    const id = setInterval(() => {
      setClock((prev) => (prev ? advanceClock(prev, Date.now()) : prev));
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  /**
   * Freeze the display while the tab is hidden.
   *
   * The server's clock keeps running — this only stops the HUD from drifting on a
   * throttled timer, and the next sync corrects whatever it missed.
   */
  useEffect(() => {
    const setPaused = (paused: boolean) => {
      setClock((prev) => (prev ? { ...prev, paused, lastTickAt: Date.now() } : prev));
      if (!paused) void sync();
    };

    const onVisibility = () => setPaused(document.visibilityState === "hidden");
    const onBlur = () => setPaused(true);
    const onFocus = () => setPaused(false);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [sync]);

  const claimBonus = useCallback(
    async (quizItemId: string) => {
      const current = clockRef.current;
      if (!current || current.expired) return;

      try {
        const res = await fetch(`/api/lessons/coupons/${current.couponId}/bonus`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quizItemId, fingerprint: readFingerprint() ?? undefined }),
        });
        // A rejected bonus (unserved item, replay) is deliberately silent: the child
        // answered a question, they did not do anything wrong.
        if (!res.ok) return;

        const data = (await res.json()) as { remainingSeconds: number };
        setClock((prev) =>
          prev
            ? applyServerSync(prev, { id: prev.couponId, remainingSeconds: data.remainingSeconds }, Date.now())
            : prev,
        );
      } catch {
        // Network failure: the child keeps playing on the time they already have.
      }
    },
    [],
  );

  if (!clock) return IDLE;

  return {
    active: !clock.expired,
    remaining: clock.remaining,
    expired: clock.expired,
    lessonId: meta?.lessonId ?? null,
    sectionIdx: meta?.sectionIdx ?? null,
    minutes: meta?.minutes ?? 0,
    claimBonus,
  };
}
