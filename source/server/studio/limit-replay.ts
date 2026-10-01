import { applyLimitRelaxation, limitAcceptance, reconcileBankWithTeaching } from "./limit-policy";
import { checkCoverageGate, type MapConcept } from "./coverage";
import { applyTopicFocus, type TopicFocus } from "./topic-focus";
import { openBankFindingFlags, resolveChoiceGate } from "./step-runner";
import { disableUnreachableProba } from "../../shared/lesson-arc";
import { lessonSchema, type Lesson } from "../../shared/lesson-schema";
import { experienceProblems } from "../../shared/lesson-experience-validation";
import { verifyLessonSkillBank } from "../../shared/lesson-skill-checks";
import { DEFAULT_REWARD_POLICY } from "../../shared/reward-policy";

/**
 * Spec 2026-10-01-gyokerok-egyben (2.4): a kapu KÖRLIMIT-ágának determinisztikus visszajátszása egy rögzített futáson —
 * modellhívás és hálózat nélkül. Ugyanazok a függvények, ugyanabban a sorrendben, mint a `runGate` limit-ága:
 * egyválasztós/limit-kivétel (`resolveChoiceGate`) → fedettség → 95/80 elfogadás (megalapozatlan címke/blokk levétele) →
 * Próba → a bank igazítása a megmaradt tanításhoz → publikálási padló → bankkapu. Új kapu-/lazítási szabály csak ezzel és
 * rögzített fixture-rel együtt kerülhet be (tests/limit-replay.test.ts).
 */
export type ReplayFixture = {
  jobId: string;
  lesson: unknown;
  choiceFlags?: unknown[];
  bankOpenFindings?: unknown;
  topicFocus?: TopicFocus | null;
  instructionConcepts?: MapConcept[];
  concepts: MapConcept[];
  /** Review #177: a rögzített futás ELVÁRT kimenete — a visszajátszó és a teszt csak az ettől eltérő eredményt tekinti hibának. */
  expected?: { publishable: boolean; stage?: ReplayResult["stage"]; note?: string };
};

export type ReplayResult = {
  publishable: boolean;
  /** Hol állt meg (vagy "ok"). */
  stage: "schema" | "choice" | "acceptance" | "shape" | "bank" | "ok";
  reason?: string;
  removed: string[];
  removedBlocks: string[];
  removedItems: string[];
  limitRelaxed: boolean;
  lesson?: Lesson;
};

const measure = (l: Lesson) => [...experienceProblems(l), ...verifyLessonSkillBank(l.experience, l.subject, l.sections).problems];

/** Igaz, ha a visszajátszás a fixture-ben rögzített elvárással egyezik (elvárás nélkül: publikálás az elvárás). */
export function replayMatchesExpectation(fixture: ReplayFixture, result: ReplayResult): boolean {
  const expected = fixture.expected ?? { publishable: true };
  if (expected.publishable) return result.publishable;
  return !result.publishable && (!expected.stage || result.stage === expected.stage);
}

export function replayLimitGate(fixture: ReplayFixture): ReplayResult {
  const parsedLesson = lessonSchema.safeParse(fixture.lesson);
  if (!parsedLesson.success) return { publishable: false, stage: "schema", reason: parsedLesson.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), removed: [], removedBlocks: [], removedItems: [], limitRelaxed: false };
  const lesson = parsedLesson.data;
  const choice = resolveChoiceGate(lesson, [...(fixture.choiceFlags ?? []), ...openBankFindingFlags(lesson, fixture.bankOpenFindings)]);
  if ("error" in choice) return { publishable: false, stage: "choice", reason: choice.error, removed: [], removedBlocks: [], removedItems: [], limitRelaxed: false };
  const focused = applyTopicFocus({ concepts: fixture.concepts }, fixture.topicFocus ?? null);
  const known = new Set(focused.concepts.map((c) => c.localId));
  const concepts = [...focused.concepts, ...(fixture.instructionConcepts ?? []).filter((c) => c?.localId && !known.has(c.localId))];
  const arc = { minChecksForProba: DEFAULT_REWARD_POLICY.minCorrectForCoupon };
  // Review #177: az éles kapu a körlimiten a fedettség mérése ELŐTT kikapcsolja az elérhetetlen Próbát (step-runner, noAuthorRepair ág).
  let candidate = disableUnreachableProba(choice.lesson, arc).lesson;
  let removedBlocks: string[] = [], removedItems: string[] = [];
  const coverage = checkCoverageGate(candidate, concepts);
  if (!coverage.ok) {
    const acceptance = limitAcceptance(candidate, concepts, coverage);
    if (!acceptance.ok) return { publishable: false, stage: "acceptance", reason: acceptance.reason ?? `core ${Math.round(acceptance.core * 100)}%, supporting ${Math.round(acceptance.supporting * 100)}%`, removed: choice.removed, removedBlocks: acceptance.removedBlocks, removedItems: [], limitRelaxed: !!choice.limitRelaxed };
    removedBlocks = acceptance.removedBlocks;
    if (acceptance.stripped) {
      const reparsed = lessonSchema.safeParse(acceptance.lesson);
      if (!reparsed.success) return { publishable: false, stage: "shape", reason: reparsed.error.issues.slice(0, 3).map((i) => i.message).join("; "), removed: choice.removed, removedBlocks, removedItems: [], limitRelaxed: !!choice.limitRelaxed };
      const fit = reconcileBankWithTeaching(disableUnreachableProba(reparsed.data, arc).lesson);
      removedItems = fit.removedItems;
      candidate = fit.removedItems.length ? applyLimitRelaxation(fit.lesson, fit.trimSections) : fit.lesson;
    }
  }
  const problems = measure(candidate);
  const limitRelaxed = !!candidate.experience?.bankPlan?.limitRelaxed;
  if (problems.length) return { publishable: false, stage: "bank", reason: problems.join("; ").slice(0, 600), removed: choice.removed, removedBlocks, removedItems, limitRelaxed };
  return { publishable: true, stage: "ok", removed: choice.removed, removedBlocks, removedItems, limitRelaxed, lesson: candidate };
}
