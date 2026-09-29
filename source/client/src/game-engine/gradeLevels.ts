/**
 * Évfolyamonként 10 nehezedő pálya — közös modul minden játéknak
 * (spec 2026-09-29-palyak-szoletra-nyelvek, 1. döntés).
 *
 * A pálya a játék közös nehézségi sávjának (`difficulty.ts`) KEZDŐPONTJA; a futás közbeni adaptív sáv innen indul, és
 * a pálya sávja körül legfeljebb ±`LEVEL_BAND_SPREAD`-del mozdulhat, így a 10. pálya végig nehezebb marad az 1.-nél.
 * Mit kezd a játék a sávval (kérdés-szint, idő, sebesség), az a játék dolga.
 */
import { DIFFICULTY_FLOOR } from "./difficulty";

export const GRADE_LEVEL_COUNT = 10;
/** A 10. pálya kezdő sávja. */
export const TOP_LEVEL_BAND = 0.95;
/** Ennyit mozdulhat az adaptív sáv a pálya sávja körül. */
export const LEVEL_BAND_SPREAD = 0.15;

const clampLevel = (level: number) =>
  Number.isFinite(level) ? Math.min(GRADE_LEVEL_COUNT, Math.max(1, Math.round(level))) : 1;

/** A pálya kezdő sávja: 1 → 0,15, 10 → 0,95, lineárisan. */
export function levelBand(level: number): number {
  const l = clampLevel(level);
  return DIFFICULTY_FLOOR + ((TOP_LEVEL_BAND - DIFFICULTY_FLOOR) * (l - 1)) / (GRADE_LEVEL_COUNT - 1);
}

/** Az adaptív sáv a pálya sávja körül, a közös [DIFFICULTY_FLOOR, 1] tartományban. */
export function clampToLevel(band: number, level: number): number {
  const center = levelBand(level);
  const b = Number.isFinite(band) ? band : center;
  return Math.min(1, Math.max(DIFFICULTY_FLOOR, Math.min(center + LEVEL_BAND_SPREAD, Math.max(center - LEVEL_BAND_SPREAD, b))));
}

export type LevelStorage = Pick<Storage, "getItem" | "setItem">;

const browserStorage = (): LevelStorage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

const levelKey = (gameId: string, grade: number) => `websuli.levels.${gameId}.${grade}`;

/** A legmagasabb feloldott pálya (1–10); hiányzó, sérült vagy olvashatatlan tárolásnál 1. */
export function loadUnlockedLevel(gameId: string, grade: number, storage: LevelStorage | null = browserStorage()): number {
  try {
    const raw = storage?.getItem(levelKey(gameId, grade));
    const n = raw == null || raw.trim() === "" ? Number.NaN : Number(raw);
    return Number.isInteger(n) && n >= 1 ? Math.min(GRADE_LEVEL_COUNT, n) : 1;
  } catch {
    return 1;
  }
}

/** A `level` pálya teljesítése: legalább a következő pálya nyitva (legfeljebb 10). Visszaadja az új értéket. */
export function unlockNextLevel(gameId: string, grade: number, level: number, storage: LevelStorage | null = browserStorage()): number {
  const next = Math.max(loadUnlockedLevel(gameId, grade, storage), Math.min(GRADE_LEVEL_COUNT, clampLevel(level) + 1));
  try {
    storage?.setItem(levelKey(gameId, grade), String(next));
  } catch {
    /* a tárolás hiánya nem állíthatja meg a játékot */
  }
  return next;
}
