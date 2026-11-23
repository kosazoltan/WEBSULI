import { z } from "zod";
import { illustrationLayoutProblems, sanitizeIllustration } from "./illustration-svg";
import { readDecisionTreeParams } from "./source-visual-render";
import type { CompareCardsVisualParams, DecisionTreeVisualNode, DecisionTreeVisualParams, PictureCardsVisualParams, RuleBoxVisualParams, TableVisualParams } from "./source-visual-render";

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
  // Élő mérés (2 futás, 2026-09-24): a 16 karakteres korlát helyes ábrákat utasított el („+ 3 oldal naponta”); a
  // rajzoló a feliratot a rajzterületen belül tartja és ütközéskor új sorba teszi.
  jumps: z.array(z.object({ from: z.number().finite(), to: z.number().finite(), label: label(24).optional() })).max(10).optional(),
}).refine((p) => p.to > p.from, { message: "to > from" })
  .refine((p) => !p.step || (p.to - p.from) / p.step <= 40, { message: "legfeljebb 40 osztás" });

export const processParamsSchema = z.object({ steps: z.array(label(160)).min(2).max(8) });
export const timelineParamsSchema = z.object({ events: z.array(label(80)).min(2).max(10) });

/**
 * Spec 2026-09-30 (docs/specs/2026-09-30-abratervezo-3d.md): forgatható 3D-jelenet. A modell csak leíró adatot ad
 * (alakzat, hely, méret, szín, felirat); a kliens three.js-szel rajzolja — végrehajtandó kód nem kerül a leckébe.
 * Koordináták: x jobbra, y felfelé, z a néző felé; a talaj az y = 0 sík.
 */
const coord = z.number().finite().min(-10).max(10);
const extent = z.number().finite().min(0.05).max(20);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "#rrggbb szín");
export const SCENE3D_SHAPES = ["box", "cylinder", "cone", "sphere", "stairs", "plane", "river"] as const;
export const SCENE3D_MAX_LABELS = 8;
export const scene3dParamsSchema = z.object({
  objects: z.array(z.object({
    shape: z.enum(SCENE3D_SHAPES),
    /** Az alakzat talppontjának közepe (a lépcső/hasáb alja). */
    at: z.tuple([coord, coord, coord]),
    /** Szélesség (x), magasság (y), mélység (z); hengernél/kúpnál/gömbnél a szélesség az átmérő. */
    size: z.tuple([extent, extent, extent]).optional(),
    color: hexColor,
    label: label(40).optional(),
    /** Lépcsős tömb (zikkurat) szintjeinek száma; felfelé kisebbedő szintek. */
    steps: z.number().int().min(2).max(8).optional(),
    /** Folyó: a talajon futó sáv középvonala [x, z] pontokkal. */
    points: z.array(z.tuple([coord, coord])).min(2).max(12).optional(),
    /** Folyó szélessége. */
    width: z.number().finite().min(0.1).max(4).optional(),
    rotY: z.number().finite().min(-180).max(180).optional(),
  })).min(1).max(40),
  labels: z.array(z.object({ text: label(40), at: z.tuple([coord, coord, coord]) })).max(SCENE3D_MAX_LABELS).optional(),
  ground: hexColor.optional(),
  view: z.enum(["iso", "front", "top"]).optional(),
}).superRefine((p, ctx) => {
  p.objects.forEach((o, i) => {
    if (o.shape === "river" && !o.points) ctx.addIssue({ code: "custom", path: ["objects", i, "points"], message: "river: hiányzó points" });
    if (o.shape !== "river" && !o.size) ctx.addIssue({ code: "custom", path: ["objects", i, "size"], message: `${o.shape}: hiányzó size` });
  });
  const count = p.objects.filter((o) => o.label).length + (p.labels?.length ?? 0);
  if (count > SCENE3D_MAX_LABELS) ctx.addIssue({ code: "custom", path: ["labels"], message: `legfeljebb ${SCENE3D_MAX_LABELS} felirat (most ${count})` });
});

/**
 * Spec 2026-11-18 (tananyaggyártás minősége, S2a): a forrás ábráit újrarajzoló megjelenítők paraméterei. Az ALAK a megosztott
 * szerződésé (`shared/source-visual-render.ts` — a forrás-fedettségi kapu ugyanebből olvas); itt a SZIGORÚ érvényesség áll:
 *  - ismeretlen kulcs (`hidden`, `maxRows`, `collapsed` …) elutasítva (`.strict()`): amit a séma elfogad, az mind megjelenik;
 *  - a korlátok NEM szűkebbek a forrásleltárénál (`shared/source-visuals.ts`): 8 oszlop, 80 karakteres fejléc, a leltár 100 karakteres cellájánál bővebb (120) cella,
 *    8 pontos / 240 karakteres szabálydoboz. Egyetlen kivétel a sorszám: egy blokk legfeljebb `SOURCE_TABLE_BLOCK_ROWS` sor — a
 *    hosszabb forrástáblát a gyártó több, ugyanarra a tételre hivatkozó blokkra bontja (a kapu a hivatkozó blokkokat összeadja).
 */
export const SOURCE_TABLE_BLOCK_ROWS = 20;
const toneSchema = z.enum(["a", "b", "c", "neutral"]);
export const tableParamsSchema = z.object({
  caption: label(160).optional(),
  headers: z.array(label(80)).min(1).max(8),
  /** A cella lehet üres (a forrás üres mezője is adat); minden sor a fejléc sorrendjében, a fejléccel azonos hosszban. */
  rows: z.array(z.array(z.string().trim().max(120)).min(1).max(8)).min(1).max(SOURCE_TABLE_BLOCK_ROWS),
  headerTones: z.array(toneSchema).max(8).optional(),
}).strict().superRefine((p, ctx) => {
  p.rows.forEach((row, i) => { if (row.length !== p.headers.length) ctx.addIssue({ code: "custom", path: ["rows", i], message: `a sor ${row.length} cellás, a fejléc ${p.headers.length} oszlopos` }); });
  if (p.headerTones && p.headerTones.length !== p.headers.length) ctx.addIssue({ code: "custom", path: ["headerTones"], message: "oszloponként egy tónus kell" });
  if (!p.rows.some((row) => row.some((cell) => cell.length > 0))) ctx.addIssue({ code: "custom", path: ["rows"], message: "minden cella üres" });
});
export const ruleBoxParamsSchema = z.object({
  tone: z.enum(["rule", "warning", "tip"]),
  heading: label(80).optional(),
  items: z.array(label(240)).min(1).max(8),
}).strict();
export const compareCardsParamsSchema = z.object({
  cards: z.array(z.object({
    title: label(80),
    tone: toneSchema.optional(),
    lines: z.array(label(200)).min(1).max(8),
    example: label(160).optional(),
  }).strict()).min(2).max(3),
}).strict();
/**
 * S2b-1 (docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md): döntési fa — legfeljebb 3 szint, csomópontonként 2–4 ág,
 * összesen legfeljebb 13 csomópont; a levél az ág nélküli csomópont.
 */
export const DECISION_TREE_MAX_DEPTH = 3;
export const DECISION_TREE_MAX_NODES = 13;
type TreeNode = { text: string; branches?: Array<{ label: string; node: TreeNode }> };
/**
 * Review #533 (Copilot): a csomópontséma VÉGES számú szintből épül (nem rekurzív `z.lazy`) — a legalsó megengedett szint levele
 * szigorú objektum `branches` nélkül, így a séma a mélységi határon túl be sem járja a bemenetet (nagyon mély, sérült tárolt fa
 * szabályos paraméterhiba, nem veremtúlcsordulás). A szöveghatárok a forrásleltáréval (`shared/source-visuals.ts`: csomópont 160,
 * ágfelirat 60) egyeznek — a forrás érvényes felirata nem bukhat a megjelenítő sémáján.
 */
const TREE_TEXT_MAX = 160, TREE_BRANCH_LABEL_MAX = 60;
function treeLevelSchema(levels: number): z.ZodType<TreeNode> {
  if (levels <= 1) return z.object({ text: label(TREE_TEXT_MAX) }).strict(`legfeljebb ${DECISION_TREE_MAX_DEPTH} szint`);
  return z.object({
    text: label(TREE_TEXT_MAX),
    branches: z.array(z.object({ label: label(TREE_BRANCH_LABEL_MAX), node: treeLevelSchema(levels - 1) }).strict()).min(2).max(4).optional(),
  }).strict();
}
const treeNodeSchema = treeLevelSchema(DECISION_TREE_MAX_DEPTH);
const treeDepth = (n: TreeNode): number => 1 + Math.max(0, ...(n.branches ?? []).map((b) => treeDepth(b.node)));
const treeSize = (n: TreeNode): number => 1 + (n.branches ?? []).reduce((a, b) => a + treeSize(b.node), 0);
export const decisionTreeParamsSchema = z.object({ root: treeNodeSchema }).strict().superRefine((p, ctx) => {
  if (treeDepth(p.root) > DECISION_TREE_MAX_DEPTH) ctx.addIssue({ code: "custom", path: ["root"], message: `legfeljebb ${DECISION_TREE_MAX_DEPTH} szint` });
  if (treeSize(p.root) > DECISION_TREE_MAX_NODES) ctx.addIssue({ code: "custom", path: ["root"], message: `legfeljebb ${DECISION_TREE_MAX_NODES} csomópont` });
});
/** Képes kártyák: 2–8 kártya; a rajz a meglévő illusztráció-tisztítón megy át (csak tisztított, felirattal ellátott SVG rajzolódik). */
export const pictureCardsParamsSchema = z.object({
  cards: z.array(z.object({
    // Review #533 (Copilot): a szöveghatárok a forrásleltár `pictureCard` határaival egyeznek (felirat 60, képaláírás 120, példa 160).
    label: label(60),
    svg: z.string().max(6000).refine((svg) => sanitizeIllustration(svg).ok, { message: "a rajz nem megy át az illusztráció-tisztítón" }),
    caption: label(120).optional(),
    example: label(160).optional(),
  }).strict()).min(2).max(8),
}).strict();
// Fordítási idejű őr: a séma kimenete a megosztott szerződés alakja (ha a szerződés változik, ez a sor nem fordul le).
type Assignable<A extends B, B> = A;
export type SourceVisualSchemaContract = [Assignable<z.infer<typeof tableParamsSchema>, TableVisualParams>,
  Assignable<z.infer<typeof ruleBoxParamsSchema>, RuleBoxVisualParams>, Assignable<z.infer<typeof compareCardsParamsSchema>, CompareCardsVisualParams>,
  Assignable<z.infer<typeof decisionTreeParamsSchema>, DecisionTreeVisualParams>, Assignable<z.infer<typeof pictureCardsParamsSchema>, PictureCardsVisualParams>];

/**
 * Független review B1 (S2a): a forrás-ábrák fajtáinál a hibás paraméterű blokkból a rajzoló SEMMIT nem rajzol — az ilyen blokk
 * (fejléc üres törzzsel) nem kerülhet a tanuló elé. `sourceVisualProblems`: a hibák listája, vagy `null`, ha a blokk nem ilyen fajtájú
 * vagy érvényes. `dropUndrawableSourceVisuals`: a szerző kimenetéből determinisztikusan kiveszi ezeket (javítókör nélkül; a hívó számol
 * és naplóz); a többi blokk és a régi 16 fajta érintetlen.
 */
export const SOURCE_VISUAL_SCHEMA_KINDS = ["table", "ruleBox", "compareCards", "decisionTree", "pictureCards"] as const;
export function sourceVisualProblems(block: unknown): string[] | null {
  const b = block as { kind?: unknown; animKind?: unknown; params?: unknown } | null;
  if (!b || b.kind !== "animate" || !(SOURCE_VISUAL_SCHEMA_KINDS as readonly unknown[]).includes(b.animKind)) return null;
  const problems = visualParamProblems(b.animKind as string, b.params);
  return problems.length ? problems : null;
}
export type DroppedSourceVisual = { path: string; animKind: string; problems: string[] };
export function dropUndrawableSourceVisuals<L extends { sections: ReadonlyArray<{ blocks: ReadonlyArray<unknown> }> }>(lesson: L): { lesson: L; dropped: DroppedSourceVisual[] } {
  const dropped: DroppedSourceVisual[] = [];
  const sections = lesson.sections.map((section, i) => {
    const blocks = section.blocks.filter((block, j) => {
      const problems = sourceVisualProblems(block);
      if (problems) dropped.push({ path: `sections[${i}].blocks[${j}]`, animKind: String((block as { animKind?: unknown }).animKind), problems: problems.slice(0, 5) });
      return !problems;
    });
    return blocks.length === section.blocks.length ? section : { ...section, blocks };
  });
  return dropped.length ? { lesson: { ...lesson, sections }, dropped } : { lesson, dropped };
}

export const VISUAL_PARAM_SCHEMAS = {
  cycle: cycleParamsSchema,
  labeledShape: labeledShapeParamsSchema,
  barChart: barChartParamsSchema,
  venn: vennParamsSchema,
  numberLine: numberLineParamsSchema,
  process: processParamsSchema,
  timeline: timelineParamsSchema,
  scene3d: scene3dParamsSchema,
  table: tableParamsSchema,
  ruleBox: ruleBoxParamsSchema,
  compareCards: compareCardsParamsSchema,
  decisionTree: decisionTreeParamsSchema,
  pictureCards: pictureCardsParamsSchema,
} as const;

export type VisualParamKind = keyof typeof VISUAL_PARAM_SCHEMAS;
export type CycleParams = z.infer<typeof cycleParamsSchema>;
export type LabeledShapeParams = z.infer<typeof labeledShapeParamsSchema>;
export type BarChartParams = z.infer<typeof barChartParamsSchema>;
export type VennParams = z.infer<typeof vennParamsSchema>;
export type NumberLineParams = z.infer<typeof numberLineParamsSchema>;
export type Scene3dParams = z.infer<typeof scene3dParamsSchema>;

/** Validated params, or the reasons they cannot be drawn. Kinds without a schema pass through. */
export function visualParamProblems(kind: string, params: unknown): string[] {
  if (kind === "illustration") {
    const check = sanitizeIllustration((params as { svg?: unknown } | null)?.svg);
    // Spec 2026-10-05: a kliens a hibás szám-attribútumot elhagyja, de új modellkimenetet a kapu visszaküld javításra.
    const attrProblems = check.ok && check.attrFixes.length ? [`érvénytelen szám-attribútum (a böngésző nem rajzolja): ${check.attrFixes.join(", ").slice(0, 160)}`] : [];
    return (check.ok ? [...attrProblems, ...illustrationLayoutProblems(check.svg)] : check.problems).map((p) => `illustration.svg: ${p}`);
  }
  const schema = (VISUAL_PARAM_SCHEMAS as Record<string, z.ZodTypeAny>)[kind];
  if (!schema) return [];
  const parsed = schema.safeParse(params);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${kind}.${i.path.join(".") || "params"}: ${i.message}`);
}

/**
 * A GYÁRTÁSI kapu ellenőrzése (az ábrák állomása: `server/studio/visual-patch.ts`): a kirajzolhatóságon (`visualParamProblems`) felül
 * minőségi szabályok, amelyek NEM érvényesek a tárolt lecke megjelenítésére. Review #533 (Codex, Vercel, Copilot) + vak kör 4 (L8): a
 * képes kártya rajzának kilógó felirata a gyártásban visszamegy javításra, de a lejátszó (`sourceVisualProblems`) a már tárolt kártyát
 * emiatt nem rejtheti el — a két út ezért külön függvény.
 */
export function visualAuthoringProblems(kind: string, params: unknown): string[] {
  const problems = visualParamProblems(kind, params);
  if (problems.length || kind !== "pictureCards") return problems;
  const parsed = pictureCardsParamsSchema.safeParse(params);
  if (!parsed.success) return problems;
  return parsed.data.cards.flatMap((card, index) => {
    const check = sanitizeIllustration(card.svg);
    if (!check.ok) return check.problems.map((p) => `pictureCards.cards.${index}.svg: ${p}`);
    // Vak kör 5 (L9): a közös helybecslő (`illustrationLayoutProblems`) változatlan — csak egység nélküli, eltolás nélküli helyet tud
    // megítélni. Amit nem tud biztosan kiszámolni (em / ex / px / % egység, dx / dy eltolás), azt itt NEM ítéljük meg (nincs hamis
    // riasztás, és a kilógást ilyenkor nem állítjuk) — a rajz megjelenik, az ellenőrzés kimarad.
    if (!PLAIN_TEXT_POSITIONS.test(check.svg)) return [];
    return illustrationLayoutProblems(check.svg).map((p) => `pictureCards.cards.${index}.svg: ${p}`);
  });
}
/** Igaz, ha a rajzban nincs `dx` / `dy` attribútum, és minden `x` / `y` attribútum egység nélküli szám (vagy számlista). */
const PLAIN_TEXT_POSITIONS = /^(?![\s\S]*\s(?:dx|dy)=)(?![\s\S]*\s[xy]="[^"]*[A-Za-z%][^"]*")[\s\S]*$/;

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
  'illustration — szabad SVG-rajz, CSAK ha a fenti fajták nem mutatják a lényeget (pl. Stonehenge kőkörei, egy sejt részei, a Nap–Föld–Hold helyzete): {"svg":"<svg viewBox=\\"0 0 800 520\\" xmlns=\\"http://www.w3.org/2000/svg\\">…</svg>"}. Csak alap alakzatok (path, circle, ellipse, rect, line, polyline, polygon), text/tspan, g, defs, linearGradient/radialGradient, marker; nincs style, script, kép, link. A rajz világos papíron (#f8fafc) jelenik meg minden témában: szabad felirat és vonal #0f172a; kitöltött alakzaton a felirat explicit, kontrasztos színű (világos kitöltésen #0f172a, sötéten #ffffff), currentColor nélkül; kitöltés közepes telítettségű szín. Minden felirat szava szerepeljen a leckében; font-size ≥ 32 a viewBox 800 szélességénél (arányosan: szélesség/25; a program telefonszélességre méri); a feliratok ne fedjék egymást (sortávolság ≥ 1,3 × betűméret, becsült szélesség ≈ 0,55 × betűméret × betűszám), ne lógjanak ki a viewBoxból; transform nélkül; ≤ 30 000 karakter.',
  'scene3d — forgatható 3D-jelenet, ha TÉRBELI forma vagy elrendezés a lényeg (épület és részei, táj folyókkal, egymáshoz viszonyított helyek): {"objects":[{"shape":"stairs","at":[0,0,0],"size":[6,4,6],"steps":4,"color":"#d98c4a","label":"zikkurat"},{"shape":"box","at":[0,4,0],"size":[1.4,1,1.4],"color":"#f1e3c6","label":"szentély"},{"shape":"river","at":[0,0,0],"points":[[-8,-6],[-5,0],[-7,6]],"width":1.2,"color":"#3b82c4","label":"Tigris"}],"labels"?:[{"text":"…","at":[x,y,z]}],"ground"?:"#e6c98f","view"?:"iso"}. shape: box|cylinder|cone|sphere|stairs|plane|river; at = talppont [x,y,z] −10…10 (y felfelé, a talaj y=0); size = [szélesség, magasság, mélység] 0.05–20 (river-nél nem kell); stairs: 2–8 felfelé kisebbedő szint; river: points [x,z] 2–12 pont. Szín #rrggbb; ≤ 40 objektum; legfeljebb 8 felirat összesen; minden felirat szava a leckéből.',
  'timeline — {"events":["i. e. 776: első olimpia","1000: István koronázása"]} (≥ 2 esemény, időrendben). process — {"steps":["…","…"]} CSAK valódi eljárásra (2–8 lépés), SOHA nem a példa lépéseinek szó szerinti ismétlésére.',
].join("\n");

/**
 * Spec 2026-09-24 (élő mérés, „időszámítás” lecke): a címke-őr (grounding.blockText) animate blokknál csak
 * a captiont és a process lépéseit látta — az új fajták KIRAJZOLT szövegét (idővonal-események, fázisnevek,
 * halmaznevek, illusztráció-feliratok) nem, ezért 8 fogalomcímkét levett és egy ábra kiesett. Ez a függvény
 * pontosan azt a szöveget adja vissza, amit a rajzoló megjelenít — a rejtett metaadat továbbra sem bizonyíték.
 */
export function renderedVisualTexts(animKind: string, params: unknown): string[] {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const str = (v: unknown) => (typeof v === "string" ? [v] : []);
  const field = (v: unknown, key: string) => (Array.isArray(v) ? v.flatMap((x) => (x && typeof x === "object" ? str((x as Record<string, unknown>)[key]) : [])) : []);
  switch (animKind) {
    case "process": return strings(p.steps);
    case "timeline": return strings(p.events);
    case "wordBuilder":
    case "sentenceParts": return strings(p.parts);
    case "map": return field(p.spots, "label");
    case "cycle": return [...str(p.center), ...field(p.phases, "label"), ...field(p.phases, "note")];
    case "barChart": return [...field(p.bars, "label"), ...str(p.unit)];
    case "venn": return [...strings(p.sets), ...str(p.universe), ...Object.values((p.regions ?? {}) as Record<string, unknown>).filter((v): v is string => typeof v === "string")];
    case "numberLine": return [...field(p.marks, "label"), ...field(p.jumps, "label")];
    case "labeledShape": return [...["width", "height", "depth", "radius"].flatMap((k) => str(p[k])), ...str(p.note)];
    case "illustration": { const check = sanitizeIllustration(p.svg); return check.ok ? check.labels : []; }
    case "scene3d": return [...field(p.objects, "label"), ...field(p.labels, "text")];
    // S2a: minden kirajzolt szöveg — felirat, fejléc, cella; cím, pont; kártyacím, sor, példa (az üres cella nem szöveg).
    case "table": return [...str(p.caption), ...strings(p.headers), ...(Array.isArray(p.rows) ? p.rows.flatMap(strings) : [])].filter((t) => t.trim());
    case "ruleBox": return [...str(p.heading), ...strings(p.items)];
    case "compareCards": return Array.isArray(p.cards) ? p.cards.flatMap((c) => (c && typeof c === "object" ? [...str((c as Record<string, unknown>).title), ...strings((c as Record<string, unknown>).lines), ...str((c as Record<string, unknown>).example)] : [])) : [];
    // S2b-1: a csomópontok szövege és az ágfeliratok (bejárási sorrendben); a kártya felirata, aláírása, példája és a rajz feliratai.
    // Review #533 (Copilot): a bejárás a korlátos olvasón megy (`readDecisionTreeParams`: mélység- és csomópontkeret) — nyers, nagyon
    // mély sérült fa sem okoz veremtúlcsordulást; az érvényes fa szövegsorrendje változatlan (gyökér, ágfelirat, csomópont).
    case "decisionTree": {
      const tree = readDecisionTreeParams(p);
      const walk = (n: DecisionTreeVisualNode): string[] => [...str(n.text), ...(n.branches ?? []).flatMap((b) => [...str(b.label), ...walk(b.node)])];
      return tree ? walk(tree.root) : [];
    }
    case "pictureCards": return Array.isArray(p.cards) ? p.cards.flatMap((c) => { const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>; const check = sanitizeIllustration(o.svg); return [...str(o.label), ...str(o.caption), ...str(o.example), ...(check.ok ? check.labels : [])]; }) : [];
    default: return [];
  }
}
