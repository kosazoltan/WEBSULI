import { z } from "zod";

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
] as const;

/** Hands-on interactions (LS-4 implements them). */
export const TRY_KINDS = ["dragSort", "fillBlank", "match"] as const;

/** A hat érvényes blokk-kind — a blockSchema discriminated unionjával szinkronban. */
export const BLOCK_KINDS = ["explain", "example", "animate", "check", "try", "recap"] as const;

export const EXPLAIN_DEPTHS = ["core", "deeper", "why"] as const;

export const AGE_BANDS = ["kid", "teen", "senior"] as const;

export type AnimKind = (typeof ANIM_KINDS)[number];
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

const explainBlock = z.object({
  kind: z.literal("explain"),
  text: filled(4000),
  depth: z.enum(EXPLAIN_DEPTHS),
  readAloud: z.boolean().default(true),
  coversConceptIds,
});

const exampleBlock = z.object({
  kind: z.literal("example"),
  problem: filled(2000),
  steps: z.array(filled(1000)).min(1),
  answer: filled(1000),
  coversConceptIds,
});

const animateBlock = z.object({
  kind: z.literal("animate"),
  animKind: z.enum(ANIM_KINDS),
  params: z.record(z.unknown()),
  caption: filled(500),
  coversConceptIds,
});

/**
 * A question with feedback written for every option, not just the right one.
 *
 * Wrong answers are where the teaching happens, so an option without its own feedback
 * is treated as an incomplete block rather than a cosmetic omission.
 */
const checkBlock = z.object({
  kind: z.literal("check"),
  question: filled(1000),
  options: z.array(filled(500)).min(2).max(5),
  correctIndex: z.number().int().min(0),
  feedbackPerOption: z.array(filled(1000)),
  hint: filled(1000).optional(),
  coversConceptIds,
});

const tryBlock = z.object({
  kind: z.literal("try"),
  tryKind: z.enum(TRY_KINDS),
  spec: z.record(z.unknown()),
  coversConceptIds,
});

/**
 * The one block that may stand without a concept: a recap restates the lesson's own
 * content, so it introduces no new claim to trace.
 */
const recapBlock = z.object({
  kind: z.literal("recap"),
  bullets: z.array(filled(500)).min(1),
  nextLessonId: filled(64).optional(),
});

/**
 * Cross-field rules live here rather than on the check object itself, because
 * `z.discriminatedUnion` only accepts plain object schemas as members — a refined
 * member arrives as ZodEffects and the discriminator lookup fails at runtime.
 */
export const blockSchema = z
  .discriminatedUnion("kind", [
    explainBlock,
    exampleBlock,
    animateBlock,
    checkBlock,
    tryBlock,
    recapBlock,
  ])
  .superRefine((block, ctx) => {
    if (block.kind !== "check") return;
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
  });

export const sectionSchema = z.object({
  heading: filled(255),
  blocks: z.array(blockSchema).min(1),
  /** Whether the section ends with a Próba (the LS-3 coupon trigger). */
  probaEnabled: z.boolean().default(true),
});

export const misconceptionSchema = z.object({
  conceptId: filled(64),
  text: filled(1000),
});

export const lessonSchema = z.object({
  title: filled(255),
  subject: filled(120),
  /** 0-12, matching shared/classrooms.ts. */
  classroom: z.number().int().min(0).max(12),
  mapId: filled(64),
  sections: z.array(sectionSchema).min(1),
  misconceptions: z.array(misconceptionSchema).default([]),
  /**
   * D1 flag. Literal true: a lesson cannot even be parsed while claiming it drew on
   * anything beyond the curated source.
   */
  sourceOnly: z.literal(true),
});

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
