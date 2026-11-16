import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank";
import { createGradeQuizSeen, isGradeQuizSeen, pickGradeQuiz } from "../client/src/game-engine/gradeQuiz";
import { pickGradeSlotWithVocab } from "../client/src/lib/brainRotTuning";

/**
 * S10 / A8 — a szóbank által kiváltott angol évfolyam-banki tétel is fogy (a Brain Rot PR #424 mért csapdája).
 * Ha nem fogyna, a `pickGradeQuiz` az első nem üres nehézségi sávból örökké ugyanazt az angol tételt adná, a játék
 * csak angolt kérdezne, és a többi tantárgy / sáv nem kerülne sorra.
 */

function count<T>(xs: readonly T[], f: (x: T) => boolean): number {
  return xs.filter(f).length;
}

test("szimuláció: a tárgyak aránya nem torzul, minden sáv sorra kerül, az angol hely a szóbankból jön", () => {
  for (const grade of [4, 7, 11]) {
    const seen = createGradeQuizSeen();
    const inGrade = GRADE_QUIZ_ITEMS.filter((q) => q.grade === grade);
    assert.ok(inGrade.length > 0, `${grade}. évfolyam üres`);
    const picks: Array<{ subject: string; tier: number; vocab: boolean }> = [];
    let vocabN = 0;
    // Annyi kérdés, ahány tétel az évfolyamon van: a sáv (0,15 → 1-es szint) kimerülése után a választó tovább lép.
    for (let i = 0; i < inGrade.length; i++) {
      const slot = pickGradeSlotWithVocab({
        pick: () => pickGradeQuiz({ grade, band: 0.15, seen, rng: () => 0.37 }),
        seen,
        vocabNext: () => ({ id: `vocab-${vocabN++}` }),
      });
      assert.ok(slot, `${grade}. évf., ${i}. kérdés: nincs tétel`);
      const item = slot.kind === "vocab" ? slot.replaced : slot.item;
      assert.ok(isGradeQuizSeen(seen, item), "a választott (akár kiváltott) tétel nem fogyott");
      picks.push({ subject: item.subject, tier: item.tier, vocab: slot.kind === "vocab" });
    }
    // Minden tétel pontosan egyszer: a tárgyak aránya a bank arányával azonos (nincs torzulás az angol felé).
    for (const subject of new Set(inGrade.map((q) => q.subject))) {
      assert.equal(
        count(picks, (p) => p.subject === subject),
        count(inGrade, (q) => q.subject === subject),
        `${grade}. évf.: ${subject} aránya torzult`,
      );
    }
    // Minden nehézségi sáv sorra került.
    for (const tier of new Set(inGrade.map((q) => q.tier))) {
      assert.ok(picks.some((p) => p.tier === tier), `${grade}. évf.: a(z) ${tier}. sáv nem került sorra`);
    }
    // Az angol hely MINDIG a szóbankból jött, más hely soha.
    assert.equal(count(picks, (p) => p.vocab), count(inGrade, (q) => q.subject === "english"));
    assert.ok(picks.every((p) => p.vocab === (p.subject === "english")));
  }
});

test("szimuláció: az első 40 kérdésből a nem angol tárgyak is sorra kerülnek (nincs angol-ragadás)", () => {
  const seen = createGradeQuizSeen();
  const subjects: string[] = [];
  for (let i = 0; i < 40; i++) {
    const slot = pickGradeSlotWithVocab({
      pick: () => pickGradeQuiz({ grade: 5, band: 0.15, seen }),
      seen,
      vocabNext: () => ({ id: `v${i}` }),
    });
    if (!slot) break;
    subjects.push((slot.kind === "vocab" ? slot.replaced : slot.item).subject);
  }
  assert.ok(new Set(subjects).size >= 3, `csak ${[...new Set(subjects)].join(", ")}`);
  assert.ok(count(subjects, (s) => s === "english") < subjects.length / 2, "az angol aránya elszállt");
});

test("szóbank nélkül (vocabNext → null) a kézi angol tétel megy, és az is fogy", () => {
  const seen = createGradeQuizSeen();
  const slot = pickGradeSlotWithVocab({
    pick: () => pickGradeQuiz({ grade: 3, band: 0.9, seen, subjects: ["english"] }),
    seen,
    vocabNext: () => null,
  });
  assert.ok(slot && slot.kind === "grade");
  assert.equal(slot.item.subject, "english");
  assert.ok(isGradeQuizSeen(seen, slot.item));
});

test("nem angol tételnél a szóbankot nem is kérdezi", () => {
  const seen = createGradeQuizSeen();
  let asked = 0;
  const slot = pickGradeSlotWithVocab({
    pick: () => pickGradeQuiz({ grade: 6, band: 0.5, seen, subjects: ["math"] }),
    seen,
    vocabNext: () => {
      asked++;
      return { id: "x" };
    },
  });
  assert.ok(slot && slot.kind === "grade");
  assert.equal(asked, 0);
});

test("üres bank → null, a szóbankot nem hívja", () => {
  let asked = 0;
  const slot = pickGradeSlotWithVocab({ pick: () => null, seen: createGradeQuizSeen(), vocabNext: () => (asked++, 1) });
  assert.equal(slot, null);
  assert.equal(asked, 0);
});

/* ------------------------------- forrásőr ------------------------------- */

const root = fileURLToPath(new URL("..", import.meta.url));
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const page = stripComments(readFileSync(join(root, "client/src/pages/SpaceAsteroidQuiz.tsx"), "utf8"));

test("forrásőr: a lap a pickGradeSlotWithVocab-ot használja, a szóbankos kérdés a seen-be kerül", () => {
  assert.match(page, /pickGradeSlotWithVocab\(\{\s*pick: \(\) => pickGradeQuiz\(\{ grade: sharedGrade/);
  assert.match(page, /vocab\?\.next\(vocabLevelForGrade\(/);
  // A szóbankos kérdés a futás seen-listájába (a meglévő tartalmi duplikátum-szűrő is látja).
  assert.match(page, /const vq = vocab\?\.next\([^;]*;\s*if \(!vq\) return null;\s*markGradeQuizSeen\(seen, vq\);/);
  // Kézi angol kérdés helyes válasza a közös naplóba.
  assert.match(page, /vocab\?\.markExternal\(q\.options\[q\.correctIndex\]/);
});
