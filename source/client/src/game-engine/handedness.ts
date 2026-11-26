import { useCallback, useState } from "react";

/**
 * JK (docs/specs/2026-11-26-jatek-kezesseg.md): közös kezesség-preferencia minden joystickos játéknak. Jobbkezes (alap): a joystick
 * balra, az akció- / segédgombok jobbra; balkezes: fordítva. Tárolóhiba esetén alapérték; egy régi, játékonkénti kulcs csak
 * tartalék (ha a közös még nincs beállítva), az írás mindkettőbe megy.
 */
export const GAME_HAND_KEY = "websuli.game.hand";
export type Hand = "left" | "right";
type ReadStore = { getItem: (key: string) => string | null };
type WriteStore = ReadStore & { setItem: (key: string, value: string) => void };

const isHand = (v: unknown): v is Hand => v === "left" || v === "right";

export function readHand(store: ReadStore | null | undefined, legacyKey?: string): Hand {
  if (!store) return "right";
  try {
    const shared = store.getItem(GAME_HAND_KEY);
    if (isHand(shared)) return shared;
    const legacy = legacyKey ? store.getItem(legacyKey) : null;
    return isHand(legacy) ? legacy : "right";
  } catch {
    return "right";
  }
}

export function writeHand(store: WriteStore | null | undefined, hand: Hand, legacyKey?: string): void {
  if (!store) return;
  try {
    store.setItem(GAME_HAND_KEY, hand);
    if (legacyKey) store.setItem(legacyKey, hand);
  } catch {
    /* privát mód / megtelt tároló: a választás a menetre érvényes marad */
  }
}

function browserStore(): WriteStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const loadHand = (legacyKey?: string): Hand => readHand(browserStore(), legacyKey);
/** A közös kulcs tárolt értéke (nincs / hibás: `null`) — a saját kezesség-beállítással bíró játék (Tornádó) ehhez igazodik. */
export function storedHand(): Hand | null {
  try {
    const v = browserStore()?.getItem(GAME_HAND_KEY);
    return isHand(v) ? v : null;
  } catch {
    return null;
  }
}
export const saveHand = (hand: Hand, legacyKey?: string): void => writeHand(browserStore(), hand, legacyKey);

/** A játék kezesség-állapota: a tárolt közös preferenciából indul, a választás azonnal tárolódik. */
export function useHandedness(legacyKey?: string): [Hand, (hand: Hand) => void] {
  const [hand, setHand] = useState<Hand>(() => loadHand(legacyKey));
  const choose = useCallback(
    (next: Hand) => {
      setHand(next);
      saveHand(next, legacyKey);
    },
    [legacyKey],
  );
  return [hand, choose];
}
