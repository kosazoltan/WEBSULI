import type { AgeBand } from "./lesson-schema";

/**
 * LS-9 — the age-band visual system, data side.
 *
 * The COLOUR and FONT tokens live in `lesson-theme.css` under `[data-band="…"]` (CSS owns
 * paint; Tailwind's content scan does not cover shared/, so utility class names here would
 * never be emitted — measured). This module owns the block-header labels, sizes, and
 * the register the author model must write in. It is DOM-free so `node:test` can pin it
 * without jsdom, and it is shared with the server prompt builder for the same reason.
 *
 * Owner decision 2026-09-06: variant "C · divergent" from the LS-9 board — a dark stage
 * for all three bands, each with its own accent and character (kid: sunny yellow glow on
 * navy; teen: cyan on midnight with mono labels; senior: sky-blue editorial on graphite
 * with a ruled background and serif headings).
 */

export type BandTheme = {
  /** Labels shown on block headers, in the band's own voice. */
  labels: { explain: string; example: string; check: string; recap: string; progress: string };
  /** Body / heading size classes (the LS-2 sizes, kept). */
  body: string;
  heading: string;
};

/** More precise presentation groups without changing the legacy content register. */
export function learningAgeGroup(classroom: number): "1-2" | "3-4" | "5-6" | "7-8" | "9+" {
  if (classroom === 0) return "7-8"; // Programming has no primary-school grade.
  if (classroom <= 2) return "1-2";
  if (classroom <= 4) return "3-4";
  if (classroom <= 6) return "5-6";
  if (classroom <= 8) return "7-8";
  return "9+";
}

export const BAND_THEME: Record<AgeBand, BandTheme> = {
  kid: {
    labels: { explain: "Nézd csak!", example: "Csináljuk együtt", check: "Te jössz!", recap: "Ezt már tudod", progress: "Hol járunk?" },
    body: "text-lg leading-relaxed",
    heading: "text-2xl font-extrabold",
  },
  teen: {
    labels: { explain: "Magyarázat", example: "Példa", check: "Kérdés", recap: "Összefoglaló", progress: "Haladás" },
    body: "text-base leading-relaxed",
    heading: "text-xl font-bold",
  },
  senior: {
    labels: { explain: "Magyarázat", example: "Kidolgozott példa", check: "Ellenőrző kérdés", recap: "Összegzés", progress: "Szakaszok" },
    body: "text-base leading-normal",
    heading: "text-xl font-semibold",
  },
};

/**
 * The register line injected into the author prompt (English: inter-agent language).
 * One sentence per band, concrete enough to change the output, short enough to not
 * dilute the D1/grounding rules that follow it.
 */
export function bandRegisterForPrompt(band: AgeBand): string {
  switch (band) {
    case "kid":
      return "Register: short sentences (max ~12 words), concrete everyday images, second person, one idea per block, playful but never babyish; every section should get an animate or try block if the content allows.";
    case "teen":
      return "Register: clear and direct, real-world hooks, precise terms defined on first use, no talking down; prefer an animate or try block per section where the content allows.";
    case "senior":
      return "Register: precise academic Hungarian, formal definitions, cause-and-effect reasoning, exam-style examples; animate/try blocks where they clarify a mechanism.";
  }
}
