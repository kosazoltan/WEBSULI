/**
 * Szólétra — pályák (spec docs/specs/2026-09-29-palyak-szoletra-nyelvek.md, 6. döntés; B szelet). Tiszta modul.
 *
 * A pálya két dolgot ad: a létra hosszát (1. pálya rövid, 10. hosszú) és a futás belépő fokozatát.
 *
 * SPEC-VÁLTOZÁS 2026-11-22 (docs/specs/2026-11-22-szoletra-szintezes.md 4.2): a kérdés fokozatát már az évfolyam-sávos
 * `createLadderStepSession` (`wordLadderGrading.ts`) adja — az 1. pálya az évfolyam alapszintje, a 10. pálya legfeljebb
 * egy szinttel feljebb (régen: a 10. pálya minden évfolyamon a legfelső szint). A `createLadderLevelSession` sáv-alapú
 * régi futás-sávja exportált marad (a közös sáv-szabály tesztje használja), a lap már nem.
 */
import type { WordLadderLanguage } from "@/data/wordLadder/types";
import { nextDifficulty } from "@/game-engine/difficulty";
import { GRADE_LEVEL_COUNT, clampToLevel, levelBand } from "@/game-engine/gradeLevels";
import { ladderStartStep } from "@/lib/wordLadderGrading";
import { LADDER_RUNGS, LADDER_ZONES, zoneForRung, type LadderZone } from "@/lib/wordLadderLogic";

export const LADDER_MIN_RUNGS = 8;
export const LADDER_MAX_RUNGS = 20;

const safeLevel = (level: number) =>
  Number.isFinite(level) ? Math.min(GRADE_LEVEL_COUNT, Math.max(1, Math.round(level))) : 1;

/** A létra hossza (fok): 1. pálya 8, 10. pálya 20, lineárisan. */
export function ladderRungsForLevel(level: number): number {
  const l = safeLevel(level);
  return Math.round(LADDER_MIN_RUNGS + ((LADDER_MAX_RUNGS - LADDER_MIN_RUNGS) * (l - 1)) / (GRADE_LEVEL_COUNT - 1));
}

/** A pálya belépő kérdés-szintje az évfolyamon (a menü felirata és a teszt): a belépő fokozat szintje. */
export function ladderTierForLevel(grade: number, level: number): number {
  return Math.floor(ladderStartStep(grade, level) / 3);
}

/** Haladás-kulcs nyelvenként (`loadUnlockedLevel` / `unlockNextLevel`). */
export function wordLadderGameId(lang: WordLadderLanguage): string {
  return `wordladder-${lang}`;
}

/** A futás sávja: a pálya sávjából indul, a közös szabály mozgatja, a pálya ±0,15-én belül marad. */
export function createLadderLevelSession(level: number) {
  let current = safeLevel(level);
  let band = levelBand(current);
  let history: boolean[] = [];
  return {
    get band() {
      return band;
    },
    answer(correct: boolean) {
      history = [...history.slice(-2), correct];
      band = clampToLevel(nextDifficulty({ current: band, recentCorrect: history }), current);
      return band;
    },
    reset(nextLevel: number) {
      current = safeLevel(nextLevel);
      band = levelBand(current);
      history = [];
    },
  };
}

/** A táj a haladás aránya szerint (a 16 fokos alapbeosztásra vetítve), a létra hosszától függetlenül. */
export function zoneForProgress(rung: number, total: number): LadderZone {
  const t = Math.max(1, total);
  if (rung >= t) return LADDER_ZONES[LADDER_ZONES.length - 1]!;
  return zoneForRung(Math.round((Math.max(0, rung) * LADDER_RUNGS) / t));
}

/** Mérföldkő-felirat felfelé lépéskor, ha új tájba ért; különben null. */
export function milestoneForProgress(prevRung: number, nextRung: number, total: number): string | null {
  if (nextRung <= prevRung) return null;
  const before = zoneForProgress(prevRung, total);
  const after = zoneForProgress(nextRung, total);
  return after.id !== before.id ? after.milestone : null;
}
