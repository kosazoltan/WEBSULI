import type { VocabLevel } from "../../data/vocabBank/types";
import { ladderTierIndex } from "../no-repeat";

/**
 * Évfolyam + közös nehézségi sáv → szóbank-szint. Ugyanaz a skála, mint a Szólétrán (`ladderTierIndex`);
 * ismeretlen évfolyamnál a 4. évfolyam (a Szólétra alapértéke).
 */
export function vocabLevelForGrade(grade: number | null | undefined, band: number): VocabLevel {
  return ladderTierIndex(grade ?? 4, band, 5) as VocabLevel;
}
