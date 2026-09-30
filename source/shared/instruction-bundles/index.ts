import { LESSON_QUALITY_CONTRACT } from "../lesson-quality";
import { RUNTIME_KNOWLEDGE_VERSION, SKILL_RULES } from "../lesson-skill";
import { BANK_MINIMUM_ROLES, QUALITY_ROLES, isFrozenBundle, type PromptRole } from "./roles";
import { BANK_MINIMUM_V2, IAM_V2, QUALITY_V2, RECOVERY_V2, SKILL_RULES_V2, SOUL_V2 } from "./websuli-runtime-2";

/**
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (B0): verziózott utasításcsomag.
 *
 * `INSTRUCTION_BUNDLE_VERSION` SZÁRMAZÁSI azonosító a futás pillanatképében (`SkillSnapshot.runtimeVersion`), nem
 * újragenerálási kulcs. A régi verzió (runtime-1/-2) szövegei a `websuli-runtime-2.ts` archívumból jönnek — így a
 * folyamatban lévő futás akkor is a saját utasítását kapja, ha az élő skillek megváltoznak (H38: az eddigi
 * engedélylista-alapú `runtimePrompt` egy verzióemeléskor kivétellel megállította volna a futó munkát).
 */
export const INSTRUCTION_BUNDLE_VERSION = RUNTIME_KNOWLEDGE_VERSION;

/** A mostani (élő) csomag 45/75-ös runbook-mondata; a bank-szerű szerepek kapják. */
export const BANK_MINIMUM_SENTENCE = BANK_MINIMUM_V2;

export type RunbookTexts = { soul: string; iam: string; recovery: string; quality: string };

/** A runbook szövegei egy adott csomagverzióra és szerepre. Ismeretlen verzió: hiba (az eredeti módszer nem pótolható). */
export function bundleRunbook(version: string, role?: PromptRole): RunbookTexts {
  if (version === "websuli-runtime-1") return { soul: SOUL_V2, iam: IAM_V2, recovery: RECOVERY_V2, quality: "" };
  if (version === "websuli-runtime-2") return { soul: SOUL_V2, iam: IAM_V2, recovery: RECOVERY_V2, quality: QUALITY_V2 + BANK_MINIMUM_V2 };
  if (version !== INSTRUCTION_BUNDLE_VERSION) throw new Error("Ismeretlen futási tudástárverzió; az eredeti módszer nem helyettesíthető.");
  // Élő csomag: szerep nélküli hívás (ismeretlen hívó) a teljes szöveget kapja — a szűrés csak megnevezett szerepre.
  const quality = (!role || QUALITY_ROLES.has(role) ? LESSON_QUALITY_CONTRACT : "")
    + (!role || BANK_MINIMUM_ROLES.has(role) ? BANK_MINIMUM_SENTENCE : "");
  return { soul: SOUL_V2, iam: IAM_V2, recovery: RECOVERY_V2, quality };
}

/** A tanult szabályok katalógusa a csomagverzió szerint (a befagyasztott a régi szövegeket adja). */
export function bundleRuleCatalog(version: string | undefined): Record<string, readonly [string, string]> {
  return isFrozenBundle(version) ? SKILL_RULES_V2 : SKILL_RULES;
}
