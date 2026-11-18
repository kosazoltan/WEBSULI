import { useCallback, useRef, useState } from "react";

import type { StorageLike } from "./types";

/**
 * S2 / terv 4.5 — helyi legjobb eredmény játékonként.
 *
 * Egy kulcs alatt egy JSON-térkép (`{ [gameId]: number }`). Hiányzó, megtelt, tiltott vagy sérült tároló
 * (terv 5. edge case) soha nem dob: olvasáskor `null`, íráskor a futáson belüli érték számít.
 */

export const GAME_BEST_KEY = "websuli.gameBest.v1";

function readMap(storage: StorageLike | null): Record<string, unknown> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(GAME_BEST_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function readBest(storage: StorageLike | null, gameId: string): number | null {
  const value = readMap(storage)[gameId];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function writeBest(
  storage: StorageLike | null,
  gameId: string,
  score: number,
): { best: number; isNewBest: boolean } {
  const prev = readBest(storage, gameId);
  const improved = prev === null || score > prev;
  const best = improved ? score : prev;
  // S13 / átfogó review L5: a 0 pontos (első) futás tárolódik, de nem „Új rekord!”.
  const isNewBest = improved && score > 0;
  if (storage && improved) {
    try {
      storage.setItem(GAME_BEST_KEY, JSON.stringify({ ...readMap(storage), [gameId]: best }));
    } catch {
      // Megtelt / tiltott tároló: a futáson belüli eredmény így is helyes, csak nem marad meg.
    }
  }
  return { best, isNewBest };
}

function safeLocalStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useBestScore(gameId: string): {
  best: number | null;
  submit(score: number): { best: number; isNewBest: boolean };
} {
  const [best, setBest] = useState<number | null>(() => readBest(safeLocalStorage(), gameId));
  // A futáson belüli emlék: ha a tároló nem ír, a második eredmény is az elsőhöz mérődik.
  const memoryRef = useRef<number | null>(best);

  const submit = useCallback(
    (score: number) => {
      const stored = writeBest(safeLocalStorage(), gameId, score);
      const prev = memoryRef.current;
      const result =
        prev === null
          ? stored
          : { best: Math.max(prev, stored.best), isNewBest: score > prev };
      memoryRef.current = result.best;
      setBest(result.best);
      return result;
    },
    [gameId],
  );

  return { best, submit };
}
