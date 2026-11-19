import { lessonSchema, type Lesson } from "../../shared/lesson-schema";
import { dropUndrawableSourceVisuals, type DroppedSourceVisual } from "../../shared/lesson-visual-params";

/**
 * A kirajzolhatatlan (hibás paraméterű) forrás-ábra blokkok kezelése a MODELL jelöltjén — közös a szerzői állomással, a
 * fogalomjavítással és a leckejavítással (spec 2026-11-18-tananyag-gyartas-minoseg; #515 review). A séma az ilyen blokkot elfogadja
 * (`params: z.record`), a megosztott `sourceVisualProblems` viszont kirajzolhatatlannak ítéli, és a lejátszó teljesen elrejti — ezért
 * a jelölt elfogadása ELŐTT determinisztikusan ki kell venni. A funkciókapcsoló KI állapotában új fajtájú blokk a sémán sem jut át,
 * így itt nincs mit kivenni (a lecke ugyanaz az objektum marad).
 */

/** A kivett ábrablokkok oka a modellnek szóló javító üzenet soraként — a blokk helye, fajtája és a paraméterhiba. */
export function undrawableDropNotes(dropped: ReadonlyArray<DroppedSourceVisual>): string[] {
  return dropped.map((d) => `A program KIVETTE a(z) ${d.path} ábrablokkot (animKind: ${d.animKind}), mert a paraméterei hibásak: ${d.problems.join("; ").slice(0, 300)} — az alábbi hibák ennek a következményei lehetnek. Javítsd a blokk paramétereit, vagy tanítsd ugyanezt másik blokkal.`);
}

export type DrawableCandidate = { lesson: Lesson; dropped: DroppedSourceVisual[]; notes: string[] };

/**
 * A jelölt a kirajzolhatatlan ábrablokkok NÉLKÜL — tételenként naplózva, a darabszám a visszatérésben. Ha a kiesés miatt a jelölt
 * érvénytelenné válik (pl. kiürülő fejezet), kivételt dob a kiesés okával és a sémahibával: a hívó a MEGLÉVŐ hibaútján utasítja el
 * a jelöltet (új modellhívás ezen túl nem indul). `notes`: a hívó a későbbi ellenőrzései hibája elé fűzi (`withDropReason`).
 */
export function drawableCandidate(lesson: Lesson, log?: (line: string) => void, label = "Javítás"): DrawableCandidate {
  const { lesson: kept, dropped } = dropUndrawableSourceVisuals(lesson);
  if (!dropped.length) return { lesson, dropped, notes: [] };
  for (const d of dropped) log?.(`[STUDIO] ${label}: kirajzolhatatlan ábrablokk kivéve a jelöltből: ${d.path} (${d.animKind}) — ${d.problems.join("; ").slice(0, 300)}`);
  log?.(`[STUDIO] ${label}: ${dropped.length} kirajzolhatatlan ábrablokk kimaradt a jelöltből.`);
  const notes = undrawableDropNotes(dropped);
  const valid = lessonSchema.safeParse(kept);
  if (!valid.success) throw new Error(`${notes.join(" ")} A kiesés után a jelölt érvénytelen: ${valid.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return { lesson: valid.data, dropped, notes };
}

/** A hibaüzenet a kiesés okával kiegészítve (ha volt kiesés) — a modell lássa, hogy a hiba a kivett blokk következménye lehet. */
export function withDropReason(notes: ReadonlyArray<string>, message: string): string {
  return notes.length ? `${notes.join(" ")} ${message}` : message;
}
