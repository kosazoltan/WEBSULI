import { z } from "zod";
import { createHash } from "node:crypto";
import { readHtmlLessonData } from "../../shared/lesson-html-data";
import { parse, type DefaultTreeAdapterMap } from "parse5";

export type FetchedTeachingSource = { url: string; title: string; text: string };
export class TeachingReviewFailure extends Error {}
export const sourceIsErrorPage = (source: FetchedTeachingSource) => /^(the url .* blocked|access denied|just a moment\.*|web page blocked!?|403 forbidden|404 not found)$/i.test(source.title.trim())
  || /^\s*(block\s+)?Web Page Blocked!/i.test(source.text);
const fetchResult = z.object({ type: z.literal("web_fetch_tool_result"), content: z.object({
  type: z.literal("web_fetch_result"), url: z.string().url(), content: z.object({
    title: z.string().nullish(), source: z.object({ type: z.literal("text"), data: z.string().min(80) }),
  }),
}) });
/** Only provider tool results count as retrieval, never author-written claims about sources. */
export function fetchedTeachingSources(blocks: unknown[]): FetchedTeachingSource[] {
  return blocks.flatMap(block => {
    const parsed = fetchResult.safeParse(block);
    if (!parsed.success) return [];
    const result = parsed.data.content;
    const source = { url: result.url, title: result.content.title ?? result.url, text: result.content.source.data };
    return sourceIsErrorPage(source) ? [] : [source];
  });
}
export const TEACHING_REVIEW_CHECKS = ["source_coverage", "factual_accuracy", "explanation_depth", "question_grounding", "age_and_added_value"] as const;
const issueSchema = z.object({
  criterion: z.enum(TEACHING_REVIEW_CHECKS),
  kind: z.enum(["factual_error", "unsupported_claim", "source_conflict", "missing_explanation", "missing_teaching", "pedagogical_gap"]),
  sectionIndex: z.number().int().min(0).optional(),
  lessonQuote: z.string().trim().min(8).max(600),
  citations: z.array(z.object({ sourceUrl: z.string().url().nullable(), quote: z.string().trim().min(8).max(600) }).strict()).max(3),
  reason: z.string().trim().min(20).max(1000), repair: z.string().trim().min(20).max(1000),
  bankItems: z.array(z.object({ bank: z.enum(["methods", "tasks", "quiz"]), id: z.string().min(1) }).strict()).max(200).optional(),
}).strict();
export const teachingReviewSchema = z.object({ checks: z.array(z.object({
  criterion: z.enum(TEACHING_REVIEW_CHECKS), passed: z.boolean(), evidence: z.string().trim().min(20).max(2000),
})).length(TEACHING_REVIEW_CHECKS.length), issues: z.array(issueSchema).max(30).optional() }).superRefine((r, ctx) => {
  if (new Set(r.checks.map(c => c.criterion)).size !== TEACHING_REVIEW_CHECKS.length) ctx.addIssue({ code: "custom", message: "A tartalmi lektor nem ellenőrizte mind az öt követelményt." });
  if (r.issues && r.checks.some(c => c.passed === r.issues!.some(i => i.criterion === c.criterion))) ctx.addIssue({ code: "custom", message: "A lektori döntés és a hibajegyek ellentmondanak." });
});
export type TeachingReview = z.infer<typeof teachingReviewSchema>;
export function teachingText(html: string): string {
  const walk = (node: DefaultTreeAdapterMap["node"]): string => {
    if ("tagName" in node && ["script", "style", "template"].includes(node.tagName)) return "";
    if ("value" in node) return node.value;
    return "childNodes" in node ? node.childNodes.map(walk).join(" ") : "";
  };
  return walk(parse(html)).replace(/\s+/g, " ").trim();
}
function teachingChapterTexts(html: string): Map<number, string> {
  const chapters = new Map<number, string>();
  const visit = (node: DefaultTreeAdapterMap["node"], inTeaching = false) => {
    if ("tagName" in node && ["script", "style", "template"].includes(node.tagName)) return;
    if ("tagName" in node) {
      inTeaching ||= node.attrs.some(a => a.name === "data-lesson-panel" && a.value === "teaching");
      const section = node.attrs.find(a => a.name === "data-teaching-section")?.value;
      const location = node.sourceCodeLocation;
      if (inTeaching && section !== undefined && location) chapters.set(Number(section), teachingText(html.slice(location.startOffset, location.endOffset)));
    }
    if ("childNodes" in node) node.childNodes.forEach(n => visit(n, inTeaching));
  };
  visit(parse(html, { sourceCodeLocationInfo: true }));
  return chapters;
}
function bankText(item: object): string {
  const fields = new Set(["q", "sample", "question", "options", "feedbackPerOption", "title", "prompt", "answer", "steps"]);
  return Object.entries(item).filter(([key]) => fields.has(key)).flatMap(([, value]) => typeof value === "string" ? [value] : Array.isArray(value) ? value.filter(v => typeof v === "string") : []).join(" ");
}
const variantRequestPattern = /(?:összehasonlít|összevet|különbség|eltérés|források?.{0,24}(?:különbség|eltérés|összevet|összehasonlít)|(?:különböző|eltérő)\s+(?:forrás)?változat)/i;
const visibleVariantMarkerPattern = /(?:Homérosz|Apollodórosz).{0,80}(?:szerint|változat|míg|azonban|ellentét)|(?:egyik|másik)\s+(?:forrás-)?változat|forrás szerint|elsődleges forrás|másodlagos forrás|változat szerint|variáns szerint/i;
function sourceVariantComparisonRequested(requestedTopic: string): boolean {
  return variantRequestPattern.test(requestedTopic);
}
function sourceVariantIsVisible(issue: z.infer<typeof issueSchema>): boolean {
  return visibleVariantMarkerPattern.test(issue.lessonQuote);
}
/** Existence is deterministic; relevance and truth still require the independent reviewer. */
export function validateReviewGrounding(review: TeachingReview, html: string, sources: FetchedTeachingSource[], requestedTopic = ""): void {
  if (!review.issues) throw new Error("A lektori hibajegylista hiányzik.");
  // Inline emphasis can introduce a DOM boundary before punctuation ("név ,").
  // Ignore only this rendering whitespace; words and punctuation must still match.
  const normalize = (value: string) => value.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  const bank = readHtmlLessonData(html).experience;
  const lesson = normalize(teachingText(html) + " " + [...bank.methods, ...bank.tasks, ...bank.quiz].map(bankText).join(" "));
  const chapters = teachingChapterTexts(html);
  const errors: string[] = [];
  for (const [i, issue] of review.issues.entries()) {
    if (!lesson.includes(normalize(issue.lessonQuote))) errors.push(`issues[${i}].lessonQuote: az idézet nem található. Másolj egy összefüggő részletet a lessonText vagy egy bankmező szövegéből.`);
    const chapter = issue.sectionIndex === undefined ? undefined : chapters.get(issue.sectionIndex);
    const bankQuote = issue.bankItems?.some(ref => bank[ref.bank].some(item => item.id === ref.id && item.sectionIndex === issue.sectionIndex && normalize(bankText(item)).includes(normalize(issue.lessonQuote))));
    if (!chapter || (!normalize(chapter).includes(normalize(issue.lessonQuote)) && !bankQuote)) errors.push(`issues[${i}].sectionIndex: az idézetet egyetlen meglévő tanítási fejezethez vagy annak megnevezett banktételéhez kösd. A data-teaching-section 0-tól számozott értékét másold.`);
    for (const [j, citation] of issue.citations.entries()) {
      const body = citation.sourceUrl === null ? lesson : sources.find(s => s.url === citation.sourceUrl)?.text;
      if (!body || !normalize(body).includes(normalize(citation.quote))) errors.push(`issues[${i}].citations[${j}]: a bizonyító idézet vagy forrás nem található. Ne illessz be táblázatos | elválasztót; rövidebb pontos részletet másolj.`);
    }
    if (issue.kind === "factual_error" && !issue.citations.length) errors.push(`issues[${i}].kind: a tényhiba bizonyító idézetet igényel; igazolás hiánya unsupported_claim.`);
    if (issue.kind === "source_conflict" && new Set(issue.citations.map(c => c.sourceUrl).filter(Boolean)).size < 2) errors.push(`issues[${i}].kind: source_conflict két tényleges forrást igényel. A tananyag és egy forrás eltérése factual_error vagy unsupported_claim, nem két forrás ellentmondása.`);
    if (issue.criterion === "source_coverage" && issue.kind === "source_conflict"
      && !sourceVariantComparisonRequested(requestedTopic) && !sourceVariantIsVisible(issue)) {
      errors.push(`issues[${i}].scope: a jelöletlen forrásváltozat eltérése nem blokkoló lefedettségi hiány. Csak kért összehasonlítás vagy a tananyagban láthatóan megnevezett változatok esetén használj source_conflict-ot; egyébként távolítsd el a hibajegyet vagy indokold a kért témához tartozó valódi hiányt.`);
    }
    for (const item of issue.bankItems ?? []) if (!bank[item.bank].some(t => t.id === item.id)) errors.push(`issues[${i}].bankItems: nem létező tételazonosító.`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/**
 * Spec 2026-09-19: the two pedagogical criteria are judgement calls that a full re-review
 * re-litigates every round (measured: 4 real web runs, every one ended on these alone after
 * the factual criteria passed). After the bounded repair rounds they become published
 * warnings; factual accuracy, source coverage and question grounding never do.
 */
export const SUBJECTIVE_REVIEW_CRITERIA = ["explanation_depth", "age_and_added_value"] as const;
export function subjectiveOnlyFailures(review: TeachingReview): string[] | null {
  const failed = review.checks.filter(c => !c.passed).map(c => c.criterion);
  return failed.length && failed.every(c => (SUBJECTIVE_REVIEW_CRITERIA as readonly string[]).includes(c)) ? failed : null;
}
export type TeachingReviewEvidence = { version: "web-teaching-review-1"; htmlHash: string; sourceListHash: string; fetchedSourcesHash: string; review: TeachingReview; warnings?: string[] };
export function teachingReviewEvidence(html: string, sources: FetchedTeachingSource[], review: TeachingReview): TeachingReviewEvidence {
  const parsed = teachingReviewSchema.parse(review);
  const warnings = subjectiveOnlyFailures(parsed);
  return { version: "web-teaching-review-1", htmlHash: digest(html), sourceListHash: digest(sources.map(({ url, title }) => ({ url, title }))), fetchedSourcesHash: digest(sources), review: parsed, ...(warnings ? { warnings } : {}) };
}
export function assertTeachingReviewEvidence(html: string, sources: { url: string; title: string }[], evidence?: TeachingReviewEvidence) {
  const review = evidence ? teachingReviewSchema.parse(evidence.review) : undefined;
  const failed = review ? review.checks.filter(c => !c.passed).map(c => c.criterion) : [];
  const acceptedWarnings = failed.length > 0 && failed.every(c => (SUBJECTIVE_REVIEW_CRITERIA as readonly string[]).includes(c) && evidence?.warnings?.includes(c));
  if (!evidence || evidence.version !== "web-teaching-review-1" || evidence.htmlHash !== digest(html) || evidence.sourceListHash !== digest(sources)
    || !/^[a-f0-9]{64}$/.test(evidence.fetchedSourcesHash) || (failed.length > 0 && !acceptedWarnings)) {
    throw new Error("A teljes tananyaghoz és forrásaihoz kötött sikeres tartalmi lektorálás hiányzik vagy elavult.");
  }
}
