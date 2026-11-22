import assert from "node:assert/strict";
import test from "node:test";

import { WORD_LADDER_DE } from "../client/src/data/wordLadder/de";
import { WORD_LADDER_EN } from "../client/src/data/wordLadder/en";
import { WORD_LADDER_FR } from "../client/src/data/wordLadder/fr";
import type { LadderItem, WordLadderLanguage } from "../client/src/data/wordLadder/types";
import type { VocabEntry } from "../client/src/data/vocabBank/types";
import { VOCAB_DE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_FR } from "../client/src/data/vocabBank/vocab-fr";
import { ladderTiersFromBank } from "../client/src/data/wordLadder/banks";
import { ladderBaseTier, pickUnseen, type SeenItem } from "../client/src/game-engine/no-repeat";
import {
  LADDER_GRADE_BANDS,
  LADDER_STEP_COUNT,
  LADDER_STEP_OVERRIDES,
  createLadderStepSession,
  gradedLadderBank,
  ladderDifficultyInput,
  ladderDifficultyScore,
  ladderGradeWindow,
  ladderItemStep,
  ladderStartStep,
  ladderStepBuckets,
  vocabEntryScore,
  vocabEntryStep,
  windowLadderSteps,
} from "../client/src/lib/wordLadderGrading";

/**
 * Szólétra szintezés — terv: docs/specs/2026-11-22-szoletra-szintezes.md (6. A1–A8, A12).
 * A mérce determinisztikus: ugyanaz a tétel mindig ugyanazt a pontot és fokozatot kapja.
 */

const MANUAL: Record<WordLadderLanguage, readonly LadderItem[]> = { en: WORD_LADDER_EN, de: WORD_LADDER_DE, fr: WORD_LADDER_FR };
const VOCAB: Record<WordLadderLanguage, readonly VocabEntry[]> = { en: VOCAB_EN, de: VOCAB_DE, fr: VOCAB_FR };
const LANGS: WordLadderLanguage[] = ["en", "de", "fr"];
const GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Graded = { step: number; score: number; declared: number; phrase: boolean };
function gradedAll(lang: WordLadderLanguage): Graded[] {
  const manual = MANUAL[lang].map((q) => ({
    step: ladderItemStep(q, lang, q.tier),
    score: ladderDifficultyScore(ladderDifficultyInput(q), lang),
    declared: q.tier,
    phrase: q.category === "phrase" || q.category === "everyday",
  }));
  const vocab = VOCAB[lang].map((e) => ({ step: vocabEntryStep(e), score: vocabEntryScore(e), declared: e.level, phrase: e.kind === "phrase" }));
  return [...manual, ...vocab];
}

function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("A1/A3: minden kézi- és szóbank-tétel véges pontot és 0–14 fokozatot kap; a fokozat szintje ≥ a bank szintje; pont ≥ 20 / 40 → szint ≥ 1 / 2", () => {
  const bad: string[] = [];
  for (const lang of LANGS) {
    for (const g of gradedAll(lang)) {
      if (!Number.isFinite(g.score) || g.score < 0) bad.push(`${lang}: pont ${g.score}`);
      if (!Number.isInteger(g.step) || g.step < 0 || g.step >= LADDER_STEP_COUNT) bad.push(`${lang}: fokozat ${g.step}`);
      const tier = Math.floor(g.step / 3);
      if (tier < g.declared) bad.push(`${lang}: lefelé sorolva (${g.declared} → ${tier})`);
      if (g.score >= 20 && tier < 1) bad.push(`${lang}: pont ${g.score} a 0. szinten`);
      if (g.score >= 40 && tier < 2) bad.push(`${lang}: pont ${g.score} a 0–1. szinten`);
    }
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

test("A1: a mérce determinisztikus és a célrészt méri (hiányos mondat a kitöltéssel, „… angolul” kérdésnél a helyes opció)", () => {
  const house = WORD_LADDER_EN.find((q) => q.id === "en0-001")!;
  assert.deepEqual(ladderDifficultyInput(house), { term: "house", sentence: false, category: "topic" });
  const cloze = WORD_LADDER_EN.find((q) => q.focus && /_{3,}/u.test(q.focus))!;
  const input = ladderDifficultyInput(cloze);
  assert.equal(input.sentence, true);
  assert.ok(input.term.includes(cloze.options[cloze.correctIndex]!), input.term);
  assert.equal(ladderDifficultyScore(input, "en"), ladderDifficultyScore(ladderDifficultyInput(cloze), "en"));
  // Névelő nem számít; a német hosszabb szavait a nyelvi szorzó kiegyenlíti.
  assert.equal(ladderDifficultyScore({ term: "der Hund", sentence: false, category: "word" }, "de"),
    ladderDifficultyScore({ term: "Hund", sentence: false, category: "word" }, "de"));
  assert.ok(ladderDifficultyScore({ term: "open the door", sentence: false, category: "phrase" }, "en")
    > ladderDifficultyScore({ term: "door", sentence: false, category: "word" }, "en"));
});

test("A2: a fokozat-szintek átlagpontja szigorúan nő, és minden nyelv × szint × alfok legalább max(10, 5%) tételt tartalmaz", () => {
  const report: string[] = [];
  for (const lang of LANGS) {
    const all = gradedAll(lang);
    const means: number[] = [];
    for (let tier = 0; tier < 5; tier++) {
      const inTier = all.filter((g) => Math.floor(g.step / 3) === tier);
      means.push(inTier.reduce((s, g) => s + g.score, 0) / inTier.length);
      for (let sub = 0; sub < 3; sub++) {
        const n = inTier.filter((g) => g.step % 3 === sub).length;
        if (n < Math.max(10, 0.05 * inTier.length)) report.push(`${lang} ${tier}.${sub}: ${n}/${inTier.length}`);
      }
    }
    for (let i = 1; i < means.length; i++) if (!(means[i]! > means[i - 1]!)) report.push(`${lang}: átlagpont ${means.map((m) => m.toFixed(1)).join(" / ")}`);
  }
  assert.deepEqual(report, []);
});

test("A4: évfolyam-sávonként az osztályozott bank minden fokozatán ≥ 20 tétel; szintenként a 0. alfokon ≥ 20 egyes szó, a 2. alfokon ≥ 20 kifejezés (mindhárom nyelv)", () => {
  const report: string[] = [];
  for (const lang of LANGS) {
    const items: LadderItem[] = [
      ...MANUAL[lang],
      ...VOCAB[lang].map((e): LadderItem => ({
        id: `vocab:${e.id}:target-to-hu`, prompt: `Mit jelent: „${e.term}”?`, focus: e.term, options: [e.hu, "a", "b", "c"], correctIndex: 0,
        tier: e.level, category: e.kind === "phrase" ? "phrase" : "word",
      })),
    ];
    for (const band of LADDER_GRADE_BANDS) {
      const bank = gradedLadderBank(items, lang, band.grades[0]);
      const win = ladderGradeWindow(band.grades[0]);
      for (let step = win.minStep; step <= win.maxStep; step++) {
        const list = bank[step] ?? [];
        const words = list.filter((q) => q.category !== "phrase" && q.category !== "everyday").length;
        const phrases = list.length - words;
        if (list.length < 20) report.push(`${lang} ${band.label} ${step}. fokozat: ${list.length} tétel`);
        if (step % 3 === 0 && words < 20) report.push(`${lang} ${band.label} ${step}. fokozat (0. alfok): ${words} szó`);
        if (step % 3 === 2 && phrases < 20) report.push(`${lang} ${band.label} ${step}. fokozat (2. alfok): ${phrases} kifejezés`);
      }
      for (let step = 0; step < LADDER_STEP_COUNT; step++) {
        if ((step < win.minStep || step > win.maxStep) && (bank[step]?.length ?? 0) > 0) report.push(`${lang} ${band.label}: sávon kívüli ${step}. fokozat nem üres`);
      }
    }
  }
  assert.deepEqual(report, []);
});

test("A5/A6: belépés az évfolyamból — 1. pálya = alapszint legkönnyebb alfoka, pályánként nem csökken, legfeljebb alapszint + 1; ismeretlen évfolyam = 4. évfolyam", () => {
  for (const grade of GRADES) {
    const base = ladderBaseTier(grade);
    const win = ladderGradeWindow(grade);
    assert.equal(win.baseStep, base * 3);
    assert.equal(win.minStep, Math.max(0, base - 1) * 3);
    assert.equal(win.maxStep, Math.min(4, base + 1) * 3 + 2);
    const starts = LEVELS.map((l) => ladderStartStep(grade, l));
    assert.equal(starts[0], base * 3, `${grade}. évf. 1. pálya`);
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i]! >= starts[i - 1]!, `${grade}. évf.: ${starts.join(",")}`);
    assert.ok(starts[9]! <= Math.min(win.maxStep, (base + 1) * 3), `${grade}. évf. 10. pálya: ${starts[9]}`);
    assert.ok(starts[9]! > starts[0]! || win.maxStep === win.baseStep, `${grade}. évf.: a 10. pálya nehezebben indul`);
  }
  // 3. évfolyam: a 10. pálya is legfeljebb az 1. szinten (a régi szabály szerint B2 volt).
  assert.ok(Math.floor(ladderStartStep(3, 10) / 3) <= 1);
  // Ismeretlen / érvénytelen évfolyam és pálya: óvatos alacsony kezdés.
  assert.equal(ladderStartStep(Number.NaN, 1), 0);
  assert.equal(ladderStartStep(1, Number.NaN), 0);
  assert.equal(ladderStartStep(99, 99), ladderStartStep(12, 10));
});

test("A7: 3 jó → +1 fokozat, 2 rossz → −1, megszakított sorozatnál nem nő, és a fokozat a sávban marad", () => {
  const s = createLadderStepSession(5, 1);
  assert.equal(s.step, 3);
  s.answer(true);
  s.answer(true);
  assert.equal(s.step, 3, "két jó még nem emel");
  s.answer(true);
  assert.equal(s.step, 4, "három jó emel");
  s.answer(true);
  s.answer(true);
  s.answer(false);
  s.answer(true);
  s.answer(true);
  assert.equal(s.step, 4, "hibával megszakított sorozat nem emel");
  s.answer(false);
  assert.equal(s.step, 4, "egy hiba még nem könnyít");
  s.answer(false);
  assert.equal(s.step, 3, "két hiba könnyít");
  for (let i = 0; i < 60; i++) s.answer(true);
  assert.equal(s.step, ladderGradeWindow(5).maxStep, "felül a sáv teteje");
  assert.equal(s.tier, Math.floor(ladderGradeWindow(5).maxStep / 3));
  for (let i = 0; i < 60; i++) s.answer(false);
  assert.equal(s.step, ladderGradeWindow(5).minStep, "alul a sáv alja");
  s.reset(3, 1);
  assert.equal(s.step, 0);
  for (let i = 0; i < 60; i++) s.answer(true);
  assert.equal(s.step, 5, "3. évfolyamon legfeljebb az 1. szint teteje");
});

test("A8: 3. évfolyamon bármely pályán, bármely válaszsorozattal a választott tétel legfeljebb 1. szintű (fokozat ≤ 5)", () => {
  const tiers = ladderTiersFromBank(WORD_LADDER_EN);
  const buckets = windowLadderSteps(ladderStepBuckets(tiers, "en"), 3);
  const bad: string[] = [];
  const stepOf = new Map(buckets.flatMap((b, step) => b.map((q) => [q.id, step] as const)));
  for (const level of LEVELS) {
    for (let run = 0; run < 20; run++) {
      const rng = seeded(level * 1000 + run);
      const session = createLadderStepSession(3, level);
      const seen: SeenItem[] = [];
      const pCorrect = run / 19;
      for (let i = 0; i < 40; i++) {
        const q = pickUnseen(buckets, session.step, seen, rng);
        assert.ok(q, "van kérdés");
        const step = stepOf.get(q.id)!;
        if (step > 5) bad.push(`${level}/${run}: ${q.id} (${step})`);
        seen.push({ id: q.id, prompt: q.prompt });
        session.answer(rng() < pCorrect);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("A12: a kézi felülíró tábla létező azonosítókra mutat, 0–14 fokozattal", () => {
  const ids = new Set(LANGS.flatMap((l) => MANUAL[l].map((q) => q.id)));
  for (const [id, step] of Object.entries(LADDER_STEP_OVERRIDES)) {
    assert.ok(ids.has(id), id);
    assert.ok(Number.isInteger(step) && step >= 0 && step < LADDER_STEP_COUNT, `${id}: ${step}`);
  }
});
