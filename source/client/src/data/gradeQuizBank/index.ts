import type { GradeQuizItem } from "./types";
import { GRADE_03 } from "./grade-03";
import { GRADE_04 } from "./grade-04";
import { GRADE_05 } from "./grade-05";
import { GRADE_06 } from "./grade-06";
import { GRADE_07 } from "./grade-07";
import { GRADE_08 } from "./grade-08";
import { GRADE_09 } from "./grade-09";
import { GRADE_10 } from "./grade-10";
import { GRADE_11 } from "./grade-11";
import { GRADE_12 } from "./grade-12";

export * from "./types";

function concatGrades(...grades: readonly (readonly GradeQuizItem[])[]): readonly GradeQuizItem[] {
  return grades.flat();
}

/**
 * Az összes évfolyam tételei egyben — a Node-oldalnak (szerver, egységtesztek, a betöltő Node-homlokzata).
 *
 * A böngészős kód NE innen olvassa a tételeket: a játékok a `loader.ts` évfolyamonkénti lusta darabjait használják
 * (a `game-engine/gradeQuiz.ts` választóján át), így egy játék csak a szükséges évfolyamokat tölti le. A `PURE`
 * jelölés miatt a csomagoló elhagyja ezt az összefűzést (és vele a bankfájlok statikus behúzását), ha egy kliensmodul
 * csak a típusokat / állandókat veszi innen (pl. `GRADE_SUBJECTS`). Őr: `tests/grade-quiz-bank-lazy.test.ts`.
 *
 * Darabszám: a 3–9. évfolyamon évfolyamonként 285 tétel (az eredeti 18 / tárgy + a JBa / JBb bővítés, 019-től),
 * a 10–12. évfolyamon 90 (tárgyanként 18, sávonként 6) — a JBc bővítéséig. A tartalmat a `tests/grade-quiz-bank.test.ts`
 * (szerkezet, számolós ellenőrzés) és a `tests/grade-quiz-bank-coverage.test.ts` (kvóták, olvashatóság, független
 * számoló, szótáras helyesírás-őr) méri; a bővítés folyamata (gyártó → vak megoldó → forrásalapú audit → újra vak
 * megoldás a javítottakon) a `docs/measurements/2026-11-16-evfolyam-bank-*-vakmegoldo.md` jegyzőkönyvekben.
 */
export const GRADE_QUIZ_ITEMS: readonly GradeQuizItem[] = /* @__PURE__ */ concatGrades(
  GRADE_03,
  GRADE_04,
  GRADE_05,
  GRADE_06,
  GRADE_07,
  GRADE_08,
  GRADE_09,
  GRADE_10,
  GRADE_11,
  GRADE_12,
);
