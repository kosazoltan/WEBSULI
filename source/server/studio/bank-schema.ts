import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { METHOD_KINDS } from "../../shared/lesson-experience";
import type { ResponseFormatJsonSchema } from "../ai/AIProvider";

/**
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (U2, C8): a bankcsomag SZIGORÚ JSON-sémája a szolgáltatónak (OpenAI
 * Structured Outputs, `strict: true`). Mért ok (H3): a darabszám/alak-hiba volt a leggyakoribb bukott bankkísérlet;
 * élő próba (2026-09-30, `evidence-so-probe.txt`): a közvetlen OpenAI-út a `minItems/maxItems`-t kikényszeríti.
 *
 * Miért külön tükör-séma és nem a `lesson-experience.ts` Zod-sémája: a szolgáltatói szigorú mód nem fogad `.optional()`-t
 * (csak `.nullable()`), `.refine/.superRefine/.transform`-ot, mintát (regex) és a hívónként változó darabszámot a
 * sémában kell megadni. A tartalmi ellenőrzés (ismétlődés, pontozó, kötés) változatlanul a helyi `validate` dolga —
 * a szigorú séma az ALAKOT garantálja, az igazságot nem (Astra 6. kör).
 *
 * Csak az igazoltan támogató úton használjuk (közvetlen OpenAI: luna/terra); tartalék úton a JSON-mód + helyi validálás marad.
 */

const text = (max: number) => z.string().min(1).max(max);
const ids = z.array(z.string().min(1).max(64)).min(1);

const strictMethod = z.object({
  id: text(64), sectionIndex: z.number().int().min(0), coversConceptIds: ids, kind: z.enum(METHOD_KINDS),
  title: text(120), prompt: text(1500), answer: text(2000),
  options: z.array(text(500)).min(2).max(4).nullable(), correctIndex: z.number().int().min(0).nullable(),
  steps: z.array(text(500)).min(2).max(8).nullable(),
});
const strictTypedAnswer = z.object({
  part: text(40), kind: z.enum(["number", "fraction", "expression"]), value: text(120),
  unit: text(24).nullable(), form: z.enum(["any", "simplified-fraction", "decimal", "intermediate-step"]).nullable(),
});
const strictDistinct = z.object({ category: text(80), from: z.array(z.array(text(160)).min(1)).min(1).max(20), count: z.number().int().min(1).max(10) });
const strictTask = z.object({
  id: text(64), sectionIndex: z.number().int().min(0), coversConceptIds: ids, q: text(1500),
  required: z.array(z.array(text(160)).min(1)).min(1), bonus: z.array(z.array(text(160)).min(1)),
  minWords: z.number().int().min(1).max(100), needsSentence: z.boolean(), sample: text(2000), mode: z.enum(["written", "oral"]),
  typedAnswers: z.array(strictTypedAnswer).min(1).max(8).nullable(), requiredDistinct: z.array(strictDistinct).min(1).max(6).nullable(),
});
const strictQuiz = z.object({
  id: text(64), sectionIndex: z.number().int().min(0), coversConceptIds: ids, question: text(1500),
  options: z.array(text(500)).min(3).max(4), correctIndex: z.number().int().min(0).max(3), feedbackPerOption: z.array(text(1000)).min(3).max(4),
  intent: z.enum(["recall", "apply"]),
});
const strictGlossary = z.object({ word: text(160), translation: text(300), partOfSpeech: text(80), example: text(500), exampleTranslation: text(500) });

export type BankPacketCounts = {
  /** Kötelező módszerek száma (methodKinds hossza). */
  methodMin: number;
  /** Feladat és kvíz: pontosan a cél (target) — a program a Count alatt elutasít, a target fölött vág. */
  taskCount: number; taskMax: number; quizCount: number; quizMax: number;
  /** Nyelvi leckénél kötelező a szószedet. */
  language: boolean;
};

/** TELJES csomag (első kísérlet és teljes újraírás). */
export function strictPacketSchema(c: BankPacketCounts) {
  return z.object({
    methods: z.array(strictMethod).min(Math.max(1, c.methodMin)).max(20),
    tasks: z.array(strictTask).min(c.taskCount).max(c.taskMax),
    quiz: z.array(strictQuiz).min(c.quizCount).max(c.quizMax),
    glossary: z.array(strictGlossary).min(c.language ? 1 : 0).max(30),
  });
}
/** JAVÍTÓ lista (ID-alapú tételcsere): a tömbök üresek is lehetnek, csak a javított tételek jönnek vissza. */
export const strictPatchSchema = z.object({
  methods: z.array(strictMethod).max(20), tasks: z.array(strictTask).max(45), quiz: z.array(strictQuiz).max(75), glossary: z.array(strictGlossary).max(30),
});

/** A szolgáltatónak adott `response_format` (json_schema, strict). `patch`: javító lista, különben teljes csomag. */
export function bankResponseFormat(counts: BankPacketCounts, patch: boolean): ResponseFormatJsonSchema {
  const rf = zodResponseFormat(patch ? strictPatchSchema : strictPacketSchema(counts), patch ? "bank_packet_patch" : "bank_packet");
  // Az SDK segédje saját (parse-képes) osztályt ad; a szolgáltatónak csak a sima JSON-alak megy.
  return { type: "json_schema", json_schema: { name: rf.json_schema.name, strict: rf.json_schema.strict ?? true, schema: rf.json_schema.schema as Record<string, unknown> } };
}

/** A szigorú séma `null`-jai a helyi séma szempontjából hiányzó mezők: visszaalakítás a normál (optional) alakra. */
export function normalizeStrictPacket(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const strip = (item: unknown): unknown => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (v === null) continue;
      out[k] = k === "typedAnswers" && Array.isArray(v) ? v.map(strip) : v;
    }
    return out;
  };
  const p = json as Record<string, unknown>;
  const out: Record<string, unknown> = { ...p };
  for (const bank of ["methods", "tasks", "quiz", "glossary"] as const) if (Array.isArray(p[bank])) out[bank] = (p[bank] as unknown[]).map(strip);
  return out;
}
