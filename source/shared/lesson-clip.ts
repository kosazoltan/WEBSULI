import { z } from "zod";
import type { Lesson } from "./lesson-schema";
import { isGoalCardText } from "./lesson-block-label";
import { DESIGN_THEME_IDS, type DesignThemeId } from "./lesson-design";
import { CLIP_BAND_STYLE } from "./clip-style";

/**
 * Spec docs/specs/2026-11-10-fejezet-kisfilmek-v2.md: a fejezet kisfilmje három rétegben — rajzolt, mozgó jelenetek (kezdőkép + némított
 * mozgókép), rájuk úszó, programból rajzolt PONTOS ábra, és a korosztály hangján elmondott mesélés. Szám és jelölés csak az ábrán él,
 * a rajzon soha. Tiszta, böngészőben is futó kód (a lejátszó, a szerver és a tesztek közös szerződése).
 */
export const CLIP_LIMITS = { say: 240, sayMin: 20, sourceMin: 80, scenesMin: 3, scenesMax: 5 } as const;
export const CLIP_CAMERAS = ["in", "out", "left", "right", "still"] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const mediaId = z.string().regex(/^[a-f0-9]{32}$/);

export const clipOverlaySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("title"), text: text(70) }).strict(),
  z.object({ kind: z.literal("formula"), parts: z.array(z.object({ t: text(28), note: text(44).optional() }).strict()).min(1).max(4), caption: text(110).optional() }).strict(),
  z.object({ kind: z.literal("steps"), items: z.array(z.object({ text: text(70) }).strict()).min(2).max(4) }).strict(),
  z.object({ kind: z.literal("compare"), left: z.object({ label: text(44) }).strict(), right: z.object({ label: text(44) }).strict(), verdict: text(70).optional() }).strict(),
  z.object({ kind: z.literal("graph"), xLabel: text(24), yLabel: text(24), points: z.array(z.tuple([z.number().finite(), z.number().finite()])).min(2).max(8) }).strict(),
  z.object({ kind: z.literal("vectors"), body: text(24), arrows: z.array(z.object({ dir: z.enum(["left", "right", "up", "down"]), label: text(24), size: z.number().int().min(1).max(3) }).strict()).min(1).max(4) }).strict(),
  /** A fejezet saját `animate` blokkja (a blokk indexe a fejezetben). */
  z.object({ kind: z.literal("lessonVisual"), blockIndex: z.number().int().min(0).max(40) }).strict(),
]);

export const clip2SceneSchema = z.object({
  /** Az elmondott mondat (sima magyar szöveg) — egyben a felirat. */
  say: z.string().trim().min(CLIP_LIMITS.sayMin).max(CLIP_LIMITS.say),
  /** A jelenet hangja (tárolt média); hiányában a lejátszó a felolvasás hangvégpontját használja. */
  audio: mediaId.optional(),
  /** A hang hossza ezredmásodpercben — a mozgókép és az ábra ütemezéséhez. */
  ms: z.number().int().min(500).max(60_000).optional(),
  /** A jelenet mozgóképe (hang nélküli MP4, a beállítás képéből indítva); hiányában a kép lassú kameramozgással áll. */
  video: mediaId.optional(),
  shot: z.number().int().min(0).max(4),
  camera: z.enum(CLIP_CAMERAS),
  overlay: clipOverlaySchema.optional(),
}).strict();

export const clip2Schema = z.object({
  v: z.literal(2),
  band: z.enum(DESIGN_THEME_IDS),
  title: text(120),
  shots: z.array(z.object({ image: mediaId, alt: text(160) }).strict()).min(2).max(5),
  scenes: z.array(clip2SceneSchema).min(CLIP_LIMITS.scenesMin).max(CLIP_LIMITS.scenesMax),
}).strict().superRefine((clip, ctx) => {
  const { sayMax } = CLIP_BAND_STYLE[clip.band].narration;
  clip.scenes.forEach((scene, i) => {
    if (scene.shot >= clip.shots.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenes", i, "shot"], message: "A jelenet nem létező beállításra mutat." });
    if (scene.say.length > sayMax) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenes", i, "say"], message: `Ebben a korosztályban egy jelenet szövege legfeljebb ${sayMax} karakter (most ${scene.say.length}).` });
    if (scene.overlay?.kind === "graph" && scene.overlay.points.some((p, j, all) => j > 0 && p[0] <= all[j - 1][0])) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenes", i, "overlay", "points"], message: "A grafikon pontjai x szerint növekvő sorrendben álljanak." });
  });
});

export type ClipOverlay = z.infer<typeof clipOverlaySchema>;
export type Clip2Scene = z.infer<typeof clip2SceneSchema>;
export type Clip2 = z.infer<typeof clip2Schema>;
export type LessonClipsResponse = { clips: Array<{ sectionIndex: number; clip: Clip2 }>; pending: boolean };

/** A tárolt kép / hang / mozgókép azonos eredetű címe (tartalomcímzett, ezért korlátlanul gyorsítótárazható). */
export const clipMediaUrl = (id: string): string => `/api/lesson-clips/media/${id}`;

/**
 * A fejezet tanítószövege a kisfilmhez: magyarázat, példa, összefoglaló. Az 1. fejezet Célkártyája és az azt követő mese kimarad
 * (ugyanaz a felismerés, mint a blokkcímkénél). Túl rövid szövegnél null: a fejezet nem kap kisfilmet.
 */
export function clipSource(lesson: Pick<Lesson, "sections">, sectionIndex: number): string | null {
  const section = lesson.sections[sectionIndex];
  if (!section) return null;
  const first = section.blocks[0];
  const hasGoal = sectionIndex === 0 && first?.kind === "explain" && isGoalCardText(first.text);
  const parts: string[] = [];
  section.blocks.forEach((block, index) => {
    if (hasGoal && (index === 0 || (index === 1 && block.kind === "explain"))) return;
    if (block.kind === "explain") parts.push(block.text);
    else if (block.kind === "example") parts.push([block.problem, ...block.steps, block.answer].join("\n"));
    else if (block.kind === "recap") parts.push(block.bullets.join("\n"));
  });
  const source = parts.join("\n\n").trim();
  return source.length >= CLIP_LIMITS.sourceMin ? source : null;
}

/** A fejezet ábrablokkjainak indexei — a `lessonVisual` ábra csak ezekre mutathat. */
export function animateBlockIndexes(lesson: Pick<Lesson, "sections">, sectionIndex: number): number[] {
  return (lesson.sections[sectionIndex]?.blocks ?? []).flatMap((block, index) => (block.kind === "animate" ? [index] : []));
}

function overlayTexts(overlay: ClipOverlay | undefined): string[] {
  switch (overlay?.kind) {
    case "title": return [overlay.text];
    case "formula": return [...overlay.parts.flatMap((p) => [p.t, ...(p.note ? [p.note] : [])]), ...(overlay.caption ? [overlay.caption] : [])];
    case "steps": return overlay.items.map((item) => item.text);
    case "compare": return [overlay.left.label, overlay.right.label, ...(overlay.verdict ? [overlay.verdict] : [])];
    case "graph": return [overlay.xLabel, overlay.yLabel, ...overlay.points.flat().map(String)];
    case "vectors": return [overlay.body, ...overlay.arrows.map((a) => a.label)];
    default: return [];
  }
}

/** A kisfilm minden magyar szövege (elmondott és képernyőre kerülő) — a tartalmi kapukhoz. */
export function clip2Texts(clip: { title: string; scenes: ReadonlyArray<{ say: string; overlay?: ClipOverlay }> }): string[] {
  return [clip.title, ...clip.scenes.flatMap((scene) => [scene.say, ...overlayTexts(scene.overlay)])];
}

const numbersOf = (s: string): string[] => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
const FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [[/[<>]/, "HTML-jel"], [/\*\*|`/, "markdown-jel"], [/https?:|www\./i, "webcím"]];

/** Tartalmi kapuk: nincs új szám (az ábrán sem), nincs jelölőnyelv vagy webcím, a `lessonVisual` létező ábrablokkra mutat. */
export function clip2ContentProblems(clip: { title: string; scenes: ReadonlyArray<{ say: string; overlay?: ClipOverlay }> }, source: string, heading: string, animateIndexes: readonly number[]): string[] {
  const problems: string[] = [];
  const known = new Set(numbersOf(`${heading}\n${source}`));
  const texts = clip2Texts(clip);
  const unknown = [...new Set(texts.flatMap(numbersOf))].filter((n) => !known.has(n));
  if (unknown.length) problems.push(`Ezek a számok nem szerepelnek a fejezet szövegében: ${unknown.join(", ")}. Csak a fejezet számadatait használd.`);
  for (const [pattern, name] of FORBIDDEN) if (texts.some((t) => pattern.test(t))) problems.push(`A szövegekben nem lehet ${name}.`);
  for (const scene of clip.scenes) if (scene.overlay?.kind === "lessonVisual" && !animateIndexes.includes(scene.overlay.blockIndex)) problems.push(`A(z) ${scene.overlay.blockIndex}. blokk nem ábra ebben a fejezetben.`);
  return problems;
}

/**
 * A forgatókönyvíró kimenete (még média nélkül): jelenetenként az elmondott mondat, a kezdőkép angol leírása, a mozgás angol leírása,
 * a kép magyar helyettesítő szövege és a ráúszó ábra.
 */
export const clipDraftSchema = z.object({
  title: text(120),
  scenes: z.array(z.object({
    say: z.string().trim().min(CLIP_LIMITS.sayMin).max(CLIP_LIMITS.say),
    image: z.string().trim().min(20).max(600),
    motion: z.string().trim().min(20).max(400),
    alt: text(160),
    overlay: clipOverlaySchema.optional(),
  }).strict()).min(3).max(4),
}).strict();
export type ClipDraft = z.infer<typeof clipDraftSchema>;

/** A forgatókönyv kapui a korosztály szerint: jelenetszám, mondathossz, összhossz, majd a közös tartalmi kapuk. Üres lista: rendben. */
export function clipDraftProblems(draft: ClipDraft, band: DesignThemeId, source: string, heading: string, animateIndexes: readonly number[]): string[] {
  const { scenes, sayMax, totalMax } = CLIP_BAND_STYLE[band].narration;
  const problems: string[] = [];
  if (draft.scenes.length < scenes[0] || draft.scenes.length > scenes[1]) problems.push(`Ebben a korosztályban ${scenes[0] === scenes[1] ? scenes[0] : `${scenes[0]}–${scenes[1]}`} jelenet kell (most ${draft.scenes.length}).`);
  draft.scenes.forEach((scene, i) => { if (scene.say.length > sayMax) problems.push(`A(z) ${i + 1}. jelenet szövege legfeljebb ${sayMax} karakter lehet (most ${scene.say.length}).`); });
  const total = draft.scenes.reduce((sum, scene) => sum + scene.say.length, 0);
  if (total > totalMax) problems.push(`Az elmondott szöveg összesen legfeljebb ${totalMax} karakter lehet (most ${total}).`);
  if (draft.scenes[0].overlay?.kind !== "title") problems.push("Az első jelenet ábrája a kisfilm címe legyen (kind: \"title\").");
  return [...problems, ...clip2ContentProblems(draft, source, heading, animateIndexes)];
}

/** Hang nélkül ennyi ideig áll egy jelenet (a felirat elolvasható). */
export function silentSceneMs(say: string): number {
  return Math.max(2500, say.length * 65);
}
