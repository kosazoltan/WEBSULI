/**
 * J0c — a játékok közös, tartós beállításai (végrehajtás J0c „Szerződés”; terv D4).
 *
 * Jelenleg egyetlen kapcsoló: a felolvasás (`tts`). Alapértéke BE (D4 (a)): a nyelvi tételek célnyelvi szavát a játék
 * felolvassa, ha a `readAloudEnabled` kapu is enged (`L/tts.ts`), és a gyerek egy koppintással kikapcsolhatja.
 *
 * Hibatűrés (terv 8.3): olvasási / írási kivétel, sérült JSON, ismeretlen verzió → alapérték, kivétel soha. A beállítás
 * modul-szintű tárban él, így egy lapon belül minden feliratkozó (kérdés-sáv, szünet menü kapcsolója) azonnal frissül.
 */
import { useCallback, useSyncExternalStore } from "react";

import type { StorageLike } from "@/game-engine/vocab";
import { safeLocalStorage } from "@/game-engine/vocab";

export const GAME_SETTINGS_KEY = "websuli.gameSettings.v1";
export type GameSettings = { v: 1; tts: boolean };

const DEFAULTS: GameSettings = { v: 1, tts: true };

/** Hiba / ismeretlen v → `{ v: 1, tts: true }`. */
export function loadGameSettings(storage: StorageLike | null): GameSettings {
  if (!storage) return { ...DEFAULTS };
  try {
    const raw = storage.getItem(GAME_SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || (parsed as { v?: unknown }).v !== 1) return { ...DEFAULTS };
    const tts = (parsed as { tts?: unknown }).tts;
    return { v: 1, tts: typeof tts === "boolean" ? tts : DEFAULTS.tts };
  } catch (_err) {
    return { ...DEFAULTS };
  }
}

export function saveGameSettings(storage: StorageLike | null, s: GameSettings): void {
  if (!storage) return;
  try {
    storage.setItem(GAME_SETTINGS_KEY, JSON.stringify({ v: 1, tts: s.tts === true }));
  } catch (_err) {
    // Privát mód / megtelt tár: a beállítás a munkamenet végéig memóriában marad.
  }
}

/* ------------------------------ közös, feliratkozható tár ------------------------------ */

let current: GameSettings | null = null;
const listeners = new Set<() => void>();

function read(): GameSettings {
  if (!current) current = loadGameSettings(safeLocalStorage());
  return current;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER_SNAPSHOT: GameSettings = { ...DEFAULTS };

/** A pillanatnyi beállítás (React nélkül, pl. a `createGameSpeech` alapértelmezett kapujához). */
export function currentGameSettings(): GameSettings {
  return read();
}

/** Beállítás módosítása: tárol és minden feliratkozót értesít. */
export function updateGameSettings(patch: Partial<Omit<GameSettings, "v">>): GameSettings {
  const next: GameSettings = { ...read(), ...patch, v: 1 };
  current = next;
  saveGameSettings(safeLocalStorage(), next);
  for (const l of listeners) l();
  return next;
}

export function useGameSettings(): [GameSettings, (patch: Partial<Omit<GameSettings, "v">>) => void] {
  const settings = useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
  const update = useCallback((patch: Partial<Omit<GameSettings, "v">>) => {
    updateGameSettings(patch);
  }, []);
  return [settings, update];
}
