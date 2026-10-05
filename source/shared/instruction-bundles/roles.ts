/**
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (B0/B5, U0): a modellnek szóló közös szövegek (runbook, tanult szabályok)
 * SZEREPRE szűrve jutnak el a hívásokhoz. Mért ok (H10): a `run-step.ts` minden hívás végére a teljes runbookot és minden
 * aktív tanult szabályt fűzte — a kivonatoló, a vak megoldó és a lektor is „legalább 45 feladat, 75 kvíz” utasítást és
 * bank-szabályokat kapott, a hívás legvégén, a legerősebb helyen.
 *
 * Ez a fájl szándékosan import nélküli (a `shared/lesson-skill.ts` és a szerver skill-moduljai is használják).
 */

/** Minden modellhívás szerepe: a 7 gyártó szerep, a támogató skillek és a lépés-alapú segédszerepek. */
export const PROMPT_ROLES = [
  "extract", "ocr", "pedagogue", "author", "animator", "bank", "lektor", "repair",
  "scope", "corrector", "web-research", "web-extract", "web-author", "web-lektor", "web-repair",
  "html-improve", "html-fix", "creator-analyze", "creator-chat", "quiz-generator",
  "kid-text-fixer", "instruction-checker", "instruction-points", "bank-verifier", "blind-solver", "figure-check",
  "topic-focus", "gate-helper", "quiz-polish",
  // Spec 2026-10-05-s2-tartalom-besorolas: a tantárgyi katalógus tartalom alapú besorolója (saját skill-szöveggel).
  "catalog-classifier",
] as const;
export type PromptRole = (typeof PROMPT_ROLES)[number];

/** A pipeline-lépés neve → alapértelmezett szerep (ha a hívó nem ad meg pontosabbat — §C-V/3: a hívó szerepe az erősebb). */
export function roleForStep(step: string): PromptRole | undefined {
  const map: Record<string, PromptRole> = {
    extract: "extract", ocr: "ocr", pedagogue: "pedagogue", author: "author", animator: "animator", bank: "bank",
    lektor: "lektor", gateHelper: "gate-helper", quizPolish: "quiz-polish",
  };
  return map[step];
}

/** A hívási szerep a lépésből, kötelezően (fail-closed): a pipeline négy modell-lépése és a segédlépések. */
export function requireRoleForStep(step: string): PromptRole {
  const role = roleForStep(step);
  if (!role) throw new Error(`Ismeretlen hívási szerep a(z) „${step}” lépéshez — a hívónak explicit role-t kell adnia.`);
  return role;
}

/**
 * Befagyasztott csomagverzió: a runtime-2 pillanatképpel futó munka a `websuli-runtime-2.ts` archív szövegét kapja.
 * A runtime-1 NEM folytatható (nincs archivált teljes promptja — §C-V/11; a `bundleRunbook` explicit hibát ad).
 * `undefined` = nincs futó workflow (kézi Studio-út, modul-betöltés) → ÉLŐ csomag (review #158: az OCR és a kézi utak
 * korábban tévesen az archívumot kapták volna).
 */
export const FROZEN_BUNDLE_VERSIONS = ["websuli-runtime-2"] as const;
export const isFrozenBundle = (version: string | undefined): boolean =>
  version !== undefined && (FROZEN_BUNDLE_VERSIONS as readonly string[]).includes(version);

const ALL = PROMPT_ROLES as readonly PromptRole[];
/**
 * Bankot ÍRÓ szerepek: a Studio bankcsomagja és a HTML-utak, ahol a modell maga írja a JSON-bankot (web-author,
 * html-improve, html-fix). A javító szerző (`repair`) nem: a bankját a külön `bank` hívás építi (review #158).
 */
const BANK_LIKE: readonly PromptRole[] = ["bank", "web-author", "html-improve", "html-fix"];
const TEACHING: readonly PromptRole[] = ["pedagogue", "author", "repair", "web-author", "web-repair", "creator-chat", "html-improve"];
const REVIEW: readonly PromptRole[] = ["lektor", "web-lektor", "bank-verifier", "instruction-checker"];

/**
 * Tanult szabály (SKILL_RULES kódja) → mely szerep kapja. A régi (befagyasztott) csomag szűrés nélkül adja mindet.
 * Alapelv: egy szabály csak ahhoz megy, aki az adott hibát elkövetheti; a bank-szabály nem jut a lektorhoz, a
 * HTML-szabály nem a kivonatolóhoz.
 */
export const RULE_ROLES: Record<string, readonly PromptRole[]> = {
  prompt_injection: ALL,
  concept_reference: ["pedagogue", "author", "bank", "repair", "web-author", "animator"],
  schema: ALL.filter((r) => r !== "ocr"),
  bank_cardinality: BANK_LIKE,
  sample_score: BANK_LIKE,
  duplicate_question: BANK_LIKE,
  oral_written: BANK_LIKE,
  coverage: ["pedagogue", "author", "repair", "web-author", "lektor"],
  teaching_depth: TEACHING,
  source_fidelity: ["extract", "web-research", "web-extract", "instruction-points", ...TEACHING, ...REVIEW],
  review_evidence: REVIEW,
  html_complete: ["web-author", "html-improve", "html-fix", "creator-chat"],
  citations: ["web-author", "web-research"],
  typography: ["web-author", "html-improve", "html-fix"],
  repair_scope: ["author", "repair", "web-repair", "bank"],
};
export const ruleAppliesToRole = (code: string, role: PromptRole): boolean => (RULE_ROLES[code] ?? ALL).includes(role);

/** A runbook tanítási minőségi szerződését (LESSON_QUALITY_CONTRACT) a tanító és ellenőrző szerepek kapják. */
export const QUALITY_ROLES: ReadonlySet<PromptRole> = new Set<PromptRole>([...TEACHING, "lektor", "web-lektor"]);
/** A „legalább 45 feladat, 75 kvíz…” mondat csak azé, aki bankot ír. */
export const BANK_MINIMUM_ROLES: ReadonlySet<PromptRole> = new Set<PromptRole>(BANK_LIKE);
