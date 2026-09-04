/**
 * Client-side re-exports of the Studio pipeline's shared types.
 *
 * The pipeline types live with the server (server/studio/step-io.ts) because that is
 * where they are validated; the client imports them through this barrel so components
 * never reach into server code directly. Values that are computed on the server
 * (coverage percentages) are NOT recomputed from server code here — OutlineReview
 * mirrors the formula locally with a comment pointing at the original.
 */

export type {
  LessonOutline,
  OutlineSection,
  OutlineCoverage,
} from "../server/studio/step-io";
