/**
 * JM2 — szerveroldali kérdéssor (végrehajtás JM2 7. lépés; terv 10.5 „Vegyes évfolyam”, „Szerver a tekintély online”).
 *
 * A kérdést a SZERVER választja a JM1 `buildRoundQuestion`-jével: játékosonként a saját évfolyamából, a közös sávból,
 * seedelt választással és opció-keveréssel; a válaszablak a J0b `windowMsFor` szabálya (a Párbaj aréna alapablakával).
 *
 * U-JM1-1 igazolva (2026-11-16): a szerver esbuild-bundle-je relatív úton importálja a kliens tiszta adatfájljait és a
 * `questionDirector.ts`-t (a `@/` importjai csak típusok, az esbuild eldobja) — próba-bundle: 22 bemenet, futás OK.
 * A bankot évfolyam-fájlonként, SZINKRON importáljuk (nem a `gradeQuizBank/index.ts` gyűjtőből), mert a kliens bankja
 * évfolyamonkénti lusta betöltésre áll át (JBb); a szervernek az egész bank kell, egyszerre.
 */
import { buildRoundQuestion, type DuelBankItem, type DuelQuestion } from "../../shared/duel/questions";
import type { RoomQuestionRequest } from "../../shared/duel/room-machine";
import { GRADE_03 } from "../../client/src/data/gradeQuizBank/grade-03";
import { GRADE_04 } from "../../client/src/data/gradeQuizBank/grade-04";
import { GRADE_05 } from "../../client/src/data/gradeQuizBank/grade-05";
import { GRADE_06 } from "../../client/src/data/gradeQuizBank/grade-06";
import { GRADE_07 } from "../../client/src/data/gradeQuizBank/grade-07";
import { GRADE_08 } from "../../client/src/data/gradeQuizBank/grade-08";
import { GRADE_09 } from "../../client/src/data/gradeQuizBank/grade-09";
import { GRADE_10 } from "../../client/src/data/gradeQuizBank/grade-10";
import { GRADE_11 } from "../../client/src/data/gradeQuizBank/grade-11";
import { GRADE_12 } from "../../client/src/data/gradeQuizBank/grade-12";
import { windowMsFor } from "../../client/src/game-engine/play/questionDirector";

/** A Párbaj aréna alapablaka (`DuelArena.tsx` `DUEL_BASE_WINDOW_MS`): online is ugyanaz a szabály. */
export const RT_BASE_WINDOW_MS = 6000;

export const SERVER_GRADE_BANK: readonly DuelBankItem[] = [
  ...GRADE_03,
  ...GRADE_04,
  ...GRADE_05,
  ...GRADE_06,
  ...GRADE_07,
  ...GRADE_08,
  ...GRADE_09,
  ...GRADE_10,
  ...GRADE_11,
  ...GRADE_12,
];

export function rtWindowMs(prompt: string, grade: number): number {
  return windowMsFor(prompt, grade, RT_BASE_WINDOW_MS);
}

export function createQuestionProvider(items: readonly DuelBankItem[] = SERVER_GRADE_BANK) {
  return (req: RoomQuestionRequest): DuelQuestion | null =>
    buildRoundQuestion({
      seed: req.seed,
      round: req.round,
      grade: req.grade,
      band: req.band,
      subjects: req.subjects.length > 0 ? req.subjects.slice() : undefined,
      used: new Set(req.used),
      items,
      windowMs: rtWindowMs,
    });
}
