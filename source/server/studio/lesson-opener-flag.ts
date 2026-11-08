/** Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): a Célkártya / mini mese / IQ-kérdezés kapcsolója. Alapból KI. */
export function lessonOpenerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.STUDIO_LESSON_OPENER ?? "").trim().toLowerCase() === "on";
}
