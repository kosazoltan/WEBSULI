import { verifyHtmlTeaching, verifyHtmlNavigation } from "./verify-html-teaching";
import { readHtmlLessonData, readRawHtmlLessonData, htmlLessonDataSchema } from "../../shared/lesson-html-data";
import { evaluateOpenAnswer } from "../../shared/lesson-experience-score";
import { lessonLanguage, publicationBankProblems, experiencePacketSchema } from "../../shared/lesson-experience";
import { verifyImprovedHtml, type HtmlVerification } from "./verify-html";
import { ZodError } from "zod";

/** Shape and sample checks, not a substitute for rendering or source review. */
export function verifyLessonMethodHtml(html: string): HtmlVerification {
  const problems = [...verifyImprovedHtml(html).problems, ...verifyHtmlNavigation(html)];
  let data;
  try {
    readRawHtmlLessonData(html, true);
    data = readHtmlLessonData(html);
  } catch (error) {
    if (error instanceof ZodError) {
      for (const issue of error.issues) problems.push(`JSON-bank ${issue.path.join(".") || "gyökér"}: ${issue.message}`);
    } else problems.push(`A fúziós JSON-bank nem olvasható: ${error instanceof Error ? error.message : "érvénytelen JSON"}`);
    // Keep the full-schema error. Shape-valid items can still reveal additional teaching/sample errors.
    try { data = htmlLessonDataSchema.extend({ experience: experiencePacketSchema.innerType() }).parse(readRawHtmlLessonData(html)); }
    catch { /* Invalid item shapes cannot be inspected safely; their schema errors are already reported. */ }
  }
  if (data) {
    problems.push(...publicationBankProblems(data.experience), ...verifyHtmlTeaching(html, data.experience));
    for (const t of data.experience.tasks) if (evaluateOpenAnswer(t.sample, t).score !== 1) problems.push(`${t.id}: a mintaválasz nem kap teljes pontot.`);
    const lang = lessonLanguage(data.subject);
    if (lang && data.experience.language !== lang) problems.push("A nyelvlecke szószedetének/TTS-ének nyelve hiányzik vagy hibás.");
  }
  for (const value of ["teaching", "methods", "tasks", "quiz"]) {
    for (const attr of ["data-lesson-tab", "data-lesson-panel"]) if (!new RegExp(`${attr}\\s*=\\s*["']${value}["']`).test(html)) problems.push(`Hiányzó ${attr}: ${value}.`);
  }
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}
