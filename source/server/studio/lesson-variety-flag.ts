import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (5. szakasz 1. pont): a tananyag-változatosság kapcsolója — `on` = BE, bármi más
 * és a hiány = KI (alapérték). A környezetet KIZÁRÓLAG ez a függvény olvassa; élesben a bekapcsolás tulajdonosi döntés a lánc végén.
 */
export function lessonVarietyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.STUDIO_LESSON_VARIETY ?? "").trim().toLowerCase() === "on";
}

/**
 * S5a vak kör 1 (L1, L4 — „kapcsoló-szivárgás”): egy gyártási vagy javítási futás változatossági állapota EGYSZER, az elején dől el, és
 * a futás minden olvasója (szerzői prompt, bank, mentés) ugyanezt látja — a környezet menet közbeni változása nem hat rá.
 */
const runScope = new AsyncLocalStorage<boolean>();

/** A futás rögzített állapota a hatókörön belül; hatókörön kívül (nem futásból hívott kód) a környezet. */
export function effectiveLessonVariety(): boolean {
  return runScope.getStore() ?? lessonVarietyEnabled();
}

export function runWithLessonVariety<T>(on: boolean, fn: () => T): T {
  return runScope.run(on, fn);
}

/**
 * A gyártási futás állapota: folytatásnál KIZÁRÓLAG a mentett job-állapot (`lessonVariety: true`; a mező nélküli régi checkpoint KI —
 * a megkezdett futás a régi szerződéssel fejeződik be), új futásnál a befecskendezett érték, különben a környezet.
 */
export function lessonVarietyForRun(input: { resume?: { output?: Record<string, unknown> | null } }, injected: boolean | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (input.resume) return input.resume.output?.lessonVariety === true;
  return injected ?? lessonVarietyEnabled(env);
}
