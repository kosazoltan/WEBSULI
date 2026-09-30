import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Spec 2026-09-24 (lektor-tanítás a felvételi feladatlap öt élő futásából): VAK MEGOLDÓ.
 *
 * Mérés: a lektor (grok-4.6) a lecke hibás 7×11×5 = 385-ös tanítását öt futásban sem jelezte — a lecke
 * részeredményéhez igazodott. Vakon, a lecke nélkül ugyanez a modell helyesen 6, 7, 11-et adott; az Opus 5.5
 * a teljes forrásszövegből 33 feladatrészből 26-ot oldott meg, mind helyesen, a maradék 7-nél (szétesett
 * PDF-táblázat, törtek) kitalálás helyett „NINCS ELÉG ADAT”-ot írt. Ezért a forrás feladatait a lektor ELŐTT
 * egy külön hívás oldja meg a lecke ismerete nélkül; a lektor ezt független bizonyítékként kapja.
 */

export const BLIND_SOLVER_MODEL = "claude-opus-5-5";
export const NOT_ENOUGH = "NINCS ELÉG ADAT";

export const BLIND_SOLVER_SYSTEM = [
  "Te független megoldó vagy: egy iskolai forrás (feladatlap, tankönyvi oldal) feladatait oldod meg, a hozzá készült tananyag ismerete nélkül.",
  "Oldd meg a forrás összes feladatát, minden részfeladatot külön. Csak a forrás szövegét használd; a PDF-átiratban a törtek szétesve állhatnak (pl. „2 / 5”), a táblázat sorai összecsúszhatnak.",
  "Szöveges és térbeli feladatnál kövesd végig, ki mit hová tesz, mi a közös rész; minden adatot használj fel.",
  `Ha egy adat hiányzik vagy olvashatatlan, az answer pontosan: „${NOT_ENOUGH}” — soha ne találj ki értéket.`,
  "Ha a forrásban nincs megoldandó feladat (csak tananyag), üres listát adj.",
  'Kizárólag JSON: { "solutions": [{ "task": "feladat és részfeladat rövid neve", "answer": "végeredmény mértékegységgel" }] }',
].join("\n");

export type BlindSolution = { task: string; answer: string };
/** U5 (C6/H15): a „NINCS ELÉG ADAT” tételek megőrizve (a lektor lássa, mit nem lehetett megoldani); `partial` = elemenkénti sémahiba volt. */
export type BlindSolutions = { sourceHash: string; model: string; solutions: BlindSolution[]; notEnough?: string[]; partial?: boolean };

export const sourceHashOf = (sourceText: string) => createHash("sha256").update(sourceText).digest("hex");

/** A modell válaszából a megoldott tételek (a „NINCS ELÉG ADAT” válaszok kimaradnak). */
export function parseBlindSolutions(json: unknown): BlindSolution[] {
  return parseBlindSolverAnswer(json).solutions;
}

const solutionItemSchema = z.object({ task: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(400) });
/**
 * U5 (C6/H15): elemenkénti feldolgozás — egy hibás alakú elem KIMARAD (`partial: true`), nem az egész lista vész el és
 * gyorsítótárazódik üresen; a „NINCS ELÉG ADAT” tétel a `notEnough` listában marad (a lektor tudja, hogy a vak megoldó
 * ott nem talált adatot — nem hallgatás).
 */
export function parseBlindSolverAnswer(json: unknown): { solutions: BlindSolution[]; notEnough: string[]; partial: boolean } {
  const raw = (json as { solutions?: unknown } | null)?.solutions;
  if (!Array.isArray(raw)) return { solutions: [], notEnough: [], partial: true };
  const solutions: BlindSolution[] = [], notEnough: string[] = [];
  let partial = false;
  for (const item of raw.slice(0, 80)) {
    const parsed = solutionItemSchema.safeParse(item);
    if (!parsed.success) { partial = true; continue; }
    if (parsed.data.answer.toLocaleUpperCase("hu").includes(NOT_ENOUGH)) notEnough.push(parsed.data.task);
    else solutions.push(parsed.data);
  }
  if (raw.length > 80) partial = true;
  return { solutions, notEnough, partial };
}

/** A lektor promptjának bizonyíték-blokkja; üres, ha nincs vak megoldás. */
export function blindSolutionsPromptBlock(blind: BlindSolutions | undefined): string[] {
  if (!blind?.solutions.length && !blind?.notEnough?.length) return [];
  if (!blind.solutions.length) return [
    `FÜGGETLEN VAK MEGOLDÓ: egyetlen forrásfeladatot sem tudott megoldani — „${NOT_ENOUGH}”: ${blind.notEnough!.join("; ").slice(0, 600)}. Ezeknél a lecke megoldását a forrásból magad ellenőrizd, ne találgass.`,
  ];
  return [
    "FÜGGETLEN VAK MEGOLDÁSOK (egy másik modell a forrásból oldotta meg, a lecke ismerete NÉLKÜL; a bizonytalan tételek kimaradtak):",
    JSON.stringify(blind.solutions),
    ...(blind.notEnough?.length ? [`A vak megoldó „${NOT_ENOUGH}”-nak jelölte (nem hallgatás — ott nincs független kulcs, a forrásból magad ellenőrizd): ${blind.notEnough.join("; ").slice(0, 600)}`] : []),
    ...(blind.partial ? ["A vak megoldás listája RÉSZLEGES (egyes elemek hibás alakúak voltak): a hiányzó tételre nincs független bizonyíték."] : []),
    "Vesd össze a lecke kidolgozott példáinak és bankjának végeredményeivel. Eltérésnél számold újra a forrásból, a lecke megoldásától függetlenül. Ha a vak megoldás a helyes, az blokkoló (contradicts_source) a TANÍTÁS blockPath-jával; a Javítás iránya a helyes érték. Ha a vak megoldás téved, nem jelzed.",
  ];
}
