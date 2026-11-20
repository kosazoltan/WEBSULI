/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (5. szakasz 1. pont): a tananyag-változatosság kapcsolója — `on` = BE, bármi más
 * és a hiány = KI (alapérték). A környezetet KIZÁRÓLAG ez a függvény olvassa; élesben a bekapcsolás tulajdonosi döntés a lánc végén.
 */
export function lessonVarietyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.STUDIO_LESSON_VARIETY ?? "").trim().toLowerCase() === "on";
}
