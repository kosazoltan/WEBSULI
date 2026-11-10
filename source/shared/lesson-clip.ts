import { z } from "zod";
import type { Lesson } from "./lesson-schema";
import { isGoalCardText } from "./lesson-block-label";
import { DESIGN_THEME_IDS } from "./lesson-design";
import { CLIP_BAND_STYLE } from "./clip-style";

/**
 * Spec docs/specs/2026-11-10-fejezet-kisfilmek.md: a fejezet rajzfilmes kisfilmje ADAT — jelenetek (elmondott mondat + egy képsablon),
 * amelyeket a lejátszó a saját SVG-sablonjaival rajzol ki; a hang jelenetenként a `/api/tts/audio` MP3-a. Tiszta, böngészőben is futó kód.
 */
export const CLIP_LIMITS = { say: 240, sayMin: 20, totalSay: 900, scenesMin: 3, scenesMax: 8, sourceMin: 80 } as const;
export const CLIP_EFFECTS = ["slide", "fall", "push", "bounce", "orbit", "grow"] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const emoji = z.string().trim().min(1).max(8);

export const clipVisualSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("title"), emoji, text: text(70) }).strict(),
  z.object({ kind: z.literal("idea"), emoji, text: text(110) }).strict(),
  z.object({ kind: z.literal("formula"), parts: z.array(z.object({ t: text(28), note: text(44).optional() }).strict()).min(1).max(5), caption: text(110).optional() }).strict(),
  z.object({ kind: z.literal("steps"), items: z.array(z.object({ emoji: emoji.optional(), text: text(70) }).strict()).min(2).max(4) }).strict(),
  z.object({ kind: z.literal("compare"), left: z.object({ emoji, label: text(44) }).strict(), right: z.object({ emoji, label: text(44) }).strict(), verdict: text(70).optional() }).strict(),
  z.object({ kind: z.literal("motion"), actor: emoji, effect: z.enum(CLIP_EFFECTS), caption: text(110) }).strict(),
]);

export const clipSceneSchema = z.object({
  /** Az elmondott mondat (sima magyar szöveg) — egyben a felirat. A hangvégpont 300 karakternél vág, ezért 240 a plafon. */
  say: z.string().trim().min(CLIP_LIMITS.sayMin).max(CLIP_LIMITS.say),
  visual: clipVisualSchema,
}).strict();

export const clipSchema = z.object({
  v: z.literal(1),
  title: text(120),
  scenes: z.array(clipSceneSchema).min(CLIP_LIMITS.scenesMin).max(CLIP_LIMITS.scenesMax),
}).strict().superRefine((clip, ctx) => {
  const total = clip.scenes.reduce((sum, s) => sum + s.say.length, 0);
  if (total > CLIP_LIMITS.totalSay) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenes"], message: `Az elmondott szöveg összesen legfeljebb ${CLIP_LIMITS.totalSay} karakter lehet (most ${total}).` });
});

export type ClipVisual = z.infer<typeof clipVisualSchema>;
export type ClipScene = z.infer<typeof clipSceneSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type LessonClipsResponse = { clips: Array<{ sectionIndex: number; clip: Clip | Clip2 }>; pending: boolean };

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

/** A kisfilm minden szövege: az elmondott mondatok és a képernyőre kerülő feliratok. */
export function clipTexts(clip: Clip): string[] {
  const out: string[] = [clip.title];
  for (const { say, visual } of clip.scenes) {
    out.push(say);
    switch (visual.kind) {
      case "title": case "idea": out.push(visual.text); break;
      case "formula": for (const p of visual.parts) out.push(p.t, ...(p.note ? [p.note] : [])); if (visual.caption) out.push(visual.caption); break;
      case "steps": for (const item of visual.items) out.push(item.text); break;
      case "compare": out.push(visual.left.label, visual.right.label, ...(visual.verdict ? [visual.verdict] : [])); break;
      case "motion": out.push(visual.caption); break;
    }
  }
  return out;
}

const numbersOf = (s: string): string[] => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
const FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [[/[<>]/, "HTML-jel"], [/\*\*|`/, "markdown-jel"], [/https?:|www\./i, "webcím"]];

/**
 * Az automatikus kisfilm tartalmi kapui (spec 4.7): az első jelenet címkép; új számadat nem születhet (minden szám szerepel a fejezet
 * szövegében vagy címében); a szövegekben nincs HTML-, markdown-jel vagy webcím. Üres lista: rendben.
 */
export function clipContentProblems(clip: Clip, source: string, heading: string): string[] {
  const problems: string[] = [];
  if (clip.scenes[0]?.visual.kind !== "title") problems.push("Az első jelenet képe legyen \"title\" fajtájú.");
  const known = new Set(numbersOf(`${heading}\n${source}`));
  const texts = clipTexts(clip);
  const unknown = [...new Set(texts.flatMap(numbersOf))].filter((n) => !known.has(n));
  if (unknown.length) problems.push(`Ezek a számok nem szerepelnek a fejezet szövegében: ${unknown.join(", ")}. Csak a fejezet számadatait használd.`);
  for (const [pattern, name] of FORBIDDEN) if (texts.some((t) => pattern.test(t))) problems.push(`A szövegekben nem lehet ${name}.`);
  return problems;
}

/** Hang nélkül ennyi ideig áll egy jelenet (a felirat elolvasható). */
export function silentSceneMs(say: string): number {
  return Math.max(2500, say.length * 65);
}

/**
 * v2 (spec docs/specs/2026-11-10-fejezet-kisfilmek-v2.md, 5.): korosztályos kisfilm három rétegben — rajzolt beállítások (`shots`),
 * rájuk úszó, programból rajzolt pontos ábra (`overlay`), sávhangú mesélés (`say` + `audio`). Szám és jelölés csak az ábrán él.
 */
export const CLIP_CAMERAS = ["in", "out", "left", "right", "still"] as const;
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
  say: z.string().trim().min(CLIP_LIMITS.sayMin).max(CLIP_LIMITS.say),
  /** A jelenet hangja (tárolt média); hiányában a lejátszó a felolvasás hangvégpontját használja. */
  audio: mediaId.optional(),
  /** A hang hossza ezredmásodpercben — a kameramozgás és az ábra ütemezéséhez. */
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
  scenes: z.array(clip2SceneSchema).min(3).max(5),
}).strict().superRefine((clip, ctx) => {
  const sayMax = CLIP_BAND_STYLE[clip.band].narration.sayMax;
  clip.scenes.forEach((scene, i) => {
    if (scene.shot >= clip.shots.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenes", i, "shot"], message: "A jelenet nem létező beállításra mutat." });
    if (scene.say.length > sayMax) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenes", i, "say"], message: `Ebben a korosztályban egy jelenet szövege legfeljebb ${sayMax} karakter (most ${scene.say.length}).` });
    if (scene.overlay?.kind === "graph" && scene.overlay.points.some((p, j, all) => j > 0 && p[0] <= all[j - 1][0])) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scenes", i, "overlay", "points"], message: "A grafikon pontjai x szerint növekvő sorrendben álljanak." });
  });
});

export type ClipOverlay = z.infer<typeof clipOverlaySchema>;
export type Clip2Scene = z.infer<typeof clip2SceneSchema>;
export type Clip2 = z.infer<typeof clip2Schema>;

/** A tárolt kép / hang azonos eredetű címe (tartalomcímzett, ezért korlátlanul gyorsítótárazható). */
export const clipMediaUrl = (id: string): string => `/api/lesson-clips/media/${id}`;

/** Bármelyik változat érvényes kisfilmje, vagy null. */
export function parseAnyClip(value: unknown): Clip | Clip2 | null {
  const v2 = clip2Schema.safeParse(value);
  if (v2.success) return v2.data;
  const v1 = clipSchema.safeParse(value);
  return v1.success ? v1.data : null;
}

/** A v2 kisfilm minden szövege (elmondott és képernyőre kerülő) — a tartalmi kapukhoz. */
export function clip2Texts(clip: Clip2): string[] {
  const out: string[] = [clip.title];
  for (const { say, overlay } of clip.scenes) {
    out.push(say);
    switch (overlay?.kind) {
      case "title": out.push(overlay.text); break;
      case "formula": for (const p of overlay.parts) out.push(p.t, ...(p.note ? [p.note] : [])); if (overlay.caption) out.push(overlay.caption); break;
      case "steps": for (const item of overlay.items) out.push(item.text); break;
      case "compare": out.push(overlay.left.label, overlay.right.label, ...(overlay.verdict ? [overlay.verdict] : [])); break;
      case "graph": out.push(overlay.xLabel, overlay.yLabel, ...overlay.points.flat().map(String)); break;
      case "vectors": out.push(overlay.body, ...overlay.arrows.map((a) => a.label)); break;
      default: break;
    }
  }
  return out;
}

/** A v2 tartalmi kapui: nincs új szám, nincs jelölőnyelv vagy webcím; a `lessonVisual` létező ábrablokkra mutat. */
export function clip2ContentProblems(clip: Clip2, source: string, heading: string, animateBlockIndexes: readonly number[]): string[] {
  const problems: string[] = [];
  const known = new Set(numbersOf(`${heading}\n${source}`));
  const texts = clip2Texts(clip);
  const unknown = [...new Set(texts.flatMap(numbersOf))].filter((n) => !known.has(n));
  if (unknown.length) problems.push(`Ezek a számok nem szerepelnek a fejezet szövegében: ${unknown.join(", ")}. Csak a fejezet számadatait használd.`);
  for (const [pattern, name] of FORBIDDEN) if (texts.some((t) => pattern.test(t))) problems.push(`A szövegekben nem lehet ${name}.`);
  for (const scene of clip.scenes) if (scene.overlay?.kind === "lessonVisual" && !animateBlockIndexes.includes(scene.overlay.blockIndex)) problems.push(`A(z) ${scene.overlay.blockIndex}. blokk nem ábra ebben a fejezetben.`);
  return problems;
}
