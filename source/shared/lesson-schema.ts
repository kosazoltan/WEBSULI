import { z } from "zod";
import { experienceSchema } from "./lesson-experience";
import { parseReferenceExpression } from "./answer-value";

/** U4 (B4 `TEACHING_CONTRACT`): a tanítási szövegek karakterkorlátai — EGY helyen; a séma és a szerzőnek adott szerződés ugyanezt mondja. */
export const LESSON_TEXT_LIMITS = { heading: 255, explain: 4000, problem: 2000, step: 1000, answer: 1000, caption: 500, question: 1000, option: 500, feedback: 1000, hint: 1000, bullet: 500 } as const;
import { triangleAreaLabParamsSchema } from "./triangle-area-lab";
import { decisionStoryParamsSchema } from "./decision-story";
import { sourceImageParamsSchema } from "./source-image";

/**
 * The Lesson: what a child actually reads, as structured data rather than an HTML blob.
 *
 * Why this shape exists at all. Lessons used to be generated HTML pages, which meant
 * nobody could check what they claimed, every page reinvented its own layout and
 * behaviour, and the CSP had to stay loose enough to run whatever script the model
 * emitted. A lesson expressed as data can be validated, rendered by one audited
 * runtime, themed per age band, and served without executing foreign script.
 *
 * Two rules are encoded here rather than left to a prompt:
 *
 *  - every block except `recap` must name at least one KnowledgeMap concept it teaches;
 *  - the lesson must declare `sourceOnly: true`.
 *
 * Both are D1 ("the source always wins") in machine-checkable form. A claim that cannot
 * be traced to the curated map has nowhere to live in this structure.
 */

/** Animation kinds the runtime will know how to draw (LS-4 implements them). */
export const ANIM_KINDS = [
  "numberLine",
  "fraction",
  "timeline",
  "geometry",
  "process",
  "map",
  "wordBuilder",
  "sentenceParts",
  "triangleArea",
  "decisionStory",
  // Spec 2026-09-24 (magyarázó ábrák): paramétereiket a shared/lesson-visual-params.ts méri.
  "cycle",
  "labeledShape",
  "barChart",
  "venn",
  // Spec 2026-09-24 (2. szelet): szabad SVG-illusztráció, szigorú tisztítással (shared/illustration-svg.ts).
  "illustration",
  // Spec 2026-09-30 (ábratervező + 3D): forgatható 3D-jelenet leíró adatból (three.js a kliensben; a modell kódot nem ír).
  "scene3d",
  // Spec 2026-11-18 (tananyaggyártás minősége, S2a): a forrás ábráinak újrarajzolása — paraméter-szerződés: shared/source-visual-render.ts.
  "table",
  "ruleBox",
  "compareCards",
  // S2b-1 (docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md): elágazó döntési fa, képes kártyák.
  "decisionTree",
  "pictureCards",
  // D1H (docs/specs/2026-11-25-d1h-kivagott-kep.md): a forrás kivágott képe forrásmegjelöléssel — a modell SOHA nem írja (a program tölti).
  "sourceImage",
] as const;

/**
 * A gyártó promptjaiban HIRDETETT ábrafajták (szerzői blokk-katalógus, ábrakészítő, fejezetenkénti ábratervező) — kifejezett lista,
 * nem az `ANIM_KINDS` tükre. Egy fajta akkor kerül ide, amikor a paraméter-alakja is a promptban van (`VISUAL_PARAMS_CONTRACT`):
 * alak nélkül hirdetve a modell kitalált paramétert adna, amelyet a rajzoló nem rajzol ki (független review B1, S2a). A `table`,
 * `ruleBox`, `compareCards` ezért az S3a-ig NINCS itt (ott a szerződés bővítésével EGYÜTT kerül be); őr: studio-author-catalog.test.ts.
 */
export const PROMPT_ANIM_KINDS = [
  "numberLine", "fraction", "timeline", "geometry", "process", "map", "wordBuilder", "sentenceParts", "triangleArea", "decisionStory",
  "cycle", "labeledShape", "barChart", "venn", "illustration", "scene3d",
] as const satisfies ReadonlyArray<(typeof ANIM_KINDS)[number]>;

/** Hands-on interactions (LS-4 implements them). */
export const TRY_KINDS = ["dragSort", "fillBlank", "match"] as const;

/** A hat érvényes blokk-kind — a blockSchema discriminated unionjával szinkronban. */
export const BLOCK_KINDS = ["explain", "example", "animate", "check", "try", "recap"] as const;

export const EXPLAIN_DEPTHS = ["core", "deeper", "why"] as const;

export const AGE_BANDS = ["kid", "teen", "senior"] as const;

export type AnimKind = (typeof ANIM_KINDS)[number];

/**
 * A forrás-ábrák S2a-ban bevezetett fajtái. OLVASÁSKOR és megjelenítéskor a séma (`ANIM_KINDS`) mindig ismeri őket; a GYÁRTÁS a modell
 * kimenetében csak a forrás vizuális leltárának funkciókapcsolója mellett fogadja el (spec 2026-11-18-tananyag-gyartas-minoseg, 5. szakasz
 * 14. pont) — KI állapotban a modell ilyen fajtát nem is hall, és a kimenet határa a bővítés előtti hibával utasítja el.
 */
export const SOURCE_VISUAL_ANIM_KINDS = ["table", "ruleBox", "compareCards", "decisionTree", "pictureCards"] as const satisfies ReadonlyArray<AnimKind>;
/** A bővítés ELŐTTI ábrafajta-felsorolás (a főág `ANIM_KINDS` listája, ugyanabban a sorrendben). */
export const legacyAnimKindSchema = z.enum(ANIM_KINDS.filter((k) => !(SOURCE_VISUAL_ANIM_KINDS as readonly string[]).includes(k) && k !== "sourceImage") as [AnimKind, ...AnimKind[]]);

/**
 * Spec 2026-09-24 (magyarázó ábrák): olvasáskor az ismeretlen (újabb programverzióból származó)
 * ábrafajtájú animate blokk kimarad, a lecke többi része megjelenik — a régi kliens így nem mutatja
 * „sérültnek” az új ábrás leckét (lásd a 2026-09-24-es `princess`-téma esetet). Íráskor a séma szigorú.
 */
export function dropUnknownAnimateBlocks(raw: unknown): unknown {
  return dropUnknownBlocks(raw);
}

/** Az ismeretlen (újabb programverziós) blokk helyén álló szöveg (V-kompat). */
export const UNKNOWN_SECTION_TEXT = "Ez a rész a program újabb változatával készült. Frissítsd az oldalt, és megjelenik.";

const isKnownBlock = (b: unknown): boolean => {
  if (!b || typeof b !== "object") return false;
  const { kind, tryKind, animKind } = b as { kind?: unknown; tryKind?: unknown; animKind?: unknown };
  if (!(BLOCK_KINDS as readonly unknown[]).includes(kind)) return false;
  if (kind === "try") return (TRY_KINDS as readonly unknown[]).includes(tryKind);
  if (kind === "animate") return (ANIM_KINDS as readonly unknown[]).includes(animKind);
  return true;
};

/**
 * V-kompat (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md, review #583, #598): olvasáskor az újabb programverzió
 * ismeretlen blokkfajtája (`kind`), feladatfajtája (`tryKind`) és ábrafajtája (`animKind`) HELYÉN egy rövid, frissítésre kérő
 * magyarázat áll — a régi, gyorsítótárazott kliens a leckét nem mutatja „sérültnek”. A blokk NEM törlődik, hanem helyettesítődik
 * (review #598): a blokkindexek (Próba-beküldés `blockIndex`, mentett válaszok, feladatállapot, kisfilm-ábrahivatkozás) a szerveren
 * tárolt, szűretlen leckével egyeznek, és a fejezetek sem tűnnek el. A magyarázat fogalma a helyettesített blokké, ennek híján a
 * lecke első fogalma. Íráskor a séma szigorú.
 */
export function dropUnknownBlocks(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { sections?: unknown }).sections)) return raw;
  const lesson = raw as { sections: Array<{ blocks?: unknown }> };
  if (lesson.sections.every((s) => !s || !Array.isArray(s.blocks) || s.blocks.every(isKnownBlock))) return raw;
  const conceptOf = (b: unknown) => {
    const c = (b as { coversConceptIds?: unknown } | null)?.coversConceptIds;
    return Array.isArray(c) && c.length > 0 && c.every((x) => typeof x === "string") ? (c as string[]) : undefined;
  };
  const lessonConcept = lesson.sections.flatMap((s) => (s && Array.isArray(s.blocks) ? s.blocks : [])).map(conceptOf).find(Boolean);
  return {
    ...lesson,
    sections: lesson.sections.map((section) => !section || !Array.isArray(section.blocks) ? section : {
      ...section,
      blocks: section.blocks.map((b) => isKnownBlock(b) ? b : {
        kind: "explain", text: UNKNOWN_SECTION_TEXT, depth: "core", readAloud: false, coversConceptIds: (conceptOf(b) ?? lessonConcept ?? []).slice(0, 1),
      }),
    }),
  };
}

export type TryKind = (typeof TRY_KINDS)[number];
export type ExplainDepth = (typeof EXPLAIN_DEPTHS)[number];
export type AgeBand = (typeof AGE_BANDS)[number];

/**
 * Register to write and style in, derived from the classroom.
 *
 * Derived rather than stored: a lesson moved to another year must not be able to keep a
 * stale band. Classroom 0 is "programozási alapismeretek" and reads as the youngest band.
 */
export function ageBandForClassroom(classroom: number): AgeBand {
  if (classroom <= 4) return "kid";
  if (classroom <= 8) return "teen";
  return "senior";
}

const filled = (max: number) => z.string().trim().min(1).max(max);

/** Concepts this block teaches — the link back to the curated map. */
const coversConceptIds = z.array(filled(64)).min(1);

/**
 * Spec 2026-11-18-tananyag-gyartas-minoseg (S1b): a blokk által megjelenített forrás-vizuális tétel azonosítója (a térkép leltárából).
 * Engedékeny: a hibás alakú érték (nem szöveg, üres, 12 karakternél hosszabb) elmarad — formai hiba nem indít fizetős javítókört; a
 * hivatkozás érvényességét a fedettségmérő ítéli meg (csak a leltárban létező azonosító számít).
 */
const sourceVisualId = z.string().trim().min(1).max(12).optional().catch(undefined);

const explainBlock = z.object({
  kind: z.literal("explain"),
  text: filled(LESSON_TEXT_LIMITS.explain),
  depth: z.enum(EXPLAIN_DEPTHS),
  readAloud: z.boolean().default(true),
  coversConceptIds,
});

const exampleBlock = z.object({
  kind: z.literal("example"),
  problem: filled(LESSON_TEXT_LIMITS.problem),
  steps: z.array(filled(LESSON_TEXT_LIMITS.step)).min(1),
  answer: filled(LESSON_TEXT_LIMITS.answer),
  coversConceptIds,
  sourceVisualId,
});

const animateBlock = z.object({
  kind: z.literal("animate"),
  animKind: z.enum(ANIM_KINDS),
  params: z.record(z.unknown()),
  caption: filled(LESSON_TEXT_LIMITS.caption),
  coversConceptIds,
  sourceVisualId,
});

/**
 * A question with feedback written for every option, not just the right one.
 *
 * Wrong answers are where the teaching happens, so an option without its own feedback
 * is treated as an incomplete block rather than a cosmetic omission.
 */
const checkBlock = z.object({
  kind: z.literal("check"),
  question: filled(LESSON_TEXT_LIMITS.question),
  options: z.array(filled(LESSON_TEXT_LIMITS.option)).min(2).max(5),
  correctIndex: z.number().int().min(0),
  feedbackPerOption: z.array(filled(LESSON_TEXT_LIMITS.feedback)),
  hint: filled(LESSON_TEXT_LIMITS.hint).optional(),
  coversConceptIds,
  sourceVisualId,
});

const tryBlock = z.object({
  kind: z.literal("try"),
  tryKind: z.enum(TRY_KINDS),
  spec: z.record(z.unknown()),
  coversConceptIds,
  sourceVisualId,
});

/**
 * The one block that may stand without a concept: a recap restates the lesson's own
 * content, so it introduces no new claim to trace.
 */
const recapBlock = z.object({
  kind: z.literal("recap"),
  bullets: z.array(filled(LESSON_TEXT_LIMITS.bullet)).min(1),
  nextLessonId: filled(64).optional(),
});

/**
 * Cross-field rules live here rather than on the check object itself, because
 * `z.discriminatedUnion` only accepts plain object schemas as members — a refined
 * member arrives as ZodEffects and the discriminator lookup fails at runtime.
 */
const blockUnion = z.discriminatedUnion("kind", [
  explainBlock,
  exampleBlock,
  animateBlock,
  checkBlock,
  tryBlock,
  recapBlock,
]);
function refineBlock(block: z.infer<typeof blockUnion>, ctx: z.RefinementCtx): void {
  {
    if (block.kind === "animate" && block.animKind === "sourceImage") {
      const parsed = sourceImageParamsSchema.safeParse(block.params);
      if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ["params", ...issue.path] });
      return;
    }
    if (block.kind === "animate" && (block.animKind === "triangleArea" || block.animKind === "decisionStory")) {
      const parsed = (block.animKind === "triangleArea" ? triangleAreaLabParamsSchema : decisionStoryParamsSchema).safeParse(block.params);
      if (!parsed.success) for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ["params", ...issue.path] });
      }
      return;
    }
    if (block.kind === "check") {
      if (block.feedbackPerOption.length !== block.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["feedbackPerOption"],
          message: "Minden válaszlehetőséghez tartoznia kell visszajelzésnek.",
        });
      }
      if (block.correctIndex >= block.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctIndex"],
          message: "A helyes válasz indexe a válaszlehetőségeken kívülre mutat.",
        });
      }
      return;
    }

    if (block.kind !== "try") return;
    const spec = block.spec;
    const asStrings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

    if (block.tryKind === "dragSort") {
      const items = asStrings(spec.items);
      const correctOrder = asStrings(spec.correctOrder);
      if (items.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["spec", "items"],
          message: "A sorrendezőnek legalább két eleme legyen.",
        });
      }
      if (correctOrder.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["spec", "correctOrder"],
          message: "A sorrendezőhöz meg kell adni a helyes sorrendet.",
        });
      } else if (items.length > 0 && correctOrder.length !== items.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["spec", "correctOrder"],
          message: "A helyes sorrend hossza egyezzen az elemek számával.",
        });
      }
      return;
    }

    if (block.tryKind === "fillBlank") {
      const text = typeof spec.text === "string" ? spec.text : "";
      const answers = asStrings(spec.answers);
      const blanks = (text.match(/___+/g) ?? []).length;
      if (blanks < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["spec", "text"],
          message: "A kitöltős szövegben legyen legalább egy ___ helyőrző.",
        });
      }
      if (answers.length !== blanks) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["spec", "answers"],
          message: "Annyi helyes válasz kell, ahány üres hely van a szövegben.",
        });
      }
      return;
    }

    if (block.tryKind === "match") {
      const pairs = Array.isArray(spec.pairs) ? spec.pairs : [];
      const valid = pairs.filter(
        (p): p is { left: string; right: string } =>
          !!p &&
          typeof p === "object" &&
          typeof (p as { left?: unknown }).left === "string" &&
          typeof (p as { right?: unknown }).right === "string" &&
          (p as { left: string }).left.trim().length > 0 &&
          (p as { right: string }).right.trim().length > 0,
      );
      // Spec 2026-09-30 (U2, H35 — job 986b7f82: 1/2, 2/4 és 3/6 több párosítást engedett): egy bal elemhez pontosan egy
      // jobb tartozzon és fordítva — ismétlődő (vagy értékazonos számú) oldal többértelmű feladat.
      // Review #160: az értékazonos számoldal (1/2, 2/4, 3/6) is egy kulcs — a szöveg-normalizálás ezt nem fogta meg.
      const sideKey = (s: string) => {
        const parsed = parseReferenceExpression(s.trim());
        return parsed.valid && parsed.value !== null ? `#${parsed.value}` : s.normalize("NFC").trim().toLocaleLowerCase("hu").replace(/\s+/g, " ");
      };
      const lefts = valid.map((p) => sideKey(p.left)), rights = valid.map((p) => sideKey(p.right));
      if (new Set(lefts).size !== lefts.length || new Set(rights).size !== rights.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["spec", "pairs"], message: "A párosító többértelmű: minden bal és minden jobb elem egyszer szerepeljen, hogy pontosan egy helyes párosítás legyen." });
      }
      if (valid.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["spec", "pairs"],
          message: "A párosítónak legalább egy érvényes párja legyen.",
        });
      }
    }
  }
}
export const blockSchema = blockUnion.superRefine(refineBlock);
/**
 * A blokk BŐVÍTÉS ELŐTTI sémája (a főágéval azonos): nincs `sourceVisualId` mező (a kéretlen mezőt a séma némán levágja), és az
 * ábrafajta a régi felsorolásból való. A mezők sorrendje — így a hibák sorrendje is — változatlan. Csak a `modelBlockSchema` /
 * `modelLessonSchema` adja ki: a forrás vizuális leltárának funkciókapcsolója KI állapotában a MODELL KIMENETÉT ez méri.
 */
const legacyBlockSchema = z.discriminatedUnion("kind", [
  explainBlock,
  exampleBlock.omit({ sourceVisualId: true }),
  animateBlock.omit({ sourceVisualId: true }).extend({ animKind: legacyAnimKindSchema }),
  checkBlock.omit({ sourceVisualId: true }),
  tryBlock.omit({ sourceVisualId: true }),
  recapBlock,
]).superRefine(refineBlock);

export const sectionSchema = z.object({
  heading: filled(LESSON_TEXT_LIMITS.heading),
  /** Spec 2026-09-20: a tervező által választott fejezet-emoji (a cím és a haladásjelző előtt). */
  emoji: z.string().trim().min(1).max(8).optional(),
  blocks: z.array(blockSchema).min(1),
  /** Whether the section ends with a Próba (the LS-3 coupon trigger). */
  probaEnabled: z.boolean().default(true),
});

export const misconceptionSchema = z.object({
  conceptId: filled(64),
  text: filled(1000),
});

export const lessonSchema = z.object({
  /** Optional only for backwards compatibility; all new jobs require this layer. */
  experience: experienceSchema.optional(),
  title: filled(255),
  subject: filled(120),
  /** 0-12, matching shared/classrooms.ts. */
  classroom: z.number().int().min(0).max(12),
  mapId: filled(64),
  sections: z.array(sectionSchema).min(1),
  misconceptions: z.array(misconceptionSchema).default([]),
  /** U3 (C14): a tanár kérésének forrásból nem igazolható pontjai — nem tanítjuk, a tanárnak jelezzük (nem néma kihagyás). */
  gaps: z.array(z.object({ id: filled(64), point: filled(300), reason: filled(300) })).max(60).optional(),
  /**
   * D1 flag. Literal true: a lesson cannot even be parsed while claiming it drew on
   * anything beyond the curated source.
   */
  sourceOnly: z.literal(true),
  /** Ikonkészlet (2026-10-17-websuli-ikonkeszlet): mentéskor a szerver írja; a tantárgy × sáv ikon a design_assets táblából. */
  art: z.object({
    subjectIcon: z.string().regex(/^[a-z0-9-]{3,64}$/).optional(),
    /** Lecke megnyitása (2026-10-17-lecke-betoltes): a mentéskor választott hős- vagy borítókép és kabala. */
    picture: z.string().regex(/^[a-z0-9-]{3,64}$/).optional(),
    mascot: z.string().regex(/^[a-z0-9-]{3,64}$/).optional(),
    /** Arculati bank (2026-10-17-arculati-bank): a lecke témakörkulcsa (shared/topic-taxonomy.ts). */
    topic: z.string().regex(/^[a-z0-9-]{2,64}$/).optional(),
  }).strict().optional(),
  /**
   * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (5. szakasz 2. pont): a változatossági kapcsolóval gyártott lecke jelölője —
   * mentéskor KIZÁRÓLAG a szerver írja (a modell kimenetének sémája elhagyja). Engedékeny: hibás alak → elhagyva, a lecke olvasható.
   */
  variety: z.object({ version: z.string().trim().min(1).max(40) }).passthrough().optional().catch(undefined),
});

// S5a: a bővítés előtti séma a főághoz híven a `variety` kulcsot sem ismeri (a modell kéretlen jelölője elhagyódik). A BE ág a teljes
// `lessonSchema` (azonosság-őr: tests/source-visuals-flag.test.ts) — ott a jelölőt a mentés határa (`withVarietyMarker`) írja felül.
const legacyLessonSchema = lessonSchema.extend({ sections: z.array(sectionSchema.extend({ blocks: z.array(legacyBlockSchema).min(1) })).min(1) }).omit({ variety: true });
/**
 * A MODELL KIMENETÉNEK sémája (szerzői lecke, ábrafolt blokkja, fogalomjavítás, leckejavítás). `sourceVisuals`: a forrás vizuális
 * leltárának funkciókapcsolója (spec 2026-11-18-tananyag-gyartas-minoseg, 5. szakasz 14. pont) — BE: a teljes séma; KI: a bővítés
 * előtti séma, vagyis a kimenet elfogadása, a levágott mezők és a hibaüzenetek (tartalom ÉS sorrend) a kapcsoló előttivel azonosak.
 * A tárolt leckét OLVASNI mindig a teljes `lessonSchema`-val kell.
 */
export function modelLessonSchema(sourceVisuals: boolean): z.ZodType<z.infer<typeof lessonSchema>, z.ZodTypeDef, unknown> {
  return sourceVisuals ? lessonSchema : legacyLessonSchema;
}
export function modelBlockSchema(sourceVisuals: boolean): z.ZodType<z.infer<typeof blockSchema>, z.ZodTypeDef, unknown> {
  return sourceVisuals ? blockSchema : legacyBlockSchema;
}

export type Block = z.infer<typeof blockSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Misconception = z.infer<typeof misconceptionSchema>;
export type Lesson = z.infer<typeof lessonSchema>;

/** Every concept id the lesson claims to teach, deduplicated. */
export function conceptIdsOf(lesson: Lesson): string[] {
  const ids = new Set<string>();
  for (const section of lesson.sections) {
    for (const block of section.blocks) {
      if (block.kind === "recap") continue;
      for (const id of block.coversConceptIds) ids.add(id);
    }
  }
  return [...ids];
}
