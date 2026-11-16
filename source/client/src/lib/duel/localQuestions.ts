/**
 * A gépi ellenfél kérdés-szolgáltatója a kliensen (JM3a): UGYANAZ a szabály, mint a szerver `question-provider`-éé — a
 * saját évfolyam bankja (lusta betöltés, JBb), a közös sáv, seedelt választás, olvasási idő-alapú ablak (≤ 9 mp), és az
 * olvasható tétel előnyben. Teszt-kampóval (csak `VITE_ENABLE_GAME_TEST_HOOKS=1`) egy rögzített tétel is adható, hogy a
 * leghosszabb bank-tétel elférését mindhárom nézetben DOM-ban mérhessük.
 */
import { isGradeBankLoaded, loadGradeBank, loadedGradeItems } from "@/data/gradeQuizBank/loader";
import { GAME_TEST_HOOKS_ENABLED } from "@/game-engine/game-test-hooks";
import { windowMsFor } from "@/game-engine/play/questionDirector";
import { READING_WINDOW_CAP_MS, readingMsFor } from "@/game-engine/play/reading";
import { DUEL_BASE_WINDOW_MS, buildRoundQuestion, duelReadingWindowMs, toDuelQuestion, type DuelBankItem, type DuelQuestion } from "@shared/duel/questions";
import type { RoomQuestionRequest } from "@shared/duel/room-machine";

export function localWindowMs(prompt: string, grade: number, options: readonly string[] = []): number {
  return duelReadingWindowMs(windowMsFor(prompt, grade, DUEL_BASE_WINDOW_MS), readingMsFor(prompt, options, grade));
}

export function localReadable(item: DuelBankItem, grade: number): boolean {
  return readingMsFor(item.prompt, item.options, grade) <= READING_WINDOW_CAP_MS;
}

type ForcedQuestionWindow = Window & { __duelForceQuestion?: { prompt: string; options: string[]; correctIndex: number; explanation?: string } };

export function createLocalQuestionProvider(items: () => readonly DuelBankItem[] = loadedGradeItems): (req: RoomQuestionRequest) => DuelQuestion | null {
  return (req) => {
    const forced = GAME_TEST_HOOKS_ENABLED && typeof window !== "undefined" ? (window as ForcedQuestionWindow).__duelForceQuestion : undefined;
    if (forced) {
      return toDuelQuestion(
        { ...forced, key: `t:${req.round}` },
        { grade: req.grade, orderSeed: `t:${req.round}`, windowMs: localWindowMs(forced.prompt, req.grade, forced.options) },
      );
    }
    return buildRoundQuestion({
      seed: req.seed,
      round: req.round,
      grade: req.grade,
      band: req.band,
      subjects: req.subjects.length > 0 ? req.subjects.slice() : undefined,
      used: new Set(req.used),
      items: items(),
      windowMs: localWindowMs,
      prefer: localReadable,
    });
  };
}

/** A saját évfolyam és a két szomszédja (a választó tartaléka) betöltése a meccs előtt; `false`, ha a saját nem jött le. */
export async function ensureGradeBanks(grade: number): Promise<boolean> {
  const grades = [grade - 1, grade, grade + 1].filter((g) => g >= 3 && g <= 12);
  if (!grades.every(isGradeBankLoaded)) await Promise.allSettled(grades.map((g) => loadGradeBank(g)));
  return isGradeBankLoaded(grade);
}
