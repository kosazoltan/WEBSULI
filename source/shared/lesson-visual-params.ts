import { z } from "zod";

/**
 * Spec 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md): a magyarázó ábrák paraméterei.
 *
 * A lecke-séma az egyszerű ábrafajtáknál bármilyen `params`-ot elfogad (régi leckék, üres minta a
 * sématesztben); a TARTALMI érvényességet ez a modul méri. A rajzoló csak érvényes paraméterből
 * rajzol — kitalált alapértéket („1. lépés”, egyetlen kör) nem mutat —, a szerver kapuja ugyanezzel
 * a függvénnyel ellenőriz.
 */

const label = (max = 60) => z.string().trim().min(1).max(max);
const value = z.union([z.number().finite(), label(24)]);

export const cycleParamsSchema = z.object({
  center: label(40).optional(),
  phases: z.array(z.object({
    label: label(40),
    note: label(160).optional(),
    /** Holdfázis: a megvilágított rész aránya (0 = újhold, 1 = telihold). */
    moon: z.number().min(0).max(1).optional(),
    /** Növő (jobb oldalt világos) vagy fogyó hold. */
    waxing: z.boolean().optional(),
  })).min(3).max(12),
});

export const labeledShapeParamsSchema = z.object({
  shape: z.enum(["rectangle", "square", "triangle", "circle", "cuboid"]),
  /** Oldal-/élcímkék: szám (arányos rajz) vagy felirat („7 egység”). */
  width: value.optional(),
  height: value.optional(),
  depth: value.optional(),
  radius: value.optional(),
  unit: label(12).optional(),
  vertices: z.array(label(4)).max(8).optional(),
  /** Téglatestnél a vízszintes rétegek száma (kiskockás feladatok). */
  layers: z.number().int().min(2).max(12).optional(),
  note: label(120).optional(),
}).superRefine((p, ctx) => {
  const need = p.shape === "circle" ? ["radius"] : p.shape === "cuboid" ? ["width", "height", "depth"] : p.shape === "square" ? ["width"] : ["width", "height"];
  for (const key of need) if (p[key as keyof typeof p] === undefined) ctx.addIssue({ code: "custom", path: [key], message: `${p.shape}: hiányzó ${key}` });
});

export const barChartParamsSchema = z.object({
  bars: z.array(z.object({ label: label(30), value: z.number().finite().min(0) })).min(2).max(10),
  unit: label(12).optional(),
  /** Átlagvonal: true = a program számolja, szám = megadott érték. */
  average: z.union([z.boolean(), z.number().finite()]).optional(),
});

const region = z.union([z.number().int().min(0), label(20)]);
export const vennParamsSchema = z.object({
  sets: z.array(label(30)).min(2).max(3),
  /** Tartomány-feliratok: A, B, C, AB, AC, BC, ABC, none (egyik sem). */
  regions: z.record(z.enum(["A", "B", "C", "AB", "AC", "BC", "ABC", "none"]), region).optional(),
  universe: label(40).optional(),
});

export const numberLineParamsSchema = z.object({
  from: z.number().finite(),
  to: z.number().finite(),
  step: z.number().positive().finite().optional(),
  highlightTo: z.number().finite().optional(),
  marks: z.array(z.object({ value: z.number().finite(), label: label(20).optional() })).max(12).optional(),
  jumps: z.array(z.object({ from: z.number().finite(), to: z.number().finite(), label: label(16).optional() })).max(10).optional(),
}).refine((p) => p.to > p.from, { message: "to > from" })
  .refine((p) => !p.step || (p.to - p.from) / p.step <= 40, { message: "legfeljebb 40 osztás" });

export const processParamsSchema = z.object({ steps: z.array(label(160)).min(2).max(8) });
export const timelineParamsSchema = z.object({ events: z.array(label(80)).min(2).max(10) });

export const VISUAL_PARAM_SCHEMAS = {
  cycle: cycleParamsSchema,
  labeledShape: labeledShapeParamsSchema,
  barChart: barChartParamsSchema,
  venn: vennParamsSchema,
  numberLine: numberLineParamsSchema,
  process: processParamsSchema,
  timeline: timelineParamsSchema,
} as const;

export type VisualParamKind = keyof typeof VISUAL_PARAM_SCHEMAS;
export type CycleParams = z.infer<typeof cycleParamsSchema>;
export type LabeledShapeParams = z.infer<typeof labeledShapeParamsSchema>;
export type BarChartParams = z.infer<typeof barChartParamsSchema>;
export type VennParams = z.infer<typeof vennParamsSchema>;
export type NumberLineParams = z.infer<typeof numberLineParamsSchema>;

/** Validated params, or the reasons they cannot be drawn. Kinds without a schema pass through. */
export function visualParamProblems(kind: string, params: unknown): string[] {
  const schema = (VISUAL_PARAM_SCHEMAS as Record<string, z.ZodTypeAny>)[kind];
  if (!schema) return [];
  const parsed = schema.safeParse(params);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${kind}.${i.path.join(".") || "params"}: ${i.message}`);
}

export function parseVisualParams<K extends VisualParamKind>(kind: K, params: unknown): z.infer<(typeof VISUAL_PARAM_SCHEMAS)[K]> | null {
  const parsed = VISUAL_PARAM_SCHEMAS[kind].safeParse(params);
  return parsed.success ? parsed.data as z.infer<(typeof VISUAL_PARAM_SCHEMAS)[K]> : null;
}

/** A holdfázis megvilágított részének SVG-útvonala (cx, cy, r körül). Tiszta függvény, tesztelhető. */
export function moonLitPath(cx: number, cy: number, r: number, lit: number, waxing: boolean): string {
  if (lit <= 0.001) return "";
  if (lit >= 0.999) return `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx} ${cy + r} A${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  const rx = Math.abs(1 - 2 * lit) * r;
  // Lit limb: the half on the lit side (waxing → right, from top to bottom clockwise).
  const limbSweep = waxing ? 1 : 0;
  // Terminator from bottom back to top: crescent bulges toward the lit side, gibbous away from it.
  const crescent = lit < 0.5;
  const termSweep = waxing ? (crescent ? 0 : 1) : (crescent ? 1 : 0);
  const f = (n: number) => Math.round(n * 100) / 100;
  return `M${f(cx)} ${f(cy - r)} A${f(r)} ${f(r)} 0 0 ${limbSweep} ${f(cx)} ${f(cy + r)} A${f(rx)} ${f(r)} 0 0 ${termSweep} ${f(cx)} ${f(cy - r)} Z`;
}

/**
 * Az ábrafajták paraméter-szerződése a promptokhoz (szerző, ábrakészítő, javító). Egy helyen, hogy a
 * modell ugyanazt az alakot kapja, amelyet a rajzoló és a kapu elfogad.
 */
export const VISUAL_PARAMS_CONTRACT = [
  "MAGYARÁZÓ ÁBRA: az ábra a fogalmat MUTASSA (tárgy, viszony, változás, arány, alak), ne a szöveget ismételje. A caption csak azt ígérje, amit a rajz ténylegesen mutat.",
  'cycle — körforgás/fázisok (holdfázisok, víz körforgása, évszakok): {"center"?:"Föld","phases":[{"label":"Újhold","note"?:"rövid magyarázat","moon"?:0,"waxing"?:true}]} 3–12 fázis; "moon" = a Hold megvilágított része 0–1 (0 újhold, 0.5 negyed, 1 telihold), "waxing" true = növő (jobb oldalt világos).',
  'labeledShape — címkézett alakzat méretekkel: {"shape":"rectangle"|"square"|"triangle"|"circle"|"cuboid","width"?,"height"?,"depth"?,"radius"?,"unit"?:"cm","vertices"?:["A","B","C"],"layers"?:6,"note"?}; szám = arányos rajz, szöveg = felirat. rectangle: width+height; square: width; triangle: width (alap)+height (magasság); circle: radius; cuboid: width+height+depth (+layers a kiskockás rétegekhez).',
  'barChart — mennyiségek összehasonlítása: {"bars":[{"label":"1. bolt","value":500}],"unit"?:"Ft/kg","average"?:true} 2–10 oszlop; average true = átlagvonal.',
  'venn — halmazok: {"sets":["kék kabát","kék sapka"],"regions"?:{"A":7,"B":8,"AB":15,"none":0},"universe"?:"30 fős osztály"} 2–3 halmaz; tartomány: A, B, C, AB, AC, BC, ABC, none.',
  'numberLine — számegyenes: {"from":1400,"to":1600,"step"?:50,"highlightTo"?,"marks"?:[{"value":1452,"label":"1452"}],"jumps"?:[{"from":1452,"to":1500,"label":"kerekítés"}]} legfeljebb 40 osztás.',
  'timeline — {"events":["i. e. 776: első olimpia","1000: István koronázása"]} (≥ 2 esemény, időrendben). process — {"steps":["…","…"]} CSAK valódi eljárásra (2–8 lépés), SOHA nem a példa lépéseinek szó szerinti ismétlésére.',
].join("\n");
