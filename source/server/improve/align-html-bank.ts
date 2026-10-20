import { htmlLessonDataSchema, readRawHtmlLessonData, writeHtmlLessonData } from "../../shared/lesson-html-data";
import { alignTaskToSample } from "../studio/bank-normalize";
import { LESSON_BANK_SIZES, openTaskSchema, type LessonExperience } from "../../shared/lesson-experience";
import { evaluateOpenAnswer } from "../../shared/lesson-experience-score";

type Task = LessonExperience["tasks"][number];
type Unit = { sectionIndex: number; conceptIds: string[] };
type Item = { id?: unknown; sectionIndex?: unknown; coversConceptIds?: unknown; mode?: unknown };
type RawExperience = { tasks?: unknown; quiz?: unknown; methods?: unknown; bankPlan?: { units?: unknown } };

export type HtmlBankRepair = { html: string; aligned: string[]; narrowed: string[]; modeFlipped: string[]; dropped: string[] };

/**
 * Spec 2026-10-19-okositas-bank-igazitas + 2026-10-20-okositas-r2-bankjavitas: a HTML-okosítás JSON-bankjának determinisztikus javítása
 * a záró kapu ELŐTT (előbb a gépi javítás, csak a maradék hiba megy a modellhez). Mért: 30 nap alatt 4 okosításból 1 sikerült; a
 * bukások (1e169ace, a0d16870, f2c2f102) mintaválasz-, csomaghatár- és szóbeli/írásos hibák voltak. A pontozó és a küszöbök
 * változatlanok; a HTML a JSON-bankon kívül bájtra azonos marad, olvashatatlan banknál semmi nem változik (a kapu jelenti).
 * Lépések: (1) rubrika a mintához; (2) több csomagba nyúló tétel → az első fogalom csomagja; (3) egymódú csomag → egy feladat
 * módváltása; (4) a mintájára sem teljes pontos feladat elhagyása, ha a bank sémája nem kap új hibát (padló-próba).
 */
export function alignHtmlLessonBank(html: string): HtmlBankRepair {
  const none: HtmlBankRepair = { html, aligned: [], narrowed: [], modeFlipped: [], dropped: [] };
  let data: unknown;
  try { data = readRawHtmlLessonData(html); } catch { return none; }
  const experience = (data as { experience?: RawExperience } | null)?.experience;
  if (!experience || !Array.isArray(experience.tasks)) return none;
  const tasks = experience.tasks as unknown[];
  const result: HtmlBankRepair = { ...none };

  // (1) Rubrika-igazítás — review #327: csak sémahelyes feladat; a pontozó kivétele nem kerülheti meg a sémakaput.
  for (const raw of tasks) {
    if (!openTaskSchema.safeParse(raw).success) continue;
    const t = raw as Task;
    const before = JSON.stringify(t);
    try { alignTaskToSample(t); } catch { Object.assign(t, JSON.parse(before)); continue; }
    if (JSON.stringify(t) !== before) result.aligned.push(String(t.id ?? "?"));
  }

  const units: Unit[] = Array.isArray(experience.bankPlan?.units)
    ? (experience.bankPlan!.units as unknown[]).filter((u): u is Unit => !!u && typeof (u as Unit).sectionIndex === "number" && Array.isArray((u as Unit).conceptIds))
    : [];
  const ids = (item: Item): string[] | null => (Array.isArray(item.coversConceptIds) && item.coversConceptIds.every((c) => typeof c === "string") ? item.coversConceptIds as string[] : null);

  // (2) Csomaghatár: a fejezet egyik csomagjába sem férő módszer / feladat az első fogalom csomagjára szűkül. Review #332: a kvízt NEM
  // szűkítjük — a kérdés szövege több fogalmat kérdezhet, a hamis címke a tanulói kiértékelést torzítaná (a kapu jelenti, újrapróba).
  for (const bank of ["methods", "tasks"] as const) {
    const items = experience[bank];
    if (!Array.isArray(items)) continue;
    for (const raw of items as Item[]) {
      const covers = raw && typeof raw.sectionIndex === "number" ? ids(raw) : null;
      if (!covers?.length) continue;
      const sectionUnits = units.filter((u) => u.sectionIndex === raw.sectionIndex);
      if (sectionUnits.some((u) => covers.every((c) => u.conceptIds.includes(c)))) continue;
      const home = sectionUnits.find((u) => u.conceptIds.includes(covers[0]));
      if (!home) continue;
      const narrowed = covers.filter((c) => home.conceptIds.includes(c));
      raw.coversConceptIds = narrowed;
      result.narrowed.push(String(raw.id ?? "?"));
    }
  }

  // (3) Szóbeli/írásos egyensúly csomagonként (≥ 2 feladat, egyféle mód). Review #332: a váltásra a csomag UTOLSÓ, saját mintáján teljes
  // pontos feladata kerül (a hibás mintájú később elhagyható), és szóbeliből írásosra csak úgy, hogy a globális szóbeli minimum (5) marad.
  const fullSample = (raw: unknown) => {
    if (!openTaskSchema.safeParse(raw).success) return false;
    try { return evaluateOpenAnswer((raw as Task).sample, raw as Task).score === 1; } catch { return false; }
  };
  const oralCount = () => (tasks as Item[]).filter((t) => t?.mode === "oral").length;
  const unitTasks = (unit: Unit, list: unknown[]) => (list as Item[]).filter((t) => t && t.sectionIndex === unit.sectionIndex && (ids(t) ?? []).length > 0 && ids(t)!.every((c) => unit.conceptIds.includes(c)));
  for (const unit of units) {
    const own = unitTasks(unit, tasks);
    if (own.length < 2) continue;
    const modes = new Set(own.map((t) => t.mode));
    if (modes.size !== 1) continue;
    const only = [...modes][0];
    if (only !== "oral" && only !== "written") continue;
    if (only === "oral" && oralCount() - 1 < 5) continue;
    const pick = [...own].reverse().find((t) => fullSample(t));
    if (!pick) continue;
    pick.mode = only === "oral" ? "written" : "oral";
    result.modeFlipped.push(String(pick.id ?? "?"));
  }

  // (4) Padló-próbás elhagyás: a mintájára sem teljes pontos feladat kikerül, ha a bank sémája nem kap tőle ÚJ hibát.
  // Üzenetenkénti DARABSZÁM (útvonal nélkül): a csomagot meg nem nevező üzenet („A nyílt bank mérete … hiányos”) egy már hibás
  // másik csomag mellett is újnak számít, ha a kivétel még egy csomagot a padló alá visz.
  const issues = () => {
    const parsed = htmlLessonDataSchema.safeParse(data);
    const counts = new Map<string, number>();
    for (const issue of parsed.success ? [] : parsed.error.issues) counts.set(issue.message, (counts.get(issue.message) ?? 0) + 1);
    return counts;
  };
  const canDropTask = (index: number): boolean => {
    const task = tasks[index] as Item;
    const rest = tasks.filter((_, j) => j !== index);
    if (rest.length < LESSON_BANK_SIZES.tasks) return false;
    if (task.mode === "oral" && (rest as Item[]).filter((t) => t?.mode === "oral").length < 5) return false;
    for (const unit of units) {
      const before = unitTasks(unit, tasks);
      if (!before.includes(task)) continue;
      const after = unitTasks(unit, rest);
      if (after.length < Math.max(2, unit.conceptIds.length)) return false;
      for (const mode of ["oral", "written"]) if (before.some((t) => t.mode === mode) && !after.some((t) => t.mode === mode)) return false;
      for (const c of unit.conceptIds) if (before.some((t) => ids(t)!.includes(c)) && !after.some((t) => ids(t)!.includes(c))) return false;
    }
    return true;
  };
  for (let i = tasks.length - 1; i >= 0; i--) {
    const raw = tasks[i];
    if (!openTaskSchema.safeParse(raw).success) continue;
    let full: boolean;
    try { full = evaluateOpenAnswer((raw as Task).sample, raw as Task).score === 1; } catch { full = false; }
    if (full) continue;
    // Review #332: a kivétel kifejezett minimumokat sem sérthet (az összevont sémaüzenet egy meglévő hiánnyal elfedné az újat).
    if (!canDropTask(i)) continue;
    const before = issues();
    tasks.splice(i, 1);
    const after = issues();
    // Az indexek eltolódnak a kivétel után — az útvonal nélküli üzenetek darabszáma dönt (egyik sem nőhet).
    if ([...after].some(([message, n]) => n > (before.get(message) ?? 0))) { tasks.splice(i, 0, raw); continue; }
    result.dropped.push(String((raw as Task).id ?? "?"));
  }

  const changed = result.aligned.length + result.narrowed.length + result.modeFlipped.length + result.dropped.length > 0;
  if (!changed) return none;
  try { return { ...result, html: writeHtmlLessonData(html, data) }; } catch { return none; }
}
