import { AsyncLocalStorage } from "node:async_hooks";
import { storedVarietyMarker } from "../../shared/lesson-feedback-openers";
import { openingFormById } from "../../shared/lesson-opener";

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

/**
 * Review #534 (Codex, Copilot): a futásban a szerzőnek TÉNYLEG kiosztott nyitásforma — a kiosztó állítja be (gyártás: a szerzői prompt
 * építésekor; javítás: ha a tárolt lecke formát hordoz), a lektor ebből kapja a konkrét elvárást. Régi checkpointból átvett tanításnál
 * (a szerző kimarad) nincs beállítva: ilyenkor sem a lektor, sem a mentett jelölő nem állít kiosztást.
 */
type RunOpeningForm = { id: string; description: string };
const formScope = new AsyncLocalStorage<{ form?: RunOpeningForm }>();
export function setRunOpeningForm(form: RunOpeningForm | undefined): void {
  const holder = formScope.getStore();
  if (holder) holder.form = form;
}
export function runOpeningForm(): RunOpeningForm | undefined {
  return formScope.getStore()?.form;
}

/** Javítás / fogalomjavítás: a futás kiosztott formája a TÁROLT (jelölőt hordozó) lecke formája; forma nélküli jelölőnél nincs kiosztás. */
export function adoptStoredOpeningForm(stored: unknown): void {
  const id = storedVarietyMarker(stored)?.openingForm;
  setRunOpeningForm(id ? openingFormById(id) : undefined);
}

/** A mentés forrása: futáson belül a kiosztott forma azonosítója vagy `null` (nem volt kiosztás); futáson kívül `undefined` (régi út). */
export function runOpeningFormId(): string | null | undefined {
  const holder = formScope.getStore();
  return holder ? holder.form?.id ?? null : undefined;
}

export function runWithLessonVariety<T>(on: boolean, fn: () => T): T {
  return runScope.run(on, () => formScope.run({}, fn));
}

/**
 * A gyártási futás állapota: folytatásnál KIZÁRÓLAG a mentett job-állapot (`lessonVariety: true`; a mező nélküli régi checkpoint KI —
 * a megkezdett futás a régi szerződéssel fejeződik be), új futásnál a befecskendezett érték, különben a környezet.
 */
export function lessonVarietyForRun(input: { resume?: { output?: Record<string, unknown> | null } }, injected: boolean | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (input.resume) return input.resume.output?.lessonVariety === true;
  return injected ?? lessonVarietyEnabled(env);
}
