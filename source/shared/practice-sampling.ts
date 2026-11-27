/**
 * TG-P6 (docs/specs/2026-11-27-tananyag-gyakorlati-p6-vegrehajtas.md): kiegyensúlyozott tanulói kör.
 * RED: a régi viselkedés (sima véletlen minta, besorolás nélkül).
 */
import { sampleIds } from "./lesson-experience-score";

export const isApplyQuiz = (_q: { question?: string; prompt?: string; options?: readonly string[] }): boolean => false;

export function sampleQuizIds<T extends { id: string }>(bank: readonly T[], count: number, random = Math.random): string[] {
  return sampleIds(bank, count, random);
}
