import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import {
  bandShiftForDifficulty,
  createGradeQuizSeen,
  difficultyForGrade,
  gradeForGame,
  isGradeQuizSeen,
  markGradeQuizSeen,
  normalizePrompt,
  pickGradeQuiz,
  pickUnseenMaterial,
  tierForBand,
} from "../client/src/game-engine/gradeQuiz";
import type { GradeQuizItem, GradeSubject } from "../client/src/data/gradeQuizBank/types";
import { makeRng } from "../client/src/lib/tornado/questions";

/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-jatekok-3-12-evfolyam.md), 2–3. döntés.
 *
 * The selector is tested against a small injected fixture, never against GRADE_QUIZ_ITEMS:
 * the shared bank is filled by a parallel slice, and these rules must hold for any content.
 */

function item(grade: number, subject: GradeSubject, tier: 1 | 2 | 3, n: number, prompt?: string): GradeQuizItem {
  const id = `g${String(grade).padStart(2, "0")}-${subject}-${String(n).padStart(3, "0")}`;
  return {
    id,
    grade,
    subject,
    tier,
    prompt: prompt ?? `Kérdés ${id}`,
    options: ["a", "b", "c", "d"],
    correctIndex: 0,
    explanation: `Magyarázat a(z) ${id} tételhez, legalább harminc karakter.`,
  };
}

/** 3 tiers × 2 items for math+english on grades 6, 7, 8; plus a lone grade-3 history item. */
function fixture(): GradeQuizItem[] {
  const out: GradeQuizItem[] = [];
  for (const grade of [6, 7, 8]) {
    for (const subject of ["math", "english"] as const) {
      let n = 1;
      for (const tier of [1, 2, 3] as const) {
        out.push(item(grade, subject, tier, n++));
        out.push(item(grade, subject, tier, n++));
      }
    }
  }
  out.push(item(3, "history", 2, 1));
  return out;
}

const fixed = (v: number) => () => v;

test("tierForBand: a terv határai (<0.4 → 1, <0.7 → 2, különben 3)", () => {
  assert.equal(tierForBand(0), 1);
  assert.equal(tierForBand(0.39), 1);
  assert.equal(tierForBand(0.4), 2);
  assert.equal(tierForBand(0.69), 2);
  assert.equal(tierForBand(0.7), 3);
  assert.equal(tierForBand(1), 3);
  assert.equal(tierForBand(Number.NaN), 1);
});

test("évfolyam-elsőbbség: amíg van nem látott, csak a játékos évfolyamából kérdez", () => {
  const items = fixture();
  const seen = createGradeQuizSeen();
  for (let i = 0; i < 12; i++) {
    const q = pickGradeQuiz({ grade: 7, band: 0.5, seen, rng: makeRng(i + 1), items });
    assert.ok(q, "van még 7. évfolyamos tétel");
    assert.equal(q.grade, 7);
    markGradeQuizSeen(seen, q);
  }
});

test("szint a sáv szerint, hiány esetén a szomszédos szint", () => {
  const items = fixture();
  assert.equal(pickGradeQuiz({ grade: 7, band: 0.1, seen: createGradeQuizSeen(), rng: fixed(0), items })?.tier, 1);
  assert.equal(pickGradeQuiz({ grade: 7, band: 0.5, seen: createGradeQuizSeen(), rng: fixed(0), items })?.tier, 2);
  assert.equal(pickGradeQuiz({ grade: 7, band: 0.9, seen: createGradeQuizSeen(), rng: fixed(0), items })?.tier, 3);

  // Only tier 3 exists → band 0.1 falls to the neighbour, not to another grade.
  const onlyHard = [item(9, "math", 3, 1), item(9, "math", 3, 2)];
  const q = pickGradeQuiz({ grade: 9, band: 0.1, seen: createGradeQuizSeen(), rng: fixed(0), items: onlyHard });
  assert.equal(q?.tier, 3);
  assert.equal(q?.grade, 9);

  // Tier 1 exhausted → tier 2 before tier 3.
  const mixed = [item(9, "math", 1, 1), item(9, "math", 2, 2), item(9, "math", 3, 3)];
  const seen = createGradeQuizSeen();
  markGradeQuizSeen(seen, mixed[0]!);
  assert.equal(pickGradeQuiz({ grade: 9, band: 0.1, seen, rng: fixed(0), items: mixed })?.tier, 2);

  // Tier 3 exhausted → tier 2 before tier 1.
  const seen3 = createGradeQuizSeen();
  markGradeQuizSeen(seen3, mixed[2]!);
  assert.equal(pickGradeQuiz({ grade: 9, band: 0.95, seen: seen3, rng: fixed(0), items: mixed })?.tier, 2);
});

test("ismétlés-tilalom azonosító ÉS normalizált prompt szerint", () => {
  const items = [
    item(5, "english", 1, 1, "What is  the capital of Hungary?"),
    item(5, "english", 1, 2, "what is the CAPITAL of hungary? "),
    item(5, "english", 1, 3, "Egy másik kérdés"),
  ];
  const seen = createGradeQuizSeen();
  const got: string[] = [];
  for (;;) {
    const q = pickGradeQuiz({ grade: 5, band: 0.2, seen, rng: fixed(0), items });
    if (!q) break;
    got.push(q.id);
    markGradeQuizSeen(seen, q);
  }
  assert.equal(got.length, 2, `csak két különböző prompt van, kapott: ${got.join(",")}`);
  assert.equal(normalizePrompt("  What is  the capital of Hungary? "), normalizePrompt("what is the CAPITAL of hungary?"));

  // A prompt seen from another source (e.g. the game's own bank) also blocks the item.
  const seen2 = createGradeQuizSeen();
  markGradeQuizSeen(seen2, { prompt: "EGY MÁSIK KÉRDÉS" });
  assert.ok(isGradeQuizSeen(seen2, items[2]!));
});

test("kimerült évfolyam → előbb grade-1, aztán grade+1, végül null", () => {
  const items = fixture();
  const seen = createGradeQuizSeen();
  const order: number[] = [];
  for (;;) {
    const q = pickGradeQuiz({ grade: 7, band: 0.5, subjects: ["math"], seen, rng: makeRng(5), items });
    if (!q) break;
    order.push(q.grade);
    markGradeQuizSeen(seen, q);
  }
  assert.deepEqual(order, [...Array(6).fill(7), ...Array(6).fill(6), ...Array(6).fill(8)]);
});

test("subjects szűrő: csak a megadott tárgy; üres szűrő = minden tárgy", () => {
  const items = fixture();
  for (let i = 0; i < 20; i++) {
    const q = pickGradeQuiz({ grade: 8, band: Math.random(), subjects: ["english"], seen: createGradeQuizSeen(), items });
    assert.equal(q?.subject, "english");
  }
  const subjects = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const q = pickGradeQuiz({ grade: 8, band: 0.5, subjects: [], seen: createGradeQuizSeen(), rng: makeRng(i), items });
    if (q) subjects.add(q.subject);
  }
  assert.deepEqual([...subjects].sort(), ["english", "math"]);
  // A subject absent from the grade and its neighbours yields null (the game skips it).
  assert.equal(pickGradeQuiz({ grade: 8, band: 0.5, subjects: ["science"], seen: createGradeQuizSeen(), items }), null);
});

test("üres bank → null; érvénytelen évfolyam → null", () => {
  assert.equal(pickGradeQuiz({ grade: 7, band: 0.5, seen: createGradeQuizSeen(), items: [] }), null);
  assert.equal(pickGradeQuiz({ grade: 2, band: 0.5, seen: createGradeQuizSeen(), items: fixture() }), null);
  assert.equal(pickGradeQuiz({ grade: Number.NaN, band: 0.5, seen: createGradeQuizSeen(), items: fixture() }), null);
});

test("gradeForGame: 1–2 és hiányzó évfolyam → saját bank (null), 3–12 → közös bank", () => {
  for (const g of [null, undefined, 0, 1, 2, 13, 2.5, Number.NaN]) assert.equal(gradeForGame(g as number | null | undefined), null);
  for (let g = 3; g <= 12; g++) assert.equal(gradeForGame(g), g);
});

test("Szökőár: nehézség alapértéke az évfolyamból, a gomb eltolja a sávot", () => {
  for (const g of [3, 4, 5]) assert.equal(difficultyForGrade(g), "easy");
  for (const g of [6, 7, 8]) assert.equal(difficultyForGrade(g), "normal");
  for (const g of [9, 10, 11, 12]) assert.equal(difficultyForGrade(g), "hard");
  for (const g of [null, 1, 2, 13]) assert.equal(difficultyForGrade(g), null);
  assert.ok(bandShiftForDifficulty("easy") < 0);
  assert.equal(bandShiftForDifficulty("normal"), 0);
  assert.ok(bandShiftForDifficulty("hard") > 0);
});

test("pickUnseenMaterial: a tananyag-kvíz elsőbbsége, látottat nem ismétel", () => {
  const material = [
    { id: "m1", prompt: "Tananyag egy" },
    { id: "m2", prompt: "Tananyag kettő" },
  ];
  const seen = createGradeQuizSeen();
  const first = pickUnseenMaterial(material, seen);
  assert.equal(first?.id, "m1");
  markGradeQuizSeen(seen, first!);
  assert.equal(pickUnseenMaterial(material, seen)?.id, "m2");
  markGradeQuizSeen(seen, { prompt: "TANANYAG KETTŐ" });
  assert.equal(pickUnseenMaterial(material, seen), null);
});

test("szimuláció: 2000 futás, egy futásban nincs ismétlés a kimerülésig", () => {
  const items = fixture();
  // Two different ids sharing a normalized prompt must count once.
  items.push(item(7, "math", 2, 99, items.find((q) => q.grade === 7 && q.subject === "math" && q.tier === 2)!.prompt.toUpperCase()));
  const reachable = new Set(
    items.filter((q) => q.grade >= 6 && q.grade <= 8).map((q) => normalizePrompt(q.prompt)),
  );
  for (let run = 0; run < 2000; run++) {
    const rng = makeRng(run * 7919 + 1);
    const seen = createGradeQuizSeen();
    const ids = new Set<string>();
    const prompts = new Set<string>();
    let band = 0.15 + (run % 10) * 0.09;
    for (;;) {
      const q = pickGradeQuiz({ grade: 7, band, seen, rng, items });
      if (!q) break;
      assert.ok(!ids.has(q.id), `run ${run}: ismételt id ${q.id}`);
      const p = normalizePrompt(q.prompt);
      assert.ok(!prompts.has(p), `run ${run}: ismételt prompt ${p}`);
      ids.add(q.id);
      prompts.add(p);
      markGradeQuizSeen(seen, q);
      band = Math.min(1, Math.max(0.15, band + (rng() - 0.5) * 0.3));
    }
    assert.equal(prompts.size, reachable.size, `run ${run}: nem merült ki minden elérhető tétel`);
  }
});

/* ---------------------------- bekötés-őrök ---------------------------- */

const read = (rel: string) => fs.readFileSync(new URL(`../client/src/${rel}`, import.meta.url), "utf8");

for (const [file, gradeExpr] of [
  ["pages/SpaceAsteroidQuiz.tsx", "gradeForGame(grade)"],
  ["pages/BlockCraftQuiz.tsx", "gradeForGame(userGrade)"],
  ["pages/BrainRotSteal.tsx", "gradeForGame(userGrade)"],
  // The Tsunami picker is a ref-reading callback; the ref mirrors the classroom grade every render.
  ["pages/TsunamiEscapeEnglish.tsx", "gradeForGame(userGradeRef.current)"],
] as const) {
  test(`${file}: 3–12. évfolyamon a közös bankból kérdez a játékos évfolyamával`, () => {
    const code = read(file);
    if (file.includes("Tsunami")) assert.match(code, /userGradeRef\.current = userGrade;/);
    assert.match(code, /from "@\/game-engine\/gradeQuiz"/, "nincs gradeQuiz import");
    assert.ok(code.includes(gradeExpr), `hiányzik: ${gradeExpr}`);
    assert.match(code, /pickGradeQuiz\(\{[^}]*grade: sharedGrade/, "a pickGradeQuiz nem a játékos évfolyamát kapja");
    assert.match(code, /markGradeQuizSeen\(/, "a kérdezett tétel nincs megjelölve (ismétlés-tilalom)");
  });
}

test("Aszteroida: a saját évfolyam-választó a közös classroomStore-ba is ír", () => {
  const code = read("pages/SpaceAsteroidQuiz.tsx");
  assert.match(code, /saveClassroomGrade\(g\)/);
});

test("Brain Rot: a kezdő sáv a játékos évfolyamából jön, nem rögzített 4", () => {
  const code = read("pages/BrainRotSteal.tsx");
  assert.match(code, /startingDifficulty\(userGrade \?\? 4\)/);
  assert.doesNotMatch(code, /startingDifficulty\(4\)/);
});

test("Kockavadász: a tárgy-leképezés ismeri a science és history tárgyat", () => {
  const code = read("lib/blockCraftSubjects.ts");
  assert.match(code, /"science"/);
  assert.match(code, /"history"/);
  assert.match(read("pages/BlockCraftQuiz.tsx"), /blockCraftSubjectFromGradeSubject\(/);
});

test("Szökőár: a nehézség alapértéke az évfolyamból jön", () => {
  const code = read("pages/TsunamiEscapeEnglish.tsx");
  assert.match(code, /difficultyForGrade\(/);
  assert.match(code, /bandShiftForDifficulty\(/);
});

test("Tornádó: 1–12 iskolai szint, 7–12-nél a közös bankból", () => {
  const questions = read("lib/tornado/questions.ts");
  assert.match(questions, /export type SchoolLevel = 1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 7 \| 8 \| 9 \| 10 \| 11 \| 12 \| "auto";/);
  assert.match(questions, /pickGradeQuiz\(\{[^}]*grade: sharedGrade/);
  const progress = read("lib/tornado/progress.ts");
  assert.match(progress, /settingsSrc\.school <= 12/);
  const page = read("pages/TornadoHunter200.tsx");
  assert.match(page, /schoolOptions: SchoolLevel\[\] = \[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, "auto"\]/);
  assert.match(page, /gradeSeen: gradeSeenRef\.current/);
});
