import { z } from "zod";
import { CATALOG_SUBJECTS, LESSON_TYPES, LESSON_TYPE_LABELS, SUBJECT_LABELS, type CatalogSubject, type LessonType } from "../../shared/catalog-taxonomy";
import { withSupportSkill } from "../studio/support-skills";
import type { CatalogItemDraft } from "./catalog-item";

/**
 * Spec 2026-10-05-s2-tartalom-besorolas: egy lecke tantárgya, ága, évfolyama, témája és típusa a TARTALOM alapján (nem a cím
 * alapján). Olcsó modell a `catalog-classifier` szerep skilljével; a válasz zod-validált, a taxonómián kívüli érték NEM
 * kerül be (tartalék modell, végül `unclassified`).
 */
export type ClassificationInput = {
  provenance: string;
  title: string;
  /** A lecke saját évfolyam-mezője (0 vagy null = nincs megadva). */
  classroom: number | null;
  headings: string[];
  teachingText: string;
  sampleItems: string[];
};

/**
 * Mért (pilot 2026-10-05): a merev séma egy HELYES besorolást is eldobott, mert az indoklás 300 karakternél hosszabb volt, és a
 * tantárgykulcs olykor ékezetesen jön („történelem”). A kulcs determinisztikusan normalizálódik (ékezet le, szóköz → kötőjel),
 * de CSAK pontos kulcsra illeszt — nincs találgatás/szinonima. A nem kritikus szöveg-mezők levágódnak, nem buktatnak.
 */
const keyOf = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_]+/g, "-") : v);
const clip = (max: number) => z.preprocess((v) => (typeof v === "string" ? v.trim().slice(0, max) : v), z.string().min(2).max(max));
export const classificationSchema = z.object({
  subject: z.preprocess(keyOf, z.enum(CATALOG_SUBJECTS)),
  secondarySubjects: z.preprocess((v) => (Array.isArray(v) ? v.map(keyOf).filter((x) => (CATALOG_SUBJECTS as readonly unknown[]).includes(x)) : v), z.array(z.enum(CATALOG_SUBJECTS)).transform((a) => [...new Set(a)].slice(0, 3)).default([])),
  grade: z.number().int().min(1).max(12).nullable(),
  topicArea: clip(80),
  topic: clip(80),
  lessonType: z.preprocess(keyOf, z.enum(LESSON_TYPES)),
  confidence: z.preprocess(keyOf, z.enum(["high", "medium", "low"])),
  evidence: clip(300),
});
export type Classification = z.infer<typeof classificationSchema>;

/**
 * A besoroló modell-listája (tulajdonosi kérdés 2026-10-05: „a deepseek v4.1 flash-t és a glm 5.3 flash-t használod?”).
 * Mért (pilot): a glm-5.3-flash 4/10-szer adott használhatatlan választ (érvénytelen JSON, ill. `{"answer": {...}}` burok), a
 * deepseek-v4-flash 1/10-szer szolgáltatói hibát. A konszenzus-pár a glm-5.3-flash és az újabb deepseek-v4.1-flash
 * (OpenRouteren 2026-09-10 óta elérhető, élő listával ellenőrizve); a deepseek-v4-flash harmadik tartalék.
 */
export const CLASSIFIER_MODELS = ["z-ai/glm-5.3-flash", "deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4-flash"] as const;

const TEXT_BUDGET = 2500;
const SAMPLE_ITEMS = 12;

/** A lecke kinyert tételeiből a besorolás bemenete (fejezetcímek, tanítás-szöveg eleje, tétel-minták a lecke egészéből). */
export function classificationInput(items: Array<CatalogItemDraft & { lessonTitle: string; classroom: number | null }>): ClassificationInput {
  const first = items[0];
  const sections = items.filter((i) => i.kind === "section");
  const others = items.filter((i) => i.kind !== "section");
  // a minta a lecke elejéből, közepéből és végéből (nem csak az elejéről — „lost in the middle” ellen)
  // Review #189: egyenletes indexelés az első ÉS az utolsó tétellel (a lecke végén álló módszer-tételek is bekerülnek).
  const n = Math.min(SAMPLE_ITEMS, others.length);
  const picked = n <= 1 ? others.slice(0, n) : Array.from({ length: n }, (_, k) => others[Math.round((k * (others.length - 1)) / (n - 1))]);
  const sampleItems = picked.map((i) => `${i.kind}: ${i.prompt.slice(0, 160)}${i.options ? ` [${i.options.slice(0, 4).join(" | ").slice(0, 160)}]` : ""}`);
  let teachingText = "";
  for (const s of sections) { if (teachingText.length >= TEXT_BUDGET) break; teachingText += `${s.prompt}: ${s.body ?? ""}\n`; }
  return {
    provenance: first?.provenance ?? "",
    title: first?.lessonTitle ?? "",
    classroom: first?.classroom ?? null,
    headings: [...new Set(sections.map((s) => s.prompt).filter((h) => h && h !== "(cím nélkül)"))].slice(0, 25),
    teachingText: teachingText.slice(0, TEXT_BUDGET),
    sampleItems,
  };
}

export function buildClassificationPrompt(input: ClassificationInput): { system: string; user: string } {
  const system = withSupportSkill("catalog-classifier", [
    "Egy magyar iskolai tananyag (lecke) besorolását végzed a TARTALMA alapján. A cím csak segítség, a tartalom dönt.",
    "Tantárgyak (pontosan az egyik kulcs; minden ág KÜLÖN — pl. biológia ≠ kémia ≠ fizika ≠ földrajz):",
    ...CATALOG_SUBJECTS.map((s) => `- ${s}: ${SUBJECT_LABELS[s as CatalogSubject]}`),
    "Lecketípusok (pontosan az egyik kulcs):",
    ...LESSON_TYPES.map((t) => `- ${t}: ${LESSON_TYPE_LABELS[t as LessonType]}`),
    'Kimenet KIZÁRÓLAG JSON: { "subject": kulcs, "secondarySubjects": [kulcs…], "grade": szám 1–12 vagy null, "topicArea": rövid témakör, "topic": rövid téma (≤ 8 szó), "lessonType": kulcs, "confidence": "high"|"medium"|"low", "evidence": rövid indoklás a TARTALOMBÓL (≤ 300 karakter) }',
  ].join("\n"));
  const user = [
    `Cím: ${input.title}`,
    input.classroom && input.classroom > 0 ? `Megadott évfolyam (ezt add vissza): ${input.classroom}` : "Évfolyam nincs megadva — a tartalomból becsüld, vagy null.",
    `Fejezetcímek: ${input.headings.join(" | ") || "(nincs)"}`,
    `Tanítás-szöveg (eleje):\n${input.teachingText || "(nincs)"}`,
    `Tétel-minták (a lecke egészéből):\n${input.sampleItems.join("\n") || "(nincs)"}`,
  ].join("\n\n");
  return { system, user };
}

/** A válasz ellenőrzése; a megadott évfolyam-mező elsőbbséget kap. */
export function parseClassification(json: unknown, input: ClassificationInput): Classification {
  // Mért (pilot): a modell néha egyetlen kulcs alá csomagolja a teljes választ (`{"answer": {...}}`) — determinisztikus kibontás.
  const entries = json && typeof json === "object" && !Array.isArray(json) ? Object.entries(json as Record<string, unknown>) : [];
  const inner = entries.length === 1 && entries[0][1] && typeof entries[0][1] === "object" && "subject" in (entries[0][1] as object) ? entries[0][1] : json;
  const parsed = classificationSchema.parse(inner);
  return { ...parsed, grade: input.classroom && input.classroom > 0 ? input.classroom : parsed.grade, secondarySubjects: parsed.secondarySubjects.filter((s) => s !== parsed.subject) };
}

export type ClassifyCall = (model: string, system: string, user: string) => Promise<{ json: unknown; usage?: { promptTokens?: number; completionTokens?: number } }>;
export type ClassifyResult =
  | { ok: true; classification: Classification; model: string; usage: { promptTokens: number; completionTokens: number } }
  | { ok: false; reason: string; usage: { promptTokens: number; completionTokens: number } };

/** Tartalék-lánc: hibás hívás VAGY érvénytelen válasz → a következő modell; egyik sem → `unclassified` (nem kitalált érték). */
export async function classifyLesson(input: ClassificationInput, models: string[], call: ClassifyCall): Promise<ClassifyResult> {
  const { system, user } = buildClassificationPrompt(input);
  const usage = { promptTokens: 0, completionTokens: 0 };
  const reasons: string[] = [];
  for (const model of models) {
    try {
      const res = await call(model, system, user);
      usage.promptTokens += res.usage?.promptTokens ?? 0;
      usage.completionTokens += res.usage?.completionTokens ?? 0;
      return { ok: true, classification: parseClassification(res.json, input), model, usage };
    } catch (error) {
      // a kapott érték is a naplóba (a pilot hibájánál csak a levágott zod-üzenet látszott)
      const issues = error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (error instanceof Error ? error.message : String(error));
      reasons.push(`${model}: ${issues.slice(0, 300)}`);
    }
  }
  return { ok: false, reason: `unclassified — ${reasons.join(" | ")}`, usage };
}

export type ConsensusResult =
  | { status: "agreed"; classification: Classification; models: string[]; usage: { promptTokens: number; completionTokens: number } }
  | { status: "review"; candidates: Array<{ model: string; classification: Classification }>; reason: string; usage: { promptTokens: number; completionTokens: number } }
  | { status: "unclassified"; reason: string; usage: { promptTokens: number; completionTokens: number } };

/**
 * Self-consistency (pilot-lelet 2026-10-05: ugyanarra a leckére a modell futásonként más tantárgyat adhat — az emberré válás
 * egyszer „tortenelem”, egyszer „termeszetismeret”). A tantárgy dönti el a bank-tagságot, ezért KÉT független modell kell:
 * egyező tantárgy → `agreed` (a lecketípus eltérésénél az első modellé, jelölve); eltérő → `review` (admin-átnézés, S3);
 * csak az egyik ad érvényes választ → `review`; egyik sem → `unclassified`. Kitalált/egyoldalú döntés nincs.
 */
export async function classifyWithConsensus(input: ClassificationInput, models: string[], call: ClassifyCall): Promise<ConsensusResult> {
  const usage = { promptTokens: 0, completionTokens: 0 };
  const got: Array<{ model: string; classification: Classification }> = [];
  const reasons: string[] = [];
  // Két KÜLÖNBÖZŐ modell érvényes ítélete kell; hibás válasz/szolgáltatói hiba esetén a következő modell lép be.
  for (const model of [...new Set(models)]) {
    if (got.length >= 2) break;
    const r = await classifyLesson(input, [model], call);
    usage.promptTokens += r.usage.promptTokens; usage.completionTokens += r.usage.completionTokens;
    if (r.ok) got.push({ model, classification: r.classification }); else reasons.push(r.reason);
  }
  if (got.length === 0) return { status: "unclassified", reason: reasons.join(" | "), usage };
  if (got.length === 1) return { status: "review", candidates: got, reason: `csak egy modell adott érvényes választ — ${reasons.join(" | ")}`, usage };
  let [a, b] = got;
  if (a.classification.subject !== b.classification.subject) {
    // Review #189 (spec S2, 2 a 3-ból): eltérő tantárgynál a még nem használt modell dönt; csak ha az egyikkel egyezik, agreed.
    for (const model of [...new Set(models)].filter((m) => !got.some((g) => g.model === m))) {
      const r = await classifyLesson(input, [model], call);
      usage.promptTokens += r.usage.promptTokens; usage.completionTokens += r.usage.completionTokens;
      if (!r.ok) { reasons.push(r.reason); continue; }
      const pair = got.find((g) => g.classification.subject === r.classification.subject);
      if (pair) { [a, b] = [pair, { model, classification: r.classification }]; break; }
      return { status: "review", candidates: [...got, { model, classification: r.classification }], reason: `eltérő tantárgy mindhárom modellnél: ${[...got.map((g) => g.classification.subject), r.classification.subject].join(" / ")}`, usage };
    }
    if (a.classification.subject !== b.classification.subject) return { status: "review", candidates: got, reason: `eltérő tantárgy: ${a.classification.subject} / ${b.classification.subject}`, usage };
  }
  return { status: "agreed", classification: { ...a.classification, ...(a.classification.lessonType !== b.classification.lessonType ? { confidence: "low" as const } : {}) }, models: [a.model, b.model], usage };
}
