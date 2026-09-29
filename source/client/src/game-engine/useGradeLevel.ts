/**
 * Pálya-bekötés a játékoldalaknak (spec 2026-09-29-palyak-szoletra-nyelvek, 3. döntés; E szelet,
 * végrehajtás: docs/specs/2026-09-29-jatekok-10-palya-vegrehajtas.md).
 *
 * A közös `gradeLevels.ts` tárolására épül. A pálya csak a 3–12. évfolyamon él: évfolyam nélkül és 1–2. évfolyamon a
 * játék a mai módon fut, pályaválasztó nélkül (`level = null`). A menü a legmagasabb feloldott pályát ajánlja, győzelem
 * után a következőt.
 */
import { useCallback, useState } from "react";

import { loadUnlockedLevel, unlockNextLevel } from "./gradeLevels";
import { levelsActiveForGrade, nextSuggestedLevel } from "./levelTuning";

export type GradeLevelState = {
  /** Van-e pályaválasztó ennél az évfolyamnál. */
  active: boolean;
  /** A kiválasztott pálya (1–10), vagy `null`, ha a játék pálya nélkül fut. */
  level: number | null;
  /** A legmagasabb feloldott pálya (1–10). */
  unlocked: number;
  /** Pálya kiválasztása; lezárt pálya nem választható. */
  select: (level: number) => void;
  /** A pálya teljesítése: feloldja a következőt, és azt ajánlja. Visszaadja a legmagasabb feloldottat. */
  complete: (level: number) => number;
};

type Snapshot = { key: string; level: number; unlocked: number };

/**
 * A kiválasztott pálya és a feloldás `gameId` + évfolyam szerint. Évfolyamváltáskor a tárolt haladás újra betöltődik
 * (render közbeni állapot-igazítással, effekt nélkül).
 */
export function useGradeLevel(gameId: string, grade: number | null | undefined): GradeLevelState {
  const active = levelsActiveForGrade(grade);
  const key = active ? `${gameId}.${grade}` : "";
  const read = (): Snapshot => {
    const unlocked = active ? loadUnlockedLevel(gameId, grade) : 1;
    return { key, level: unlocked, unlocked };
  };
  const [snap, setSnap] = useState<Snapshot>(read);
  let current = snap;
  if (snap.key !== key) {
    current = read();
    setSnap(current);
  }

  const select = useCallback((level: number) => {
    setSnap((s) => (Number.isInteger(level) && level >= 1 && level <= s.unlocked ? { ...s, level } : s));
  }, []);

  const complete = useCallback(
    (level: number) => {
      if (!levelsActiveForGrade(grade)) return 1;
      const unlocked = unlockNextLevel(gameId, grade, level);
      setSnap((s) => (s.key === key ? { key, unlocked, level: nextSuggestedLevel(level, unlocked) } : s));
      return unlocked;
    },
    [gameId, grade, key],
  );

  return { active, level: active ? current.level : null, unlocked: current.unlocked, select, complete };
}
