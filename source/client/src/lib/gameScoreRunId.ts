import { apiRequest } from "./queryClient";
import { newScoreRunId, sendScoreWithRetry } from "./gameScoreRetry";

export { newScoreRunId };

/** A függő újrapróba-várakozások; az oldal elhagyásakor (pagehide) mind megszakad, nincs utólagos hálózati hívás. */
const pending = new Set<AbortController>();
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const controller of pending) controller.abort();
    pending.clear();
  });
}

function waitMs(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * A pontbeküldés egyszeri, késleltetett újrapróbával (szabályok: gameScoreRetry.ts). Ha az újrapróba is elbukik vagy nincs,
 * a hiba a hívóhoz kerül (a lapok eddigi `.catch`-e változatlan). A függő eredményt nem tároljuk helyben (→ JM8b).
 */
export async function postGameScore(payload: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  pending.add(controller);
  try {
    return await sendScoreWithRetry((body) => apiRequest("POST", "/api/games/score", body), payload, {
      wait: waitMs,
      jitterMs: () => Math.random() * 1000,
      signal: controller.signal,
    });
  } finally {
    pending.delete(controller);
  }
}
