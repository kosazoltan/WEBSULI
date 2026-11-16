import type { GradeQuizItem } from "../../data/gradeQuizBank";
import { markGradeQuizSeen, type GradeQuizSeen } from "../../game-engine/gradeQuiz";

/**
 * S10 / A8 — az évfolyam-bank kérdés-helye szóbankos kiváltással (a Brain Rot PR #424 Codex-leletének mintája).
 *
 * A `pickGradeQuiz` választ; a tétel MINDIG a `seen`-be kerül (fogy) — akkor is, ha angol, és a szóbank váltja ki.
 * Ha a kiváltott tétel nem fogyna, a választó az első nem üres nehézségi sávban ragadna: a sáv nem angol tételeinek
 * elfogyta után ugyanazt az angol tételt választaná újra és újra, a játék csak angolt kérdezne, és soha nem lépne
 * tovább a többi sávra. `vocabNext` a szóbank-forrás hívása (`null`, ha nincs szóbank / nem ad kérdést) — ilyenkor a
 * kézi tétel megy.
 */
export function pickGradeSlotWithVocab<V>(args: {
  pick: () => GradeQuizItem | null;
  seen: GradeQuizSeen;
  vocabNext: () => V | null;
}): { kind: "vocab"; quiz: V; replaced: GradeQuizItem } | { kind: "grade"; item: GradeQuizItem } | null {
  const item = args.pick();
  if (!item) return null;
  markGradeQuizSeen(args.seen, item);
  if (item.subject === "english") {
    const quiz = args.vocabNext();
    if (quiz != null) return { kind: "vocab", quiz, replaced: item };
  }
  return { kind: "grade", item };
}
