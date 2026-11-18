import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { GradeQuizItem } from "../client/src/data/gradeQuizBank/types";
import { createGradeQuizSeen, isGradeQuizSeen, pickGradeSlotWithVocab } from "../client/src/game-engine/gradeQuiz";

/**
 * S13 / E23 — az évfolyam-bank kérdés-helye szóbankos kiváltással EGY közös helyen (`game-engine/gradeQuiz.ts`).
 * A két változat (tárgy nélkül: Brain Rot / Aszteroida / Tornado; tárggyal: a Kockavadász körforgása) viselkedése
 * és az, hogy a játékok innen hívják. A részletes, 4 játékra szabott szimulációk a meglévő tesztekben maradnak
 * (`brainrot-tuning`, `space-asteroid-quiz-slot`, `blockcraft-mobile`, `tornado-vocab-pick`).
 */
const item = (id: string, subject: GradeQuizItem["subject"]): GradeQuizItem => ({
  id,
  grade: 7,
  subject,
  tier: 1,
  prompt: `${id} kérdés`,
  options: ["a", "b", "c", "d"],
  correctIndex: 0,
  explanation: "Magyarázat a teszthez, elég hosszú.",
});

test("tárgy nélkül: angol tétel → szóbank kiváltja, a tétel látott; nem angol → a tétel megy", () => {
  const seen = createGradeQuizSeen();
  const en = pickGradeSlotWithVocab({ pick: () => item("e1", "english"), seen, vocabNext: () => "V" });
  assert.deepEqual(en && en.kind === "vocab" ? [en.quiz, en.replaced.id] : null, ["V", "e1"]);
  assert.ok(isGradeQuizSeen(seen, item("e1", "english")), "a kiváltott tétel nem fogyott (#424)");
  const math = pickGradeSlotWithVocab({ pick: () => item("m1", "math"), seen, vocabNext: () => "V" });
  assert.equal(math?.kind, "grade");
  assert.ok(isGradeQuizSeen(seen, item("m1", "math")));
});

test("tárgy nélkül: nincs tétel → nincs hely (a szóbankot meg sem hívja)", () => {
  let calls = 0;
  const slot = pickGradeSlotWithVocab({ pick: () => null, seen: createGradeQuizSeen(), vocabNext: () => (calls++, "V") });
  assert.equal(slot, null);
  assert.equal(calls, 0);
});

test("tárggyal (Kockavadász): az angol HELY elfogyott bank mellett is a szóbankból kérdez (replaced: null)", () => {
  const slot = pickGradeSlotWithVocab({ subject: "english", pick: () => null, seen: createGradeQuizSeen(), vocabNext: () => "V" });
  assert.deepEqual(slot, { kind: "vocab", quiz: "V", replaced: null });
  const none = pickGradeSlotWithVocab({ subject: "math", pick: () => null, seen: createGradeQuizSeen(), vocabNext: () => "V" });
  assert.equal(none, null);
});

test("szóbank nélkül (null) a kézi tétel megy", () => {
  const slot = pickGradeSlotWithVocab({ pick: () => item("e2", "english"), seen: createGradeQuizSeen(), vocabNext: () => null });
  assert.equal(slot?.kind, "grade");
});

test("forrásőr: a négy játék a közös választót használja, saját változat nincs", () => {
  const root = fileURLToPath(new URL("../client/src/", import.meta.url));
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  for (const p of ["pages/BrainRotSteal.tsx", "pages/SpaceAsteroidQuiz.tsx"]) {
    assert.match(read(p), /pickGradeSlotWithVocab,[\s\S]{0,80}\} from "@\/game-engine\/gradeQuiz";/, p);
  }
  assert.match(read("lib/tornado/questions.ts"), /pickGradeSlotWithVocab\(\{/);
  assert.match(read("lib/blockCraftSubjects.ts"), /return pickGradeSlotWithVocab\(args\);/);
  assert.match(read("lib/brainRotTuning.ts"), /export \{ pickGradeSlotWithVocab \} from "\.\.\/game-engine\/gradeQuiz";/);
});
