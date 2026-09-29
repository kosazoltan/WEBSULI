import { singleChoiceProblems } from "../shared/single-choice-check";

/** A játék-kvízgenerátor tételének alakja (a `gameQuizGeneratorService.ts` újraexportálja). */
export type GeneratedQuizItem = {
  prompt: string;
  options: string[];
  correctIndex: number;
  topic: "english" | "math" | "nature" | "hungarian";
  /**
   * T-1: a MIÉRT, amit a játék rossz válasznál megmutat.
   *
   * Enélkül a játék csak büntetett (élet, idő, XP), és a téves fogalom
   * érintetlenül maradt a gyerekben — ez a legdrágább hiba egy tanuló-
   * programban.
   */
  explanation: string;
};

const ALLOWED_TOPICS = new Set(["english", "math", "nature", "hungarian"]);

/**
 * A modell által generált tételek validálása (kiemelve a DB-t importáló szolgáltatásból, hogy tesztelhető legyen).
 * Spec 2026-09-29 (egy-helyes-valasz): a bizonyíthatóan nem pontosan-egy helyes opciós tétel is eldobódik.
 */
export function validateGeneratedQuizItems(raws: unknown[]): { valid: GeneratedQuizItem[]; skipped: number } {
  const valid: GeneratedQuizItem[] = [];
  let skipped = 0;
  for (const raw of raws) {
    if (!raw || typeof raw !== "object") {
      skipped++;
      continue;
    }
    const item = raw as Partial<GeneratedQuizItem>;
    if (
      typeof item.prompt !== "string" ||
      item.prompt.length < 3 ||
      item.prompt.length > 200 ||
      !Array.isArray(item.options) ||
      item.options.length !== 4 ||
      !item.options.every((o): o is string => typeof o === "string" && o.length > 0 && o.length < 60) ||
      typeof item.correctIndex !== "number" ||
      !Number.isInteger(item.correctIndex) ||
      item.correctIndex < 0 ||
      item.correctIndex > 3 ||
      // T-1: magyarázat nélküli tétel nem kerül a bankba — a néma büntetés
      // pont az, amit meg akarunk szüntetni.
      typeof item.explanation !== "string" ||
      item.explanation.trim().length < 5 ||
      item.explanation.length > 300 ||
      typeof item.topic !== "string" ||
      !ALLOWED_TOPICS.has(item.topic) ||
      singleChoiceProblems({ prompt: item.prompt, options: item.options, correctIndex: item.correctIndex }).length > 0
    ) {
      skipped++;
      continue;
    }
    valid.push(item as GeneratedQuizItem);
  }
  return { valid, skipped };
}
