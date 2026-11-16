/**
 * J0c-b — a gyerek olvasási idejének becslése (kanban #46). Tiszta, függőség nélküli modul: a `promptFit` és a
 * `questionDirector` is használja (körkörös import nélkül).
 *
 * Feltételezés (forrás nélkül, a kanban #46 kérése szerint): 3–4. évf. 90 szó/perc (az alsós 80–120 közepe), 5–6. 120,
 * 7–8. 150, 9–12. 180; évfolyam nélkül 120. A válaszopciók szavai fél súllyal számítanak (átfutja, nem olvassa végig),
 * a végigolvasás után 1,5 mp a döntés.
 */

/** A válaszablak felső határa (terv J10) — ugyanaz, mint a `questionDirector` `WINDOW_MAX_MS`-e. */
export const READING_WINDOW_CAP_MS = 9000;
export const DECIDE_MS = 1500;

export function wordsOf(text: string): number {
  return typeof text === "string" ? text.trim().split(/\s+/u).filter(Boolean).length : 0;
}

export function readingWpm(grade: number | null | undefined): number {
  if (grade === null || grade === undefined) return 120;
  if (grade <= 4) return 90;
  if (grade <= 6) return 120;
  if (grade <= 8) return 150;
  return 180;
}

/** Végigolvasás + döntés becsült ideje ms-ban. */
export function readingMsFor(prompt: string, options: readonly string[] = [], grade: number | null = null): number {
  const words = wordsOf(prompt) + 0.5 * options.reduce((n, o) => n + wordsOf(o), 0);
  return Math.round((words / readingWpm(grade)) * 60_000 + DECIDE_MS);
}
