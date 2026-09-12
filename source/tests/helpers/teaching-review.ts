import { teachingReviewEvidence, TEACHING_REVIEW_CHECKS } from "../../server/studio/web-teaching-review";
/** Synthetic storage-contract evidence; never a pedagogical acceptance result. */
export const syntheticTeachingReviewEvidence = (html: string, sources: { url: string; title: string }[]) => teachingReviewEvidence(html,
  sources.map(source => ({ ...source, text: "Szintetikus forrásszöveg, kizárólag a tárolási szerződés tesztjéhez." })),
  { checks: TEACHING_REVIEW_CHECKS.map(criterion => ({ criterion, passed: true, evidence: "Szintetikus lektori válasz a tárolási szerződés ellenőrzéséhez." })) });
