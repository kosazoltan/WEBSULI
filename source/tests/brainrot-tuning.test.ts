import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  BRAIN_ROT_MIN_SIZE,
  brainRotAgeMs,
  brainRotLifetimeFor,
  brainRotSizeFor,
  brainRotSpeedScaleFor,
  pickGradeSlotWithVocab,
} from "../client/src/lib/brainRotTuning";
import { createGradeQuizSeen, isGradeQuizSeen, pickGradeQuiz } from "../client/src/game-engine/gradeQuiz";
import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank";

/**
 * S8 — a Brain Rot lények mérete, élettartama és sebessége (terv 4.6/5; végrehajtás S8 / 2–3. lépés).
 * Az elvárt értékek a szabályból számolva (kommentben a számítás), nem a kimenetből.
 */

const half = () => 0.5;

test("méret: 3. évfolyam, 360×640-es tábla, rng 0,5 → 80", () => {
  // base = clamp(round(360 × 0,16) = 58, 64, 112) = 64; × 1,25 (≤ 4. évf.) × (0,9 + 0,5 × 0,2 = 1,0) = 80.
  assert.equal(brainRotSizeFor({ grade: 3, boardW: 360, boardH: 640 }, half), 80);
});

test("méret: 10. évfolyam, 1366×768-as tábla, rng 0,5 → 101", () => {
  // base = clamp(round(768 × 0,16) = 123, 64, 112) = 112; × 0,9 (≥ 9. évf.) × 1,0 = 100,8 → 101.
  assert.equal(brainRotSizeFor({ grade: 10, boardW: 1366, boardH: 768 }, half), 101);
});

test("méret: ismeretlen évfolyam a ≥ 9. évfolyam szorzóját kapja (0,9)", () => {
  // base = 64 (360-as rövid oldal); 64 × 0,9 = 57,6 → 58.
  assert.equal(brainRotSizeFor({ grade: null, boardW: 360, boardH: 640 }, half), 58);
  assert.equal(brainRotSizeFor({ grade: undefined, boardW: 360, boardH: 640 }, half), 58);
});

test("méret: a véletlen szórás ±10% (rng 0 → 0,9×, rng 1 → 1,1×)", () => {
  // 7. évfolyam, base = clamp(round(500 × 0,16) = 80, 64, 112) = 80; × 1,0 × 0,9 = 72; × 1,1 = 88.
  assert.equal(brainRotSizeFor({ grade: 7, boardW: 500, boardH: 900 }, () => 0), 72);
  assert.equal(brainRotSizeFor({ grade: 7, boardW: 500, boardH: 900 }, () => 1), 88);
});

test("méret: minden eredmény ≥ 56, és kis táblán is elfér (legfeljebb a rövid oldal fele, de ≥ 56)", () => {
  const rngs = [() => 0, half, () => 0.999];
  for (const grade of [null, 1, 3, 4, 5, 6, 7, 8, 9, 12]) {
    for (const [w, h] of [[0, 0], [100, 80], [320, 200], [360, 640], [390, 844], [844, 390], [1366, 768], [2560, 1440]]) {
      for (const rng of rngs) {
        const s = brainRotSizeFor({ grade, boardW: w, boardH: h }, rng);
        assert.ok(s >= BRAIN_ROT_MIN_SIZE, `grade=${grade} ${w}×${h}: ${s} < 56`);
        assert.ok(s <= Math.max(BRAIN_ROT_MIN_SIZE, Math.floor(Math.min(w, h) / 2)), `grade=${grade} ${w}×${h}: ${s} nem fér el`);
      }
    }
  }
  // 200 px magas fekvő tábla: base 64 × 1,25 = 80 > 200 / 2 = 100? nem — elfér; 150 px-nél 75-re vágódik.
  assert.equal(brainRotSizeFor({ grade: 3, boardW: 600, boardH: 150 }, half), 75);
});

test("élettartam: 3 / 5 / 7 / 11. évfolyam → 9000 / 7500 / 6500 / 6000 ms; ismeretlen → 6000", () => {
  assert.equal(brainRotLifetimeFor(3), 9000);
  assert.equal(brainRotLifetimeFor(5), 7500);
  assert.equal(brainRotLifetimeFor(7), 6500);
  assert.equal(brainRotLifetimeFor(11), 6000);
  assert.equal(brainRotLifetimeFor(null), 6000);
  assert.equal(brainRotLifetimeFor(4), 9000);
  assert.equal(brainRotLifetimeFor(6), 7500);
  assert.equal(brainRotLifetimeFor(8), 6500);
  assert.equal(brainRotLifetimeFor(9), 6000);
});

test("sebesség: ≤ 4 → 0,6; 5–6 → 0,8; különben 1", () => {
  assert.equal(brainRotSpeedScaleFor(3), 0.6);
  assert.equal(brainRotSpeedScaleFor(5), 0.8);
  assert.equal(brainRotSpeedScaleFor(6), 0.8);
  assert.equal(brainRotSpeedScaleFor(7), 1);
  assert.equal(brainRotSpeedScaleFor(12), 1);
  assert.equal(brainRotSpeedScaleFor(undefined), 1);
});

test("monotonitás: kisebb évfolyam ≥ méret és élettartam, ≤ sebesség", () => {
  for (let g = 1; g < 12; g++) {
    for (const [w, h] of [[360, 640], [844, 390], [1366, 768]]) {
      assert.ok(
        brainRotSizeFor({ grade: g, boardW: w, boardH: h }, half) >= brainRotSizeFor({ grade: g + 1, boardW: w, boardH: h }, half),
        `méret ${g} vs ${g + 1} @ ${w}×${h}`,
      );
    }
    assert.ok(brainRotLifetimeFor(g) >= brainRotLifetimeFor(g + 1), `élettartam ${g} vs ${g + 1}`);
    assert.ok(brainRotSpeedScaleFor(g) <= brainRotSpeedScaleFor(g + 1), `sebesség ${g} vs ${g + 1}`);
  }
});

test("kor: a kvíz / szünet alatt nem telik (a hibajavítás)", () => {
  // Születés t=1000-kor, addig 0 befagyott idő.
  const base = { spawnTime: 1000, pausedTotalAtSpawn: 0 };
  // Szünet nélkül: t=4000 → 3000 ms.
  assert.equal(brainRotAgeMs({ ...base, now: 4000, pausedTotal: 0, pausedAt: null }), 3000);
  // t=2000-től kvíz fut: t=10 000-kor a kor még mindig 1000 ms (a kvíz 8 s-a nem számít).
  assert.equal(brainRotAgeMs({ ...base, now: 10_000, pausedTotal: 0, pausedAt: 2000 }), 1000);
  // A kvíz t=10 000-kor véget ért (8000 ms befagyott), t=11 000-kor a kor 2000 ms.
  assert.equal(brainRotAgeMs({ ...base, now: 11_000, pausedTotal: 8000, pausedAt: null }), 2000);
  // A születés ELŐTTI befagyás nem vonódik le: t=20 000-kor született, amikor a futás összes befagyott ideje 8000 volt.
  assert.equal(brainRotAgeMs({ now: 21_000, spawnTime: 20_000, pausedTotal: 8000, pausedTotalAtSpawn: 8000, pausedAt: null }), 1000);
  // Soha nem negatív.
  assert.equal(brainRotAgeMs({ now: 900, spawnTime: 1000, pausedTotal: 0, pausedTotalAtSpawn: 0, pausedAt: null }), 0);
});

/* ---------------- forrásőr: a lap tényleg ezeket használja (kommentek nélkül, #183) ---------------- */

function pageCode(): string {
  const src = readFileSync(fileURLToPath(new URL("../client/src/pages/BrainRotSteal.tsx", import.meta.url)), "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** A forrás egészét nem írjuk ki a hibaüzenetbe (több tízezer karakter) — csak a hiányzó mintát. */
function has(code: string, re: RegExp, msg: string) {
  assert.ok(re.test(code), msg);
}

test("lap: a méret, az élettartam, a sebesség és a kor a hangolóból jön", () => {
  const code = pageCode();
  has(code, /from "@\/lib\/brainRotTuning"/, "nincs brainRotTuning import");
  has(code, /brainRotSizeFor\(/, "nincs brainRotSizeFor( hívás");
  has(code, /brainRotLifetimeFor\(/, "nincs brainRotLifetimeFor( hívás");
  has(code, /brainRotSpeedScaleFor\(/, "nincs brainRotSpeedScaleFor( hívás");
  has(code, /brainRotAgeMs\(/, "nincs brainRotAgeMs( hívás");
  assert.ok(!/randInt\(60,\s*80\)/.test(code), "a régi rögzített 60–80 px-es méret visszajött");
  assert.ok(!/Date\.now\(\)\s*-\s*\w+\.spawnTime/.test(code), "a kor újra a falióra szerint telik (kvíz alatt is)");
});

test("lap: az évfolyam-bank kérdés-helye a fogyást nyilvántartó segéden át megy (review #424)", () => {
  const code = pageCode();
  has(code, /pickGradeSlotWithVocab\(\{\s*pick: \(\) => pickGradeQuiz\(\{ grade: sharedGrade/, "a lap nem a pickGradeSlotWithVocab-ot használja");
});

/* ---------- szimuláció: a szóbankos kiváltás nem akasztja meg a többtantárgyas választást (review #424) ---------- */

function simulate(grade: number, band: number) {
  const seen = createGradeQuizSeen();
  const inGrade = GRADE_QUIZ_ITEMS.filter((q) => q.grade === grade);
  const picks: Array<{ subject: string; tier: number; vocab: boolean }> = [];
  let vocabN = 0;
  // Felső korlát: a hibás változat (a kiváltott angol tétel nem fogy) itt végtelen angol sorozatot adna.
  for (let i = 0; i < inGrade.length + 5; i++) {
    const slot = pickGradeSlotWithVocab({
      pick: () => pickGradeQuiz({ grade, band, seen, rng: () => 0.37 }),
      seen,
      vocabNext: () => ({ id: `vocab-${vocabN++}` }),
    });
    if (!slot) break;
    const item = slot.kind === "vocab" ? slot.replaced : slot.item;
    if (item.grade !== grade) break;
    picks.push({ subject: item.subject, tier: item.tier, vocab: slot.kind === "vocab" });
  }
  return { inGrade, picks, seen };
}

for (const [grade, band] of [[3, 0.9], [3, 0.1], [7, 0.5], [12, 0.9]] as const) {
  test(`szimuláció: ${grade}. évf., sáv ${band} — minden sáv minden tétele sorra kerül, a tantárgy-arány nem torzul`, () => {
    const { inGrade, picks, seen } = simulate(grade, band);
    assert.ok(inGrade.length > 0, "üres évfolyam-bank — a minta elavult");
    // 1) Az évfolyam MINDEN tétele (mindhárom nehézségi sávból) pontosan egyszer került sorra.
    assert.equal(picks.length, inGrade.length, `${picks.length} húzás ${inGrade.length} tételre (a hibás változat itt ugyanazt az angol helyet ismétli)`);
    for (const q of inGrade) assert.ok(isGradeQuizSeen(seen, q), `nem fogyott: ${q.id}`);
    // 2) A tantárgyak aránya = a bank aránya (az angol helyek a szóbankból jöttek, a többi tantárgy nem szorult ki).
    const count = (arr: Array<{ subject: string }>, s: string) => arr.filter((x) => x.subject === s).length;
    for (const s of new Set(inGrade.map((q) => q.subject))) {
      assert.equal(count(picks, s), count(inGrade, s), `${s}: ${count(picks, s)} ≠ ${count(inGrade, s)}`);
    }
    assert.equal(picks.filter((p) => p.vocab).length, count(inGrade, "english"), "minden angol hely a szóbankból jött");
    // 3) A sávok sorban fogynak: egy sáv tételei után nem tér vissza egy korábban elhagyott sávra.
    const order: number[] = [];
    for (const p of picks) if (order[order.length - 1] !== p.tier) order.push(p.tier);
    assert.equal(new Set(order).size, order.length, `a sávok sorrendje ugrál: ${order.join(" → ")}`);
  });
}

test("szimuláció: szóbank nélkül (vocabNext → null) a kézi angol tétel megy, és az is fogy", () => {
  const seen = createGradeQuizSeen();
  const first = pickGradeSlotWithVocab({
    pick: () => pickGradeQuiz({ grade: 3, band: 0.9, seen, subjects: ["english"] }),
    seen,
    vocabNext: () => null,
  });
  assert.equal(first?.kind, "grade");
  assert.ok(first && first.kind === "grade" && isGradeQuizSeen(seen, first.item));
});

test("lap: mobilos keret, szünet és visszajelzés (terv 4.5)", () => {
  const code = pageCode();
  for (const name of ["GameShell", "GameHud", "PauseMenu", "ResultScreen", "StartScreen"]) {
    has(code, new RegExp(`<${name}\\b`), `${name} hiányzik`);
  }
  has(code, /useHaptics\(/, "nincs useHaptics(");
  for (const kind of ["hit", "success", "error"]) has(code, new RegExp(`haptics\\("${kind}"\\)`), `nincs haptics("${kind}")`);
  has(code, /if \(phase !== "play" \|\| paused\) return;/, "az időzítő / rAF szünetben is fut");
  has(code, /testId="br-over"/, "nincs br-over eredmény-testid");
  has(code, /startLabel=\{?[`"]Vadászat indítása!/, "a startLabel nem „Vadászat indítása!”");
});
