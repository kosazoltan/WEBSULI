/**
 * Pálya-hangolás a játékoknak — tiszta modul (spec 2026-09-29-palyak-szoletra-nyelvek, 3. döntés; E szelet,
 * végrehajtás: docs/specs/2026-09-29-jatekok-10-palya-vegrehajtas.md).
 *
 * A közös `gradeLevels.ts`-re épül, azt nem módosítja. Itt az van, amit a hat játék ugyanúgy csinál a pályával.
 */
import { GRADE_LEVEL_COUNT, clampToLevel, levelBand } from "./gradeLevels";

/** A pályák a közös évfolyam-bank tartományában élnek (3–12.). */
export const LEVEL_MIN_GRADE = 3;
export const LEVEL_MAX_GRADE = 12;

/** Van-e pálya ennél az évfolyamnál. Évfolyam nélkül, 1–2. évfolyamon és érvénytelen értéknél nincs (D1). */
export function levelsActiveForGrade(grade: number | null | undefined): grade is number {
  return typeof grade === "number" && Number.isInteger(grade) && grade >= LEVEL_MIN_GRADE && grade <= LEVEL_MAX_GRADE;
}

/** A futás kezdő sávja: pályán a pálya sávja, pálya nélkül a játék eddigi kezdősávja. */
export function levelStartBand(level: number | null, fallback: number): number {
  return level == null ? fallback : levelBand(level);
}

/** A futás közbeni adaptív sáv: pályán a pálya sávja körül marad, pálya nélkül változatlan. */
export function levelAdaptBand(band: number, level: number | null): number {
  return level == null ? band : clampToLevel(band, level);
}

/** Melyik pályát ajánlja a menü egy teljesítés után: a következőt, ha nyitva van (D2). */
export function nextSuggestedLevel(completed: number, unlocked: number): number {
  return Math.max(1, Math.min(unlocked, GRADE_LEVEL_COUNT, Math.round(completed) + 1));
}

/** Egy feladat „mérete”: a benne szereplő számjegyek száma. Nagyobb szám → több fejben tartott jegy. */
export function digitComplexity(prompt: string): number {
  return (prompt.match(/\d/g) ?? []).length;
}

/**
 * A jelöltek közül a sávhoz illőt választja: a komplexitás szerint rendezve alacsony sávon a legegyszerűbbet, magas
 * sávon a legösszetettebbet (D7). Stabil rendezés, üres listára nem hívható.
 */
export function pickByBand<T>(candidates: readonly T[], band: number, complexity: (c: T) => number): T {
  const sorted = candidates
    .map((c, i) => ({ c, i, k: complexity(c) }))
    .sort((a, b) => a.k - b.k || a.i - b.i);
  const b = Number.isFinite(band) ? Math.min(1, Math.max(0, band)) : 0;
  return sorted[Math.min(sorted.length - 1, Math.round(b * (sorted.length - 1)))]!.c;
}
