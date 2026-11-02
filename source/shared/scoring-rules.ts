/**
 * Spec 2026-10-21-ciklus6 (review #357): a gyártási utasítás „PONTOZÁSI SZABÁLY:” kezdetű sorai — a banképítő (a rubrikát író modell)
 * kötelező követelményként kapja; a forrásolvasó a teljes utasítást látja.
 */
export const SCORING_RULE_MARK = "PONTOZÁSI SZABÁLY:";

export const scoringRulesOf = (instruction?: string): string =>
  (instruction ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith(SCORING_RULE_MARK)).join("\n");
