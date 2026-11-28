/**
 * A-5 (#153): elsős felolvasás az adventi kérdésnézetben. Az 1. évfolyamos gyerek még nem olvas folyékonyan, ezért a kérdés mellett
 * egy felolvasó gomb a kérdést ÉS a négy választ is felolvassa (a meglévő magyar felolvasóval, `client/src/lib/tts.ts`). Hang nélküli
 * eszközön és csökkentett mozgás beállításnál a gomb nem jelenik meg (az LS-4 felolvasási kapu szabálya).
 */
export const ADVENT_READ_ALOUD_GRADE = 1;

export function adventReadAloudVisible(grade: number | null, gate: { supported: boolean; reducedMotion: boolean }): boolean {
  return grade === ADVENT_READ_ALOUD_GRADE && gate.supported && !gate.reducedMotion;
}

/** A felolvasandó szöveg: a kérdés, majd a válaszok sorszámmal (a gombok sorrendjében). */
export function adventReadAloudText(question: { prompt: string; options: readonly string[] }): string {
  const prompt = question.prompt.trim();
  const options = question.options.map((o, i) => `${i + 1}. ${o.trim().replace(/[.!?]+$/, "")}.`).join(" ");
  return options ? `${prompt} A válaszok: ${options}` : prompt;
}
